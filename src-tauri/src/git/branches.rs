//! Ramas locales y de seguimiento: listar, crear, cambiar y eliminar.

use std::path::Path;

use super::error::AppError;
use super::operations::get_status;
use super::operations::is_valid_oid;
use super::process::run_git;
use super::types::{
    BranchInfo, BranchKind, DeleteBranchOutcome, DeleteReason, MergeBlock, MergePreview,
    MergeResult,
};

/// `%(HEAD)` vale `*` solo en la rama actual; en detached HEAD ninguna rama lo tiene.
const BRANCH_FORMAT: &str =
    "--format=%(refname)%00%(objectname)%00%(upstream)%00%(upstream:track,nobracket)%00%(HEAD)%1e";

fn parse_track(track: &str) -> (u32, u32) {
    let (mut ahead, mut behind) = (0, 0);
    for part in track.split(", ") {
        if let Some(n) = part.strip_prefix("ahead ") {
            ahead = n.parse().unwrap_or(0);
        } else if let Some(n) = part.strip_prefix("behind ") {
            behind = n.parse().unwrap_or(0);
        }
    }
    (ahead, behind)
}

fn short_ref(full: &str) -> &str {
    full.strip_prefix("refs/heads/")
        .or_else(|| full.strip_prefix("refs/remotes/"))
        .unwrap_or(full)
}

pub fn list_branches(repo: &Path) -> Result<Vec<BranchInfo>, AppError> {
    let out = run_git(
        repo,
        ["for-each-ref", BRANCH_FORMAT, "refs/heads", "refs/remotes"],
    )?;
    let text = String::from_utf8_lossy(&out.stdout);
    let mut branches = Vec::new();

    for record in text.split('\x1e') {
        let record = record.trim_start_matches('\n');
        if record.is_empty() {
            continue;
        }
        let fields: Vec<&str> = record.split('\0').collect();
        if fields.len() != 5 {
            return Err(AppError::internal(format!(
                "Salida de Git inesperada (rama): {record:?}"
            )));
        }
        let refname = fields[0];
        // `refs/remotes/<remoto>/HEAD` es un alias simbólico, no una rama real.
        if refname.starts_with("refs/remotes/") && refname.ends_with("/HEAD") {
            continue;
        }
        let is_local = refname.starts_with("refs/heads/");
        let (ahead, behind) = parse_track(fields[3]);
        branches.push(BranchInfo {
            name: short_ref(refname).to_string(),
            kind: if is_local {
                BranchKind::Local
            } else {
                BranchKind::Remote
            },
            is_current: is_local && fields[4] == "*",
            upstream: (is_local && !fields[2].is_empty()).then(|| short_ref(fields[2]).to_string()),
            ahead,
            behind,
            tip_oid: fields[1].to_string(),
        });
    }
    Ok(branches)
}

fn invalid_name(name: &str) -> AppError {
    AppError::invalid_input(format!("«{name}» no es un nombre de rama válido para Git."))
}

/// Valida con la propia definición de Git. Se descartan antes los nombres que
/// Git interpretaría como opción (`-x`) o como sintaxis especial (`@{-1}`).
fn validate_branch_name(repo: &Path, name: &str) -> Result<(), AppError> {
    if name.is_empty() || name.starts_with('-') || name.contains("@{") {
        return Err(invalid_name(name));
    }
    run_git(repo, ["check-ref-format", "--branch", name])
        .map(|_| ())
        .map_err(|_| invalid_name(name))
}

fn ref_exists(repo: &Path, full_ref: &str) -> bool {
    run_git(repo, ["rev-parse", "--verify", "--quiet", full_ref]).is_ok()
}

fn current_branch(repo: &Path) -> Option<String> {
    run_git(repo, ["symbolic-ref", "--quiet", "--short", "HEAD"])
        .ok()
        .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn require_plain_name(name: &str) -> Result<(), AppError> {
    if name.is_empty() || name.starts_with('-') {
        return Err(invalid_name(name));
    }
    Ok(())
}

/// Crea una rama local sin cambiarse a ella. `start_point` es un oid o `None` (HEAD).
pub fn create_branch(repo: &Path, name: &str, start_point: Option<&str>) -> Result<(), AppError> {
    validate_branch_name(repo, name)?;
    let mut args = vec!["branch", "--", name];
    if let Some(start) = start_point {
        if !is_valid_oid(start) {
            return Err(AppError::invalid_input(format!(
                "Punto de partida inválido: {start}"
            )));
        }
        args.push(start);
    }
    run_git(repo, args).map(|_| ())
}

/// Cambia a una rama local, o a una remota creando la local con seguimiento.
pub fn checkout_branch(repo: &Path, branch: &str) -> Result<(), AppError> {
    require_plain_name(branch)?;

    let result = if ref_exists(repo, &format!("refs/heads/{branch}")) {
        run_git(repo, ["switch", branch])
    } else if ref_exists(repo, &format!("refs/remotes/{branch}")) {
        let local = branch
            .split_once('/')
            .map(|(_, rest)| rest)
            .filter(|rest| !rest.is_empty())
            .ok_or_else(|| invalid_name(branch))?;
        if ref_exists(repo, &format!("refs/heads/{local}")) {
            return Err(AppError::invalid_input(format!(
                "Ya existe una rama local «{local}». Cámbiate a ella en lugar de a «{branch}»."
            )));
        }
        run_git(repo, ["switch", "-c", local, "--track", branch])
    } else {
        return Err(AppError::invalid_input(format!(
            "La rama «{branch}» no existe."
        )));
    };

    result.map(|_| ()).map_err(|error| {
        let detail = error.detail.clone().unwrap_or_default();
        if !(detail.contains("would be overwritten") || detail.contains("local changes")) {
            return error;
        }
        let files = overwritten_files(&detail);
        let list = if files.is_empty() {
            String::new()
        } else {
            format!(": {}", files.join(", "))
        };
        AppError {
            message: format!(
                "Tienes cambios locales que se perderían al cambiar de rama{list}. \
                 Confírmalos o descártalos antes de continuar; no se cambió de rama."
            ),
            ..error
        }
    })
}

/// Archivos que Git dice que se sobrescribirían (líneas con sangría tras el aviso), tanto de
/// cambios locales como de archivos sin seguimiento que estorban.
fn overwritten_files(stderr: &str) -> Vec<String> {
    let mut files = Vec::new();
    let mut listing = false;
    for line in stderr.lines() {
        if line.contains("would be overwritten") {
            listing = true;
        } else if listing && line.starts_with(['\t', ' ']) && !line.trim().is_empty() {
            files.push(line.trim().to_string());
        } else {
            listing = false;
        }
    }
    files
}

/// Elimina una rama local. Sin `force` usa `-d`: si no está fusionada devuelve `NeedsForce`.
pub fn delete_branch(
    repo: &Path,
    branch: &str,
    force: bool,
) -> Result<DeleteBranchOutcome, AppError> {
    require_plain_name(branch)?;
    if !ref_exists(repo, &format!("refs/heads/{branch}")) {
        return Err(AppError::invalid_input(format!(
            "No existe la rama local «{branch}»."
        )));
    }
    if current_branch(repo).as_deref() == Some(branch) {
        return Err(AppError::invalid_input(
            "No se puede eliminar la rama actual. Cámbiate a otra antes.",
        ));
    }

    let flag = if force { "-D" } else { "-d" };
    match run_git(repo, ["branch", flag, "--", branch]) {
        Ok(_) => Ok(DeleteBranchOutcome::Deleted),
        Err(error)
            if !force
                && error
                    .detail
                    .as_deref()
                    .is_some_and(|d| d.contains("not fully merged")) =>
        {
            Ok(DeleteBranchOutcome::NeedsForce {
                reason: DeleteReason::NotMerged,
            })
        }
        Err(error) => Err(error),
    }
}

/// Referencia completa de una rama local o remota, o error si no existe.
fn resolve_branch_ref(repo: &Path, name: &str) -> Result<String, AppError> {
    require_plain_name(name)?;
    if name.contains("@{") {
        return Err(invalid_name(name));
    }
    for prefix in ["refs/heads/", "refs/remotes/"] {
        let full = format!("{prefix}{name}");
        if ref_exists(repo, &full) {
            return Ok(full);
        }
    }
    Err(AppError::invalid_input(format!(
        "La rama «{name}» no existe."
    )))
}

fn head_oid(repo: &Path) -> Result<String, AppError> {
    let out = run_git(repo, ["rev-parse", "HEAD"])?;
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Archivos seguidos con cambios sin commitear (en staged o en el working tree). Los archivos
/// sin seguimiento no cuentan: una fusión no los toca salvo que Git los vaya a crear.
fn tracked_local_changes(repo: &Path) -> Result<Vec<String>, AppError> {
    let status = get_status(repo)?;
    let mut files: Vec<String> = status
        .staged
        .iter()
        .chain(status.unstaged.iter())
        .map(|f| f.path.clone())
        .collect();
    files.sort();
    files.dedup();
    Ok(files)
}

/// Qué pasaría al fusionar `source` (rama local o remota) en la rama actual. No modifica nada.
pub fn merge_preview(repo: &Path, source: &str) -> Result<MergePreview, AppError> {
    let source_ref = resolve_branch_ref(repo, source)?;
    let target = current_branch(repo);
    if target.as_deref() == Some(source) {
        return Err(AppError::invalid_input(
            "No se puede fusionar una rama consigo misma.",
        ));
    }

    let count = run_git(
        repo,
        ["rev-list", "--count", &format!("HEAD..{source_ref}")],
    )?;
    let commits_to_merge: u32 = String::from_utf8_lossy(&count.stdout)
        .trim()
        .parse()
        .map_err(|_| AppError::internal("Salida de Git inesperada (rev-list)."))?;
    let fast_forward = commits_to_merge > 0
        && run_git(repo, ["merge-base", "--is-ancestor", "HEAD", &source_ref]).is_ok();

    let blocked = if target.is_none() {
        Some(MergeBlock::DetachedHead)
    } else {
        let files = tracked_local_changes(repo)?;
        (!files.is_empty()).then_some(MergeBlock::LocalChanges { files })
    };

    Ok(MergePreview {
        source: source.to_string(),
        target: target.unwrap_or_else(|| "HEAD".to_string()),
        commits_to_merge,
        up_to_date: commits_to_merge == 0,
        fast_forward,
        blocked,
    })
}

/// Fusiona `source` en la rama actual. Avanza la rama si es posible; si no, crea un commit de
/// fusión con el mensaje por defecto de Git. Con conflictos cancela la fusión (`merge --abort`)
/// y deja el repositorio exactamente como estaba.
pub fn merge_branch(repo: &Path, source: &str) -> Result<MergeResult, AppError> {
    let preview = merge_preview(repo, source)?;
    match &preview.blocked {
        Some(MergeBlock::DetachedHead) => {
            return Err(AppError::invalid_input(
                "No se puede fusionar con el HEAD desacoplado. Cámbiate a una rama antes.",
            ));
        }
        Some(MergeBlock::LocalChanges { files }) => {
            return Err(AppError::invalid_input(format!(
                "Hay cambios sin confirmar en: {}. Confírmalos o descártalos antes de fusionar.",
                files.join(", ")
            )));
        }
        None => {}
    }
    if preview.up_to_date {
        return Ok(MergeResult::UpToDate);
    }

    match run_git(repo, ["merge", "--no-edit", source]) {
        Ok(_) => {
            let oid = head_oid(repo)?;
            Ok(if preview.fast_forward {
                MergeResult::FastForward { oid }
            } else {
                MergeResult::Merged { oid }
            })
        }
        Err(error) => {
            // Una fusión en curso (MERGE_HEAD) significa conflictos; cualquier otro fallo
            // (historias sin relación, un hook…) se devuelve tal cual.
            let in_progress =
                run_git(repo, ["rev-parse", "--quiet", "--verify", "MERGE_HEAD"]).is_ok();
            if !in_progress {
                return Err(error);
            }
            let unmerged = run_git(repo, ["diff", "--name-only", "--diff-filter=U", "-z"])?;
            let mut files: Vec<String> = String::from_utf8_lossy(&unmerged.stdout)
                .split('\0')
                .filter(|f| !f.is_empty())
                .map(str::to_string)
                .collect();
            files.sort();
            run_git(repo, ["merge", "--abort"]).map_err(|abort| AppError {
                message: "La fusión tuvo conflictos y no se pudo cancelar. Revisa el estado \
                          del repositorio."
                    .into(),
                ..abort
            })?;
            Ok(MergeResult::Conflict { files })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::error::AppErrorKind;
    use crate::git::testutil::{commit_file, git, init_bare, init_repo};

    fn names(branches: &[BranchInfo], kind: BranchKind) -> Vec<String> {
        branches
            .iter()
            .filter(|b| b.kind == kind)
            .map(|b| b.name.clone())
            .collect()
    }

    /// Repositorio con remoto `origin` (bare local) y `main` publicado.
    fn repo_with_remote() -> (tempfile::TempDir, tempfile::TempDir) {
        let remote = init_bare();
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "uno\n", "base");
        git(
            repo.path(),
            &["remote", "add", "origin", remote.path().to_str().unwrap()],
        );
        git(repo.path(), &["push", "-q", "-u", "origin", "main"]);
        (repo, remote)
    }

    #[test]
    fn lists_local_branches_and_marks_the_current_one() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "x", "base");
        git(repo.path(), &["branch", "feature/x"]);
        let branches = list_branches(repo.path()).unwrap();
        assert_eq!(
            names(&branches, BranchKind::Local),
            vec!["feature/x", "main"]
        );
        let current: Vec<_> = branches.iter().filter(|b| b.is_current).collect();
        assert_eq!(current.len(), 1);
        assert_eq!(current[0].name, "main");
        assert_eq!(current[0].upstream, None);
        assert_eq!(current[0].tip_oid.len(), 40);
    }

    #[test]
    fn no_branch_is_current_in_detached_head() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "x", "base");
        git(repo.path(), &["checkout", "-q", "--detach"]);
        let branches = list_branches(repo.path()).unwrap();
        assert!(!branches.is_empty());
        assert!(branches.iter().all(|b| !b.is_current));
    }

    #[test]
    fn empty_repository_has_no_branches() {
        let repo = init_repo();
        assert!(list_branches(repo.path()).unwrap().is_empty());
    }

    #[test]
    fn lists_remote_branches_upstream_and_hides_remote_head() {
        let (repo, _remote) = repo_with_remote();
        git(repo.path(), &["remote", "set-head", "origin", "main"]);
        let branches = list_branches(repo.path()).unwrap();
        assert_eq!(names(&branches, BranchKind::Remote), vec!["origin/main"]);
        let main = branches.iter().find(|b| b.name == "main").unwrap();
        assert_eq!(main.upstream.as_deref(), Some("origin/main"));
        assert_eq!((main.ahead, main.behind), (0, 0));
        let remote = branches.iter().find(|b| b.name == "origin/main").unwrap();
        assert_eq!(remote.upstream, None);
        assert!(!remote.is_current);
    }

    #[test]
    fn reports_ahead_and_behind_against_the_upstream() {
        let (repo, remote) = repo_with_remote();
        // 1 commit local sin publicar (ahead 1)…
        commit_file(repo.path(), "local.txt", "l", "local");
        // …y 2 commits publicados desde otro clon (behind 2 tras el fetch).
        let other = tempfile::tempdir().unwrap();
        git(
            other.path(),
            &["clone", "-q", remote.path().to_str().unwrap(), "."],
        );
        git(other.path(), &["config", "user.name", "Otro"]);
        git(other.path(), &["config", "user.email", "otro@example.com"]);
        for i in 0..2 {
            commit_file(
                other.path(),
                &format!("r{i}.txt"),
                "r",
                &format!("remoto {i}"),
            );
        }
        git(other.path(), &["push", "-q", "origin", "main"]);
        git(repo.path(), &["fetch", "-q", "origin"]);

        let main = list_branches(repo.path())
            .unwrap()
            .into_iter()
            .find(|b| b.name == "main")
            .unwrap();
        assert_eq!((main.ahead, main.behind), (1, 2));
    }

    #[test]
    fn creates_a_branch_from_head_and_from_a_commit() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "1", "uno");
        let first = String::from_utf8(
            std::process::Command::new("git")
                .args(["rev-parse", "HEAD"])
                .current_dir(repo.path())
                .output()
                .unwrap()
                .stdout,
        )
        .unwrap()
        .trim()
        .to_string();
        commit_file(repo.path(), "a.txt", "2", "dos");

        create_branch(repo.path(), "desde-head", None).unwrap();
        create_branch(repo.path(), "desde-commit", Some(&first)).unwrap();
        let branches = list_branches(repo.path()).unwrap();
        let tip = |n: &str| {
            branches
                .iter()
                .find(|b| b.name == n)
                .unwrap()
                .tip_oid
                .clone()
        };
        assert_eq!(tip("desde-commit"), first);
        assert_eq!(tip("desde-head"), tip("main"));
        // Crear no cambia de rama.
        assert!(
            branches
                .iter()
                .find(|b| b.name == "main")
                .unwrap()
                .is_current
        );
    }

    #[test]
    fn invalid_names_are_rejected_without_running_anything() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "1", "uno");
        for bad in [
            "",
            "con espacios",
            "a..b",
            "-x",
            "@{-1}",
            "a~b",
            "x.lock",
            "HEAD ",
            "a\nb",
        ] {
            let err = create_branch(repo.path(), bad, None).unwrap_err();
            assert_eq!(err.kind, AppErrorKind::Validation, "{bad:?}");
        }
        assert_eq!(list_branches(repo.path()).unwrap().len(), 1);
    }

    #[test]
    fn rejects_existing_names_and_bad_start_points() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "1", "uno");
        assert!(create_branch(repo.path(), "main", None).is_err());
        assert_eq!(
            create_branch(repo.path(), "otra", Some("--output=/tmp/x"))
                .unwrap_err()
                .kind,
            AppErrorKind::Validation
        );
        assert_eq!(list_branches(repo.path()).unwrap().len(), 1);
    }

    #[test]
    fn checks_out_a_local_branch_carrying_compatible_changes() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "1", "uno");
        git(repo.path(), &["branch", "otra"]);
        std::fs::write(repo.path().join("suelto.txt"), "sin conflicto").unwrap();
        checkout_branch(repo.path(), "otra").unwrap();
        let current = list_branches(repo.path())
            .unwrap()
            .into_iter()
            .find(|b| b.is_current)
            .unwrap();
        assert_eq!(current.name, "otra");
    }

    #[test]
    fn overwritten_files_are_read_from_git_output() {
        let tracked = "error: Your local changes to the following files would be overwritten by checkout:\n\ta.txt\n\tcarpeta/b.txt\nPlease commit your changes or stash them before you switch branches.\nAborting\n";
        assert_eq!(overwritten_files(tracked), vec!["a.txt", "carpeta/b.txt"]);
        let untracked = "error: The following untracked working tree files would be overwritten by checkout:\n\tnuevo.txt\nPlease move or remove them before you switch branches.\nAborting";
        assert_eq!(overwritten_files(untracked), vec!["nuevo.txt"]);
        assert!(overwritten_files("fatal: otra cosa").is_empty());
    }

    #[test]
    fn checkout_blocked_by_an_untracked_file_names_it() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "base\n", "base");
        git(repo.path(), &["checkout", "-q", "-b", "otra"]);
        commit_file(repo.path(), "nuevo.txt", "de otra\n", "añade nuevo");
        git(repo.path(), &["checkout", "-q", "main"]);
        std::fs::write(repo.path().join("nuevo.txt"), "mío\n").unwrap();

        let err = checkout_branch(repo.path(), "otra").unwrap_err();
        assert!(err.message.contains("nuevo.txt"), "{}", err.message);
        assert_eq!(
            std::fs::read_to_string(repo.path().join("nuevo.txt")).unwrap(),
            "mío\n"
        );
    }

    #[test]
    fn checkout_with_conflicting_local_changes_fails_and_stays_put() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "base\n", "base");
        git(repo.path(), &["checkout", "-q", "-b", "otra"]);
        commit_file(repo.path(), "a.txt", "otra\n", "en otra");
        git(repo.path(), &["checkout", "-q", "main"]);
        std::fs::write(repo.path().join("a.txt"), "cambio local sin confirmar\n").unwrap();

        let err = checkout_branch(repo.path(), "otra").unwrap_err();
        assert_eq!(err.kind, AppErrorKind::Git);
        assert!(err.message.contains("cambios locales"));
        // Dice qué archivos están en juego y que no se cambió de rama.
        assert!(err.message.contains("a.txt"), "{}", err.message);
        assert!(err.message.contains("no se cambió de rama"));
        assert!(err.detail.unwrap().contains("would be overwritten"));
        let current = list_branches(repo.path())
            .unwrap()
            .into_iter()
            .find(|b| b.is_current)
            .unwrap();
        assert_eq!(current.name, "main");
        assert_eq!(
            std::fs::read_to_string(repo.path().join("a.txt")).unwrap(),
            "cambio local sin confirmar\n"
        );
    }

    #[test]
    fn checking_out_a_remote_branch_creates_a_tracking_local_one() {
        let (repo, _remote) = repo_with_remote();
        git(repo.path(), &["branch", "feature", "main"]);
        git(repo.path(), &["push", "-q", "origin", "feature"]);
        git(repo.path(), &["branch", "-q", "-D", "feature"]);

        checkout_branch(repo.path(), "origin/feature").unwrap();
        let branches = list_branches(repo.path()).unwrap();
        let feature = branches.iter().find(|b| b.name == "feature").unwrap();
        assert!(feature.is_current);
        assert_eq!(feature.kind, BranchKind::Local);
        assert_eq!(feature.upstream.as_deref(), Some("origin/feature"));
    }

    #[test]
    fn remote_checkout_refuses_when_the_local_branch_already_exists() {
        let (repo, _remote) = repo_with_remote();
        let err = checkout_branch(repo.path(), "origin/main").unwrap_err();
        assert_eq!(err.kind, AppErrorKind::Validation);
        assert!(err.message.contains("Ya existe"));
    }

    #[test]
    fn checkout_rejects_unknown_and_option_like_names() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "1", "uno");
        assert!(checkout_branch(repo.path(), "no-existe").is_err());
        assert!(checkout_branch(repo.path(), "--detach").is_err());
    }

    #[test]
    fn deletes_a_merged_branch() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "1", "uno");
        git(repo.path(), &["branch", "fusionada"]);
        assert_eq!(
            delete_branch(repo.path(), "fusionada", false).unwrap(),
            DeleteBranchOutcome::Deleted
        );
        assert_eq!(
            names(&list_branches(repo.path()).unwrap(), BranchKind::Local),
            vec!["main"]
        );
    }

    #[test]
    fn unmerged_branch_needs_force_and_is_kept_until_confirmed() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "1", "uno");
        git(repo.path(), &["checkout", "-q", "-b", "sin-fusionar"]);
        commit_file(repo.path(), "b.txt", "2", "solo aquí");
        git(repo.path(), &["checkout", "-q", "main"]);

        assert_eq!(
            delete_branch(repo.path(), "sin-fusionar", false).unwrap(),
            DeleteBranchOutcome::NeedsForce {
                reason: DeleteReason::NotMerged
            }
        );
        assert!(
            names(&list_branches(repo.path()).unwrap(), BranchKind::Local)
                .contains(&"sin-fusionar".to_string())
        );

        assert_eq!(
            delete_branch(repo.path(), "sin-fusionar", true).unwrap(),
            DeleteBranchOutcome::Deleted
        );
        assert_eq!(
            names(&list_branches(repo.path()).unwrap(), BranchKind::Local),
            vec!["main"]
        );
    }

    #[test]
    fn refuses_to_delete_the_current_or_a_missing_or_remote_branch() {
        let (repo, _remote) = repo_with_remote();
        for target in ["main", "no-existe", "origin/main", "-D"] {
            let err = delete_branch(repo.path(), target, true).unwrap_err();
            assert_eq!(err.kind, AppErrorKind::Validation, "{target}");
        }
        assert!(
            names(&list_branches(repo.path()).unwrap(), BranchKind::Local)
                .contains(&"main".to_string())
        );
    }

    #[test]
    fn serializes_delete_outcome_as_tagged_json() {
        assert_eq!(
            serde_json::to_string(&DeleteBranchOutcome::Deleted).unwrap(),
            r#"{"status":"deleted"}"#
        );
        assert_eq!(
            serde_json::to_string(&DeleteBranchOutcome::NeedsForce {
                reason: DeleteReason::NotMerged
            })
            .unwrap(),
            r#"{"status":"needsForce","reason":"notMerged"}"#
        );
    }

    // --- fusionar (SPEC 12) ---

    /// `main` con un commit base. Devuelve el repositorio.
    fn base_repo() -> tempfile::TempDir {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "uno\ndos\ntres\n", "base");
        repo
    }

    fn head(repo: &Path) -> String {
        head_oid(repo).unwrap()
    }

    fn tree(repo: &Path) -> String {
        let out = run_git(repo, ["rev-parse", "HEAD^{tree}"]).unwrap();
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    }

    fn parents(repo: &Path) -> usize {
        let out = run_git(repo, ["rev-list", "--parents", "-n", "1", "HEAD"]).unwrap();
        String::from_utf8_lossy(&out.stdout)
            .split_whitespace()
            .count()
            - 1
    }

    /// `feature` sale de `main` y avanza `n` commits; vuelve a `main`.
    fn add_feature(repo: &Path, n: usize) {
        git(repo, &["checkout", "-q", "-b", "feature"]);
        for i in 0..n {
            commit_file(repo, &format!("f{i}.txt"), "x\n", &format!("feature {i}"));
        }
        git(repo, &["checkout", "-q", "main"]);
    }

    #[test]
    fn preview_counts_commits_and_detects_fast_forward() {
        let repo = base_repo();
        add_feature(repo.path(), 3);
        let p = merge_preview(repo.path(), "feature").unwrap();
        assert_eq!(p.source, "feature");
        assert_eq!(p.target, "main");
        assert_eq!(p.commits_to_merge, 3);
        assert!(p.fast_forward && !p.up_to_date);
        assert_eq!(p.blocked, None);
    }

    #[test]
    fn preview_of_a_diverged_branch_needs_a_merge_commit() {
        let repo = base_repo();
        add_feature(repo.path(), 2);
        commit_file(repo.path(), "solo-main.txt", "m\n", "en main");
        let p = merge_preview(repo.path(), "feature").unwrap();
        assert_eq!(p.commits_to_merge, 2);
        assert!(!p.fast_forward);
    }

    #[test]
    fn preview_does_not_modify_anything() {
        let repo = base_repo();
        add_feature(repo.path(), 1);
        let before = head(repo.path());
        merge_preview(repo.path(), "feature").unwrap();
        assert_eq!(head(repo.path()), before);
        assert!(get_status(repo.path()).unwrap().staged.is_empty());
    }

    #[test]
    fn fast_forward_merge_matches_the_cli() {
        let ours = base_repo();
        let cli = base_repo();
        for repo in [ours.path(), cli.path()] {
            add_feature(repo, 2);
        }
        let result = merge_branch(ours.path(), "feature").unwrap();
        git(cli.path(), &["merge", "--no-edit", "feature"]);

        let MergeResult::FastForward { oid } = result else {
            panic!("se esperaba avance rápido");
        };
        assert_eq!(oid, head(ours.path()));
        assert_eq!(parents(ours.path()), 1);
        assert_eq!(tree(ours.path()), tree(cli.path()));
        assert!(ours.path().join("f1.txt").exists());
    }

    #[test]
    fn diverged_merge_creates_a_merge_commit_like_the_cli() {
        let ours = base_repo();
        let cli = base_repo();
        for repo in [ours.path(), cli.path()] {
            add_feature(repo, 1);
            commit_file(repo, "solo-main.txt", "m\n", "en main");
        }
        let result = merge_branch(ours.path(), "feature").unwrap();
        git(cli.path(), &["merge", "--no-edit", "feature"]);

        let MergeResult::Merged { oid } = result else {
            panic!("se esperaba un commit de fusión");
        };
        assert_eq!(oid, head(ours.path()));
        assert_eq!(parents(ours.path()), 2);
        assert_eq!(tree(ours.path()), tree(cli.path()));
        let subject = run_git(ours.path(), ["log", "-1", "--format=%s"]).unwrap();
        assert!(String::from_utf8_lossy(&subject.stdout).starts_with("Merge branch 'feature'"));
    }

    #[test]
    fn merging_an_included_branch_does_nothing() {
        let repo = base_repo();
        add_feature(repo.path(), 1);
        merge_branch(repo.path(), "feature").unwrap();
        let before = head(repo.path());
        assert_eq!(
            merge_branch(repo.path(), "feature").unwrap(),
            MergeResult::UpToDate
        );
        assert_eq!(head(repo.path()), before);
        assert!(merge_preview(repo.path(), "feature").unwrap().up_to_date);
    }

    /// `main` y `feature` cambian la misma línea de `a.txt`.
    fn conflicting_repo() -> tempfile::TempDir {
        let repo = base_repo();
        git(repo.path(), &["checkout", "-q", "-b", "feature"]);
        commit_file(repo.path(), "a.txt", "uno\nDE FEATURE\ntres\n", "feature");
        git(repo.path(), &["checkout", "-q", "main"]);
        commit_file(repo.path(), "a.txt", "uno\nDE MAIN\ntres\n", "main");
        repo
    }

    #[test]
    fn conflicts_abort_the_merge_and_leave_the_repository_untouched() {
        let repo = conflicting_repo();
        let head_before = head(repo.path());
        let content_before = std::fs::read_to_string(repo.path().join("a.txt")).unwrap();

        let result = merge_branch(repo.path(), "feature").unwrap();

        assert_eq!(
            result,
            MergeResult::Conflict {
                files: vec!["a.txt".to_string()]
            }
        );
        assert_eq!(head(repo.path()), head_before);
        assert_eq!(
            std::fs::read_to_string(repo.path().join("a.txt")).unwrap(),
            content_before
        );
        assert!(!content_before.contains("<<<<<<<"));
        // No queda ninguna fusión a medias ni cambios en el índice o el working tree.
        assert!(run_git(
            repo.path(),
            ["rev-parse", "--quiet", "--verify", "MERGE_HEAD"]
        )
        .is_err());
        let s = get_status(repo.path()).unwrap();
        assert!(s.staged.is_empty() && s.unstaged.is_empty() && s.untracked.is_empty());
    }

    #[test]
    fn conflicts_list_every_conflicting_file() {
        let repo = base_repo();
        commit_file(repo.path(), "b.txt", "b\n", "otro archivo");
        git(repo.path(), &["checkout", "-q", "-b", "feature"]);
        commit_file(repo.path(), "a.txt", "FEATURE\n", "f1");
        commit_file(repo.path(), "b.txt", "FEATURE\n", "f2");
        git(repo.path(), &["checkout", "-q", "main"]);
        commit_file(repo.path(), "a.txt", "MAIN\n", "m1");
        commit_file(repo.path(), "b.txt", "MAIN\n", "m2");

        let MergeResult::Conflict { files } = merge_branch(repo.path(), "feature").unwrap() else {
            panic!("se esperaban conflictos");
        };
        assert_eq!(files, vec!["a.txt", "b.txt"]);
    }

    #[test]
    fn detached_head_blocks_the_merge() {
        let repo = base_repo();
        add_feature(repo.path(), 1);
        git(repo.path(), &["checkout", "-q", "--detach"]);

        let p = merge_preview(repo.path(), "feature").unwrap();
        assert_eq!(p.blocked, Some(MergeBlock::DetachedHead));
        let err = merge_branch(repo.path(), "feature").unwrap_err();
        assert_eq!(err.kind, AppErrorKind::Validation);
        assert!(err.message.contains("desacoplado"));
    }

    #[test]
    fn local_changes_block_the_merge_and_are_listed() {
        let repo = base_repo();
        add_feature(repo.path(), 1);
        std::fs::write(repo.path().join("a.txt"), "cambiado\n").unwrap();

        let p = merge_preview(repo.path(), "feature").unwrap();
        assert_eq!(
            p.blocked,
            Some(MergeBlock::LocalChanges {
                files: vec!["a.txt".to_string()]
            })
        );
        let before = head(repo.path());
        let err = merge_branch(repo.path(), "feature").unwrap_err();
        assert_eq!(err.kind, AppErrorKind::Validation);
        assert!(err.message.contains("a.txt"));
        assert_eq!(head(repo.path()), before);
        // El cambio local sigue ahí.
        assert_eq!(
            std::fs::read_to_string(repo.path().join("a.txt")).unwrap(),
            "cambiado\n"
        );
    }

    #[test]
    fn staged_changes_also_block_but_untracked_files_do_not() {
        let repo = base_repo();
        add_feature(repo.path(), 1);
        std::fs::write(repo.path().join("suelto.txt"), "x").unwrap();
        assert_eq!(merge_preview(repo.path(), "feature").unwrap().blocked, None);

        std::fs::write(repo.path().join("a.txt"), "preparado\n").unwrap();
        git(repo.path(), &["add", "a.txt"]);
        assert!(matches!(
            merge_preview(repo.path(), "feature").unwrap().blocked,
            Some(MergeBlock::LocalChanges { .. })
        ));
    }

    #[test]
    fn remote_branches_can_be_merged() {
        let (local, remote) = repo_with_remote();
        // Otro clon publica un commit en `origin/main`.
        let other = tempfile::tempdir().unwrap();
        git(
            other.path(),
            &[
                "clone",
                "-q",
                &crate::git::testutil::file_url(remote.path()),
                ".",
            ],
        );
        git(other.path(), &["config", "user.name", "Otro"]);
        git(other.path(), &["config", "user.email", "otro@example.com"]);
        git(other.path(), &["config", "commit.gpgsign", "false"]);
        commit_file(other.path(), "remoto.txt", "r\n", "desde el remoto");
        git(other.path(), &["push", "-q", "origin", "main"]);
        git(local.path(), &["fetch", "-q", "origin"]);

        let p = merge_preview(local.path(), "origin/main").unwrap();
        assert_eq!(p.commits_to_merge, 1);
        assert!(p.fast_forward);
        assert!(matches!(
            merge_branch(local.path(), "origin/main").unwrap(),
            MergeResult::FastForward { .. }
        ));
        assert!(local.path().join("remoto.txt").exists());
    }

    #[test]
    fn invalid_names_and_self_merges_are_rejected() {
        let repo = base_repo();
        for bad in [
            "",
            "-x",
            "--help",
            "--output=/tmp/x",
            "no-existe",
            "main@{1}",
        ] {
            let err = merge_preview(repo.path(), bad).unwrap_err();
            assert_eq!(err.kind, AppErrorKind::Validation, "{bad:?}");
            assert!(merge_branch(repo.path(), bad).is_err(), "{bad:?}");
        }
        let err = merge_branch(repo.path(), "main").unwrap_err();
        assert!(err.message.contains("consigo misma"));
    }

    #[test]
    fn unrelated_histories_fail_without_leaving_a_merge_in_progress() {
        let repo = base_repo();
        git(repo.path(), &["checkout", "-q", "--orphan", "huerfana"]);
        git(repo.path(), &["rm", "-rf", "-q", "."]);
        commit_file(repo.path(), "otra.txt", "x\n", "sin relación");
        git(repo.path(), &["checkout", "-q", "main"]);

        let before = head(repo.path());
        let err = merge_branch(repo.path(), "huerfana").unwrap_err();
        assert_eq!(err.kind, AppErrorKind::Git);
        assert_eq!(head(repo.path()), before);
        assert!(run_git(
            repo.path(),
            ["rev-parse", "--quiet", "--verify", "MERGE_HEAD"]
        )
        .is_err());
    }
}
