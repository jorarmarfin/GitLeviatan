//! Operaciones de red: fetch, pull (solo fast-forward), push y clone, con progreso y cancelación.

use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};

use super::error::AppError;
use super::process::{run_git, run_git_streaming, Operation, StreamOutput};
use super::sync_error::app_error_from_stderr;
use super::types::{RemoteTag, SyncPhase, SyncProgress};

/// Operaciones en curso, para poder cancelarlas por `operationId`.
#[derive(Default)]
pub struct Operations {
    inner: Mutex<(u64, HashMap<String, Arc<Operation>>)>,
}

impl Operations {
    /// Registra una operación nueva y devuelve su id junto al manejador de cancelación.
    pub fn start(&self) -> (String, Arc<Operation>) {
        let mut inner = self
            .inner
            .lock()
            .expect("registro de operaciones envenenado");
        inner.0 += 1;
        let id = format!("op-{}", inner.0);
        let operation = Arc::new(Operation::default());
        inner.1.insert(id.clone(), operation.clone());
        (id, operation)
    }

    pub fn finish(&self, id: &str) {
        self.inner
            .lock()
            .expect("registro de operaciones envenenado")
            .1
            .remove(id);
    }

    /// Cancela la operación; devuelve `false` si ya no existe (terminó o id desconocido).
    pub fn cancel(&self, id: &str) -> bool {
        let operation = self
            .inner
            .lock()
            .expect("registro de operaciones envenenado")
            .1
            .get(id)
            .cloned();
        match operation {
            Some(operation) => {
                operation.cancel();
                true
            }
            None => false,
        }
    }
}

/// Contexto de una operación: identificador, cancelación y destino de los eventos.
pub struct SyncContext<'a> {
    pub operation_id: &'a str,
    pub operation: &'a Operation,
    pub emit: &'a mut dyn FnMut(SyncProgress),
}

impl SyncContext<'_> {
    fn progress(&mut self, phase: SyncPhase, percent: Option<u8>) {
        (self.emit)(SyncProgress {
            operation_id: self.operation_id.to_string(),
            phase,
            percent,
        });
    }

    /// Ejecuta Git retransmitiendo el progreso. Devuelve el stdout si terminó bien.
    fn run(&mut self, dir: &Path, args: &[&str]) -> Result<Vec<u8>, AppError> {
        // Primer evento inmediato: el frontend aprende el `operationId` para poder cancelar.
        self.progress(SyncPhase::Counting, None);
        let id = self.operation_id.to_string();
        let emit = &mut *self.emit;
        let output = run_git_streaming(dir, args, self.operation, |line| {
            if let Some((phase, percent)) = parse_progress(line) {
                emit(SyncProgress {
                    operation_id: id.clone(),
                    phase,
                    percent,
                });
            }
        })?;
        finish(self, output)
    }
}

fn finish(ctx: &mut SyncContext, output: StreamOutput) -> Result<Vec<u8>, AppError> {
    if output.cancelled {
        return Err(AppError::cancelled());
    }
    if !output.success {
        return Err(app_error_from_stderr(&output.stderr));
    }
    ctx.progress(SyncPhase::Done, Some(100));
    Ok(output.stdout)
}

/// Interpreta una línea de progreso de Git (`--progress`), p. ej.
/// `Receiving objects:  45% (9/20)` o `remote: Counting objects: 100% (5/5), done.`
pub fn parse_progress(line: &str) -> Option<(SyncPhase, Option<u8>)> {
    let line = line.trim_start();
    let line = line.strip_prefix("remote:").unwrap_or(line).trim_start();
    let phase = if line.starts_with("Enumerating objects")
        || line.starts_with("Counting objects")
        || line.starts_with("Compressing objects")
    {
        SyncPhase::Counting
    } else if line.starts_with("Receiving objects") {
        SyncPhase::Receiving
    } else if line.starts_with("Resolving deltas") {
        SyncPhase::Resolving
    } else if line.starts_with("Writing objects") {
        SyncPhase::Sending
    } else {
        return None;
    };
    let percent = line.split_once('%').and_then(|(before, _)| {
        before
            .rsplit(|c: char| !c.is_ascii_digit())
            .next()
            .and_then(|digits| digits.parse::<u8>().ok())
    });
    Some((phase, percent))
}

/// Nombres de remoto y de rama que Git no interpretará como opción.
fn check_ref_arg(kind: &str, value: &str) -> Result<(), AppError> {
    if value.trim().is_empty() || value.starts_with('-') || value.contains(char::is_whitespace) {
        return Err(AppError::invalid_input(format!(
            "El {kind} «{value}» no es válido."
        )));
    }
    Ok(())
}

pub fn fetch(repo: &Path, remote: &str, ctx: &mut SyncContext) -> Result<(), AppError> {
    check_ref_arg("remoto", remote)?;
    ctx.run(repo, &["fetch", "--progress", remote]).map(|_| ())
}

/// `pull --ff-only`: si no es posible avanzar sin merge, falla y no modifica nada.
pub fn pull(
    repo: &Path,
    remote: &str,
    branch: &str,
    ctx: &mut SyncContext,
) -> Result<(), AppError> {
    check_ref_arg("remoto", remote)?;
    check_ref_arg("nombre de rama", branch)?;
    ctx.run(repo, &["pull", "--ff-only", "--progress", remote, branch])
        .map(|_| ())
}

/// `push`; añade `-u` solo si la rama aún no tiene upstream.
pub fn push(
    repo: &Path,
    remote: &str,
    branch: &str,
    ctx: &mut SyncContext,
) -> Result<(), AppError> {
    check_ref_arg("remoto", remote)?;
    check_ref_arg("nombre de rama", branch)?;
    let has_upstream = run_git(
        repo,
        [
            "rev-parse",
            "--abbrev-ref",
            &format!("{branch}@{{upstream}}"),
        ],
    )
    .is_ok();
    let mut args = vec!["push", "--progress"];
    if !has_upstream {
        args.push("-u");
    }
    args.extend([remote, branch]);
    ctx.run(repo, &args).map(|_| ())
}

/// Nombre de tag que Git no interpretará como opción ni como refspec (`:`, comodines).
fn check_tag_arg(name: &str) -> Result<(), AppError> {
    check_ref_arg("tag", name)?;
    if name.contains([':', '*', '?', '[', '\\', '^', '~']) || name.contains("..") {
        return Err(AppError::invalid_input(format!(
            "El tag «{name}» no es válido."
        )));
    }
    Ok(())
}

/// Tags del remoto (`ls-remote --tags`) sin descargarlos. Para los anotados, `target_oid` es
/// el commit al que apuntan (línea pelada `^{}`), no el objeto tag.
pub fn list_remote_tags(
    repo: &Path,
    remote: &str,
    ctx: &mut SyncContext,
) -> Result<Vec<RemoteTag>, AppError> {
    check_ref_arg("remoto", remote)?;
    let stdout = ctx.run(repo, &["ls-remote", "--tags", remote])?;
    let mut tags: Vec<RemoteTag> = Vec::new();
    for line in String::from_utf8_lossy(&stdout).lines() {
        let Some((oid, reference)) = line.split_once('\t') else {
            continue;
        };
        let Some(name) = reference.strip_prefix("refs/tags/") else {
            continue;
        };
        match name.strip_suffix("^{}") {
            Some(peeled) => {
                if let Some(tag) = tags.iter_mut().find(|t| t.name == peeled) {
                    tag.target_oid = oid.to_string();
                }
            }
            None => tags.push(RemoteTag {
                name: name.to_string(),
                target_oid: oid.to_string(),
            }),
        }
    }
    tags.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(tags)
}

/// Descarga los tags del remoto sin sobrescribir los locales que apunten a otro commit.
pub fn fetch_tags(repo: &Path, remote: &str, ctx: &mut SyncContext) -> Result<(), AppError> {
    check_ref_arg("remoto", remote)?;
    ctx.run(repo, &["fetch", "--progress", "--tags", remote])
        .map(|_| ())
}

/// Sube un único tag. Nunca fuerza: si el remoto ya tiene ese nombre en otro commit, falla.
pub fn push_tag(
    repo: &Path,
    remote: &str,
    name: &str,
    ctx: &mut SyncContext,
) -> Result<(), AppError> {
    check_ref_arg("remoto", remote)?;
    check_tag_arg(name)?;
    let reference = format!("refs/tags/{name}");
    ctx.run(repo, &["push", "--progress", remote, &reference])
        .map(|_| ())
        .map_err(|error| {
            let detail = error
                .detail
                .clone()
                .unwrap_or_default()
                .to_ascii_lowercase();
            if detail.contains("already exists") || detail.contains("would clobber") {
                AppError {
                    message: format!(
                        "El tag «{name}» ya existe en el remoto apuntando a otro commit. \
                         No se sobrescribe; elige otro nombre o elimina antes el tag remoto."
                    ),
                    ..error
                }
            } else {
                error
            }
        })
}

/// Elimina un tag del remoto. No toca el tag local.
pub fn delete_remote_tag(
    repo: &Path,
    remote: &str,
    name: &str,
    ctx: &mut SyncContext,
) -> Result<(), AppError> {
    check_ref_arg("remoto", remote)?;
    check_tag_arg(name)?;
    // Git borra un ref inexistente sin fallar (solo avisa), así que se comprueba antes.
    let reference = format!("refs/tags/{name}");
    if ctx
        .run(repo, &["ls-remote", "--tags", remote, &reference])?
        .iter()
        .all(u8::is_ascii_whitespace)
    {
        return Err(AppError::invalid_input(format!(
            "El tag «{name}» no existe en el remoto."
        )));
    }
    let refspec = format!(":{reference}");
    ctx.run(repo, &["push", "--progress", remote, &refspec])
        .map(|_| ())
}

/// Clona `url` en `dest` (que no debe existir o estar vacío). Si se cancela o falla,
/// se elimina el directorio parcial que se haya creado.
pub fn clone(url: &str, dest: &Path, ctx: &mut SyncContext) -> Result<(), AppError> {
    if url.trim().is_empty() || url.starts_with('-') {
        return Err(AppError::invalid_input(
            "La URL del repositorio no es válida.",
        ));
    }
    let existed = dest.exists();
    if existed && !dest.is_dir() {
        return Err(AppError::invalid_input("La carpeta destino no es válida."));
    }
    if existed && std::fs::read_dir(dest).map_or(true, |mut d| d.next().is_some()) {
        return Err(AppError::invalid_input(
            "La carpeta destino ya existe y no está vacía.",
        ));
    }
    let parent = dest
        .parent()
        .ok_or_else(|| AppError::invalid_input("La carpeta destino no es válida."))?;
    std::fs::create_dir_all(parent).map_err(|e| AppError::invalid_input(e.to_string()))?;

    let dest_arg = dest.to_string_lossy();
    let result = ctx.run(parent, &["clone", "--progress", "--", url, &dest_arg]);
    if result.is_err() {
        if existed {
            // Estaba vacío: se vacía de nuevo en lugar de borrar la carpeta del usuario.
            if let Ok(entries) = std::fs::read_dir(dest) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let _ = if path.is_dir() {
                        std::fs::remove_dir_all(&path)
                    } else {
                        std::fs::remove_file(&path)
                    };
                }
            }
        } else {
            let _ = std::fs::remove_dir_all(dest);
        }
    }
    result.map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::super::error::AppErrorKind;
    use super::super::testutil::{commit_file, file_url, git, init_bare, init_repo};
    use super::*;

    /// Ejecuta una función de sync recogiendo los eventos emitidos.
    fn with_ctx<T>(
        operation: &Operation,
        f: impl FnOnce(&mut SyncContext) -> T,
    ) -> (T, Vec<SyncProgress>) {
        let mut events = Vec::new();
        let result = {
            let mut emit = |p: SyncProgress| events.push(p);
            let mut ctx = SyncContext {
                operation_id: "op-test",
                operation,
                emit: &mut emit,
            };
            f(&mut ctx)
        };
        (result, events)
    }

    fn rev(dir: &Path, spec: &str) -> String {
        let out = run_git(dir, ["rev-parse", spec]).unwrap();
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    }

    fn url(dir: &Path) -> String {
        file_url(dir)
    }

    /// Remoto bare + clon local con un commit inicial ya publicado.
    fn remote_and_clone() -> (tempfile::TempDir, tempfile::TempDir) {
        let remote = init_bare();
        let local = init_repo();
        commit_file(local.path(), "a.txt", "uno\n", "inicial");
        git(
            local.path(),
            &["remote", "add", "origin", &url(remote.path())],
        );
        git(local.path(), &["push", "-q", "-u", "origin", "main"]);
        (remote, local)
    }

    /// Segundo clon que publica un commit nuevo en el remoto.
    fn push_from_other_clone(remote: &Path, file: &str) {
        let other = tempfile::tempdir().unwrap();
        git(other.path(), &["clone", "-q", &url(remote), "."]);
        git(other.path(), &["config", "user.name", "Otro"]);
        git(other.path(), &["config", "user.email", "otro@example.com"]);
        git(other.path(), &["config", "commit.gpgsign", "false"]);
        commit_file(other.path(), file, "remoto\n", "desde otro");
        git(other.path(), &["push", "-q", "origin", "main"]);
    }

    #[test]
    fn parses_progress_lines() {
        assert_eq!(
            parse_progress("Receiving objects:  45% (9/20)"),
            Some((SyncPhase::Receiving, Some(45)))
        );
        assert_eq!(
            parse_progress("remote: Counting objects: 100% (5/5), done."),
            Some((SyncPhase::Counting, Some(100)))
        );
        assert_eq!(
            parse_progress("Resolving deltas:   3% (1/30)"),
            Some((SyncPhase::Resolving, Some(3)))
        );
        assert_eq!(
            parse_progress("Writing objects: 100% (3/3), 250 bytes | 250.00 KiB/s, done."),
            Some((SyncPhase::Sending, Some(100)))
        );
        assert_eq!(
            parse_progress("remote: Enumerating objects: 5, done."),
            Some((SyncPhase::Counting, None))
        );
        assert_eq!(parse_progress("From file:///tmp/r"), None);
    }

    #[test]
    fn operations_registry_cancels_by_id() {
        let ops = Operations::default();
        let (id, op) = ops.start();
        assert!(!op.is_cancelled());
        assert!(ops.cancel(&id));
        assert!(op.is_cancelled());
        ops.finish(&id);
        assert!(!ops.cancel(&id));
        assert!(!ops.cancel("nope"));
    }

    #[test]
    fn fetch_brings_remote_commits() {
        let (remote, local) = remote_and_clone();
        push_from_other_clone(remote.path(), "b.txt");
        let before = rev(local.path(), "origin/main");

        let op = Operation::default();
        let (result, events) = with_ctx(&op, |ctx| fetch(local.path(), "origin", ctx));
        result.unwrap();

        assert_ne!(rev(local.path(), "origin/main"), before);
        // El primer evento llega enseguida y el último es `done`.
        assert_eq!(events.first().unwrap().operation_id, "op-test");
        assert_eq!(events.last().unwrap().phase, SyncPhase::Done);
    }

    #[test]
    fn fetch_unknown_remote_is_classified() {
        let local = init_repo();
        commit_file(local.path(), "a.txt", "x\n", "c");
        let op = Operation::default();
        let (result, _) = with_ctx(&op, |ctx| fetch(local.path(), "nope", ctx));
        assert_eq!(result.unwrap_err().kind, AppErrorKind::NotFound);
    }

    #[test]
    fn fetch_missing_path_remote_is_classified() {
        let local = init_repo();
        commit_file(local.path(), "a.txt", "x\n", "c");
        git(
            local.path(),
            &["remote", "add", "origin", "/no/existe/gitleviatan"],
        );
        let op = Operation::default();
        let (result, _) = with_ctx(&op, |ctx| fetch(local.path(), "origin", ctx));
        assert_eq!(result.unwrap_err().kind, AppErrorKind::NotFound);
    }

    #[test]
    fn fetch_rejects_option_like_names() {
        let local = init_repo();
        let op = Operation::default();
        let (result, events) = with_ctx(&op, |ctx| fetch(local.path(), "--upload-pack=x", ctx));
        assert!(result.is_err());
        assert!(events.is_empty());
    }

    #[test]
    fn cancelled_fetch_reports_cancelled() {
        let (_remote, local) = remote_and_clone();
        let op = Operation::default();
        op.cancel();
        let (result, _) = with_ctx(&op, |ctx| fetch(local.path(), "origin", ctx));
        assert_eq!(result.unwrap_err().kind, AppErrorKind::Cancelled);
    }

    #[test]
    fn pull_fast_forwards() {
        let (remote, local) = remote_and_clone();
        push_from_other_clone(remote.path(), "b.txt");

        let op = Operation::default();
        let (result, _) = with_ctx(&op, |ctx| pull(local.path(), "origin", "main", ctx));
        result.unwrap();

        assert!(local.path().join("b.txt").exists());
        assert_eq!(rev(local.path(), "HEAD"), rev(remote.path(), "main"));
    }

    #[test]
    fn pull_diverged_fails_without_touching_anything() {
        let (remote, local) = remote_and_clone();
        push_from_other_clone(remote.path(), "b.txt");
        commit_file(local.path(), "c.txt", "local\n", "local");
        let head = rev(local.path(), "HEAD");

        let op = Operation::default();
        let (result, _) = with_ctx(&op, |ctx| pull(local.path(), "origin", "main", ctx));
        let err = result.unwrap_err();

        assert_eq!(err.kind, AppErrorKind::Git);
        assert!(
            err.message.contains("cambios que no tienes"),
            "{}",
            err.message
        );
        assert_eq!(rev(local.path(), "HEAD"), head);
        assert!(!local.path().join("b.txt").exists());
    }

    #[test]
    fn push_sets_upstream_only_when_missing() {
        let remote = init_bare();
        let local = init_repo();
        commit_file(local.path(), "a.txt", "uno\n", "inicial");
        git(
            local.path(),
            &["remote", "add", "origin", &url(remote.path())],
        );

        let op = Operation::default();
        let (result, _) = with_ctx(&op, |ctx| push(local.path(), "origin", "main", ctx));
        result.unwrap();
        // `-u` dejó configurado el upstream.
        assert_eq!(
            rev(local.path(), "main@{upstream}"),
            rev(local.path(), "HEAD")
        );
        assert_eq!(rev(remote.path(), "main"), rev(local.path(), "HEAD"));

        commit_file(local.path(), "b.txt", "dos\n", "segundo");
        let (result, events) = with_ctx(&op, |ctx| push(local.path(), "origin", "main", ctx));
        result.unwrap();
        assert_eq!(rev(remote.path(), "main"), rev(local.path(), "HEAD"));
        assert_eq!(events.last().unwrap().phase, SyncPhase::Done);
    }

    #[test]
    fn push_matches_cli_history() {
        // Stage → commit → push (SPEC 04 + SPEC 06) deja el mismo historial que la CLI.
        let (remote, local) = remote_and_clone();
        std::fs::write(local.path().join("n.txt"), "nuevo\n").unwrap();
        super::super::write::stage_files(local.path(), &["n.txt".to_string()]).unwrap();
        super::super::write::create_commit(local.path(), "añade n").unwrap();

        let op = Operation::default();
        let (result, _) = with_ctx(&op, |ctx| push(local.path(), "origin", "main", ctx));
        result.unwrap();

        let log = |dir: &Path| {
            let out = run_git(dir, ["log", "--format=%H %s", "main"]).unwrap();
            String::from_utf8_lossy(&out.stdout).into_owned()
        };
        assert_eq!(log(remote.path()), log(local.path()));
    }

    #[test]
    fn push_rejected_non_fast_forward() {
        let (remote, local) = remote_and_clone();
        push_from_other_clone(remote.path(), "b.txt");
        commit_file(local.path(), "c.txt", "local\n", "local");
        let remote_head = rev(remote.path(), "main");

        let op = Operation::default();
        let (result, _) = with_ctx(&op, |ctx| push(local.path(), "origin", "main", ctx));
        let err = result.unwrap_err();

        assert_eq!(err.kind, AppErrorKind::Git);
        assert!(
            err.message.contains("cambios que no tienes"),
            "{}",
            err.message
        );
        assert_eq!(rev(remote.path(), "main"), remote_head);
    }

    #[test]
    fn clone_creates_repository_and_reports_progress() {
        let (remote, _local) = remote_and_clone();
        let parent = tempfile::tempdir().unwrap();
        let dest = parent.path().join("copia");

        let op = Operation::default();
        let (result, events) = with_ctx(&op, |ctx| clone(&url(remote.path()), &dest, ctx));
        result.unwrap();

        assert!(dest.join(".git").exists());
        assert!(dest.join("a.txt").exists());
        assert_eq!(events.last().unwrap().phase, SyncPhase::Done);
    }

    #[test]
    fn clone_rejects_non_empty_destination() {
        let (remote, _local) = remote_and_clone();
        let dest = tempfile::tempdir().unwrap();
        std::fs::write(dest.path().join("x"), "x").unwrap();
        let op = Operation::default();
        let (result, _) = with_ctx(&op, |ctx| clone(&url(remote.path()), dest.path(), ctx));
        assert!(result.is_err());
        assert!(dest.path().join("x").exists());
    }

    #[test]
    fn failed_clone_cleans_up_created_directory() {
        let parent = tempfile::tempdir().unwrap();
        let dest = parent.path().join("copia");
        let op = Operation::default();
        let (result, _) = with_ctx(&op, |ctx| clone("/no/existe/gitleviatan", &dest, ctx));
        assert_eq!(result.unwrap_err().kind, AppErrorKind::NotFound);
        assert!(!dest.exists());
    }

    #[test]
    fn credentials_in_url_never_reach_errors() {
        let parent = tempfile::tempdir().unwrap();
        let dest = parent.path().join("copia");
        let op = Operation::default();
        // Puerto 1 en localhost: rechaza la conexión de inmediato, sin red.
        let (result, _) = with_ctx(&op, |ctx| {
            clone("http://usuario:secreto123@127.0.0.1:1/r.git", &dest, ctx)
        });
        let err = result.unwrap_err();
        assert_eq!(err.kind, AppErrorKind::Network);
        assert!(!err.detail.unwrap_or_default().contains("secreto123"));
        assert!(!err.message.contains("secreto123"));
    }

    fn remote_tag_names(tags: &[RemoteTag]) -> Vec<&str> {
        tags.iter().map(|t| t.name.as_str()).collect()
    }

    #[test]
    fn lists_remote_tags_with_the_commit_of_annotated_ones() {
        let (remote, local) = remote_and_clone();
        let head = rev(local.path(), "HEAD");
        git(local.path(), &["tag", "ligero"]);
        git(local.path(), &["tag", "-a", "v1.0.0", "-m", "x"]);
        git(local.path(), &["push", "-q", "origin", "ligero", "v1.0.0"]);
        git(local.path(), &["tag", "solo-local"]);

        let op = Operation::default();
        let (tags, _) = with_ctx(&op, |ctx| list_remote_tags(local.path(), "origin", ctx));
        let tags = tags.unwrap();
        assert_eq!(remote_tag_names(&tags), vec!["ligero", "v1.0.0"]);
        assert!(tags.iter().all(|t| t.target_oid == head));
        // No descarga nada: el remoto sigue sin tocar el repositorio local.
        assert!(!remote.path().join("refs/tags/solo-local").exists());
    }

    #[test]
    fn lists_no_tags_when_the_remote_has_none() {
        let (_remote, local) = remote_and_clone();
        let op = Operation::default();
        let (tags, _) = with_ctx(&op, |ctx| list_remote_tags(local.path(), "origin", ctx));
        assert!(tags.unwrap().is_empty());
    }

    #[test]
    fn listing_tags_of_an_unreachable_remote_fails_with_context() {
        let local = init_repo();
        commit_file(local.path(), "a.txt", "x", "base");
        let missing = tempfile::tempdir().unwrap();
        git(
            local.path(),
            &[
                "remote",
                "add",
                "origin",
                &url(&missing.path().join("nada")),
            ],
        );
        let op = Operation::default();
        let (result, _) = with_ctx(&op, |ctx| list_remote_tags(local.path(), "origin", ctx));
        let error = result.unwrap_err();
        assert!(error.detail.is_some());
    }

    #[test]
    fn fetch_tags_downloads_remote_tags() {
        let (remote, local) = remote_and_clone();
        let other = tempfile::tempdir().unwrap();
        git(other.path(), &["clone", "-q", &url(remote.path()), "."]);
        git(other.path(), &["config", "user.name", "Otro"]);
        git(other.path(), &["config", "user.email", "otro@example.com"]);
        git(other.path(), &["tag", "-a", "v2.0.0", "-m", "x"]);
        git(other.path(), &["push", "-q", "origin", "v2.0.0"]);

        let op = Operation::default();
        let (result, events) = with_ctx(&op, |ctx| fetch_tags(local.path(), "origin", ctx));
        result.unwrap();
        assert_eq!(
            rev(local.path(), "v2.0.0^{commit}"),
            rev(local.path(), "HEAD")
        );
        assert_eq!(events.last().unwrap().phase, SyncPhase::Done);
    }

    #[test]
    fn push_tag_publishes_only_the_chosen_tag() {
        let (remote, local) = remote_and_clone();
        git(local.path(), &["tag", "-a", "v1.0.0", "-m", "x"]);
        git(local.path(), &["tag", "otro"]);

        let op = Operation::default();
        let (result, _) = with_ctx(&op, |ctx| push_tag(local.path(), "origin", "v1.0.0", ctx));
        result.unwrap();
        let remote_tags = run_git(remote.path(), ["tag", "-l"]).unwrap();
        assert_eq!(
            String::from_utf8_lossy(&remote_tags.stdout).trim(),
            "v1.0.0"
        );
    }

    #[test]
    fn push_tag_never_overwrites_a_tag_pointing_elsewhere() {
        let (remote, local) = remote_and_clone();
        git(local.path(), &["tag", "v1.0.0"]);
        git(local.path(), &["push", "-q", "origin", "v1.0.0"]);
        let published = rev(remote.path(), "v1.0.0");
        commit_file(local.path(), "b.txt", "x", "segundo");
        git(local.path(), &["tag", "-f", "v1.0.0"]);

        let op = Operation::default();
        let (result, _) = with_ctx(&op, |ctx| push_tag(local.path(), "origin", "v1.0.0", ctx));
        let error = result.unwrap_err();
        assert!(
            error.message.contains("ya existe en el remoto"),
            "{}",
            error.message
        );
        assert_eq!(rev(remote.path(), "v1.0.0"), published);
    }

    #[test]
    fn deletes_a_remote_tag_without_touching_the_local_one() {
        let (remote, local) = remote_and_clone();
        git(local.path(), &["tag", "v1.0.0"]);
        git(local.path(), &["push", "-q", "origin", "v1.0.0"]);

        let op = Operation::default();
        let (result, _) = with_ctx(&op, |ctx| {
            delete_remote_tag(local.path(), "origin", "v1.0.0", ctx)
        });
        result.unwrap();
        assert!(run_git(remote.path(), ["tag", "-l"])
            .unwrap()
            .stdout
            .is_empty());
        assert!(run_git(local.path(), ["rev-parse", "--verify", "refs/tags/v1.0.0"]).is_ok());
    }

    #[test]
    fn deleting_a_missing_remote_tag_explains_it() {
        let (_remote, local) = remote_and_clone();
        let op = Operation::default();
        let (result, _) = with_ctx(&op, |ctx| {
            delete_remote_tag(local.path(), "origin", "nada", ctx)
        });
        assert!(result
            .unwrap_err()
            .message
            .contains("no existe en el remoto"));
    }

    #[test]
    fn tag_commands_reject_names_git_would_misread() {
        let (_remote, local) = remote_and_clone();
        let op = Operation::default();
        for bad in ["", "-x", "a b", ":refs/heads/main", "v*", "a..b"] {
            let (pushed, _) = with_ctx(&op, |ctx| push_tag(local.path(), "origin", bad, ctx));
            assert_eq!(
                pushed.unwrap_err().kind,
                AppErrorKind::Validation,
                "{bad:?}"
            );
            let (deleted, _) = with_ctx(&op, |ctx| {
                delete_remote_tag(local.path(), "origin", bad, ctx)
            });
            assert_eq!(
                deleted.unwrap_err().kind,
                AppErrorKind::Validation,
                "{bad:?}"
            );
        }
        let (listed, _) = with_ctx(&op, |ctx| list_remote_tags(local.path(), "-x", ctx));
        assert_eq!(listed.unwrap_err().kind, AppErrorKind::Validation);
    }
}
