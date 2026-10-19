//! Operaciones que modifican el repositorio: stage, unstage y commit.

use std::path::{Component, Path};

use super::error::AppError;
use super::process::{run_git, run_git_with_input};
use super::types::CommitResult;

/// Rechaza rutas vacías, con NUL, absolutas o que salgan del repositorio.
pub fn validate_relative_path(path: &str) -> Result<(), AppError> {
    if path.is_empty() || path.contains('\0') {
        return Err(AppError::invalid_input("Ruta de archivo inválida."));
    }
    let candidate = Path::new(path);
    // En Windows `/etc/passwd` no es «absoluta» (le falta la unidad) pero `join` la trata como
    // raíz y saldría del repositorio: por eso también se rechazan `RootDir` y los separadores
    // iniciales, y no solo `is_absolute()`.
    let rooted = path.starts_with('/') || (cfg!(windows) && path.starts_with('\\'));
    let escapes = rooted
        || candidate.is_absolute()
        || candidate.components().any(|c| {
            matches!(
                c,
                Component::ParentDir | Component::Prefix(_) | Component::RootDir
            )
        });
    if escapes {
        return Err(AppError::invalid_input(format!(
            "La ruta debe ser relativa al repositorio: {path}"
        )));
    }
    Ok(())
}

fn validate_paths(paths: &[String]) -> Result<(), AppError> {
    if paths.is_empty() {
        return Err(AppError::invalid_input("No se indicó ningún archivo."));
    }
    paths.iter().try_for_each(|p| validate_relative_path(p))
}

pub fn stage_files(repo: &Path, paths: &[String]) -> Result<(), AppError> {
    validate_paths(paths)?;
    let mut args = vec!["add".to_string(), "--".to_string()];
    args.extend(paths.iter().cloned());
    run_git(repo, args).map(|_| ())
}

fn has_head(repo: &Path) -> bool {
    run_git(repo, ["rev-parse", "--verify", "--quiet", "HEAD"]).is_ok()
}

pub fn unstage_files(repo: &Path, paths: &[String]) -> Result<(), AppError> {
    validate_paths(paths)?;
    // Sin commits no existe HEAD al que restaurar: se quita la entrada del índice.
    let mut args: Vec<String> = if has_head(repo) {
        vec!["restore".into(), "--staged".into(), "--".into()]
    } else {
        vec![
            "rm".into(),
            "--cached".into(),
            "--force".into(),
            "--quiet".into(),
            "--".into(),
        ]
    };
    args.extend(paths.iter().cloned());
    run_git(repo, args).map(|_| ())
}

pub fn create_commit(repo: &Path, message: &str) -> Result<CommitResult, AppError> {
    if message.trim().is_empty() {
        return Err(AppError::invalid_input(
            "El mensaje del commit no puede estar vacío.",
        ));
    }
    let staged = run_git(repo, ["diff", "--cached", "--name-only", "-z"])?;
    if staged.stdout.is_empty() {
        return Err(AppError::invalid_input(
            "No hay cambios preparados (staged) para confirmar.",
        ));
    }

    // El mensaje viaja por stdin: nunca se interpreta como argumento ni por shell.
    // Los hooks se ejecutan con normalidad; su salida llega en el error si fallan.
    run_git_with_input(
        repo,
        ["commit", "--cleanup=whitespace", "-F", "-"],
        message.as_bytes(),
    )?;

    let head = run_git(repo, ["log", "-1", "--format=%H%x00%h"])?;
    let text = String::from_utf8_lossy(&head.stdout);
    let (oid, short_oid) = text
        .trim_end()
        .split_once('\0')
        .ok_or_else(|| AppError::internal("No se pudo leer el commit creado."))?;
    Ok(CommitResult {
        oid: oid.to_string(),
        short_oid: short_oid.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::error::AppErrorKind;
    use crate::git::operations::{get_status, list_commits};
    use crate::git::testutil::{commit_file, git, init_repo, portable_names};

    fn paths(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn stages_and_unstages_a_file() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "uno\n", "base");
        std::fs::write(repo.path().join("a.txt"), "dos\n").unwrap();

        stage_files(repo.path(), &paths(&["a.txt"])).unwrap();
        let s = get_status(repo.path()).unwrap();
        assert_eq!(s.staged.len(), 1);
        assert!(s.unstaged.is_empty());

        unstage_files(repo.path(), &paths(&["a.txt"])).unwrap();
        let s = get_status(repo.path()).unwrap();
        assert!(s.staged.is_empty());
        assert_eq!(s.unstaged.len(), 1);
    }

    #[test]
    fn unstages_in_repository_without_commits() {
        let repo = init_repo();
        std::fs::write(repo.path().join("nuevo.txt"), "x").unwrap();
        stage_files(repo.path(), &paths(&["nuevo.txt"])).unwrap();
        assert_eq!(get_status(repo.path()).unwrap().staged.len(), 1);

        unstage_files(repo.path(), &paths(&["nuevo.txt"])).unwrap();
        let s = get_status(repo.path()).unwrap();
        assert!(s.staged.is_empty());
        assert_eq!(s.untracked, vec!["nuevo.txt"]);
    }

    #[test]
    fn stages_deletions_and_special_names() {
        let repo = init_repo();
        commit_file(
            repo.path(),
            "borrar.txt",
            "contenido único que se elimina\n",
            "base",
        );
        std::fs::remove_file(repo.path().join("borrar.txt")).unwrap();
        let names = [
            "con espacios.txt",
            "ñandú_日本.txt",
            "salto\nlinea.txt",
            "*.txt",
        ];
        let names = &portable_names(&names)[..];
        for name in names {
            std::fs::write(repo.path().join(name), "x").unwrap();
        }
        let mut all = paths(names);
        all.push("borrar.txt".into());
        stage_files(repo.path(), &all).unwrap();

        let s = get_status(repo.path()).unwrap();
        let mut staged: Vec<_> = s.staged.iter().map(|f| f.path.clone()).collect();
        staged.sort();
        let mut expected = all.clone();
        expected.sort();
        assert_eq!(staged, expected);
        assert!(s.untracked.is_empty());
        let deleted = s.staged.iter().find(|f| f.path == "borrar.txt").unwrap();
        assert_eq!(deleted.kind, crate::git::types::ChangeKind::Deleted);
    }

    #[test]
    fn literal_pathspec_does_not_expand_globs() {
        let repo = init_repo();
        std::fs::write(repo.path().join("a.txt"), "x").unwrap();
        std::fs::write(repo.path().join("b.txt"), "x").unwrap();
        // "*.txt" no existe como archivo: no debe prepararse a.txt ni b.txt.
        assert!(stage_files(repo.path(), &paths(&["*.txt"])).is_err());
        assert!(get_status(repo.path()).unwrap().staged.is_empty());
    }

    #[test]
    fn unstaging_a_rename_needs_both_paths() {
        let repo = init_repo();
        commit_file(
            repo.path(),
            "viejo.txt",
            "contenido largo para detectar rename\n",
            "base",
        );
        git(repo.path(), &["mv", "viejo.txt", "nuevo.txt"]);
        unstage_files(repo.path(), &paths(&["nuevo.txt", "viejo.txt"])).unwrap();
        let s = get_status(repo.path()).unwrap();
        assert!(s.staged.is_empty());
        assert_eq!(s.untracked, vec!["nuevo.txt"]);
    }

    #[test]
    fn rejects_invalid_paths() {
        let repo = init_repo();
        for bad in [
            "",
            "/etc/passwd",
            "\\etc\\passwd",
            "../fuera.txt",
            "a/../../b",
            "C:/Windows/win.ini",
        ] {
            // En Linux `\\etc\\passwd` y `C:/…` son nombres de archivo legales y relativos.
            if !cfg!(windows) && (bad.starts_with('\\') || bad.starts_with("C:")) {
                continue;
            }
            assert_eq!(
                stage_files(repo.path(), &paths(&[bad])).unwrap_err().kind,
                AppErrorKind::Validation,
                "{bad}"
            );
        }
        assert!(stage_files(repo.path(), &[]).is_err());
    }

    #[test]
    fn stage_then_commit_matches_the_cli() {
        let repo = init_repo();
        std::fs::write(repo.path().join("a.txt"), "hola\n").unwrap();
        stage_files(repo.path(), &paths(&["a.txt"])).unwrap();
        let result = create_commit(repo.path(), "Primer commit\n\nCuerpo").unwrap();

        let page = list_commits(repo.path(), None, 10).unwrap();
        assert_eq!(page.commits.len(), 1);
        assert_eq!(page.commits[0].oid, result.oid);
        assert_eq!(page.commits[0].subject, "Primer commit");
        let cli = std::process::Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(repo.path())
            .output()
            .unwrap();
        assert!(cli.stdout.is_empty(), "el árbol debe quedar limpio");
    }

    #[test]
    fn commit_message_is_stored_literally() {
        let repo = init_repo();
        std::fs::write(repo.path().join("a.txt"), "x").unwrap();
        stage_files(repo.path(), &paths(&["a.txt"])).unwrap();
        let message = "$(echo pwned) `ls` \"comillas\" 'simples' ; rm -rf /\n# no es un comentario";
        create_commit(repo.path(), message).unwrap();

        let out = std::process::Command::new("git")
            .args(["log", "-1", "--format=%B"])
            .current_dir(repo.path())
            .output()
            .unwrap();
        assert_eq!(String::from_utf8_lossy(&out.stdout).trim_end(), message);
    }

    #[test]
    fn commit_requires_message_and_staged_changes() {
        let repo = init_repo();
        std::fs::write(repo.path().join("a.txt"), "x").unwrap();
        assert!(create_commit(repo.path(), "   \n").is_err());
        let err = create_commit(repo.path(), "sin nada preparado").unwrap_err();
        assert_eq!(err.kind, AppErrorKind::Validation);
        assert!(list_commits(repo.path(), None, 10)
            .unwrap()
            .commits
            .is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn failing_pre_commit_hook_blocks_the_commit_and_reports_its_output() {
        use std::os::unix::fs::PermissionsExt;
        let repo = init_repo();
        let hook = repo.path().join(".git/hooks/pre-commit");
        std::fs::write(
            &hook,
            "#!/bin/sh\necho 'el hook rechazó el commit' >&2\nexit 1\n",
        )
        .unwrap();
        std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755)).unwrap();

        std::fs::write(repo.path().join("a.txt"), "x").unwrap();
        stage_files(repo.path(), &paths(&["a.txt"])).unwrap();
        let err = create_commit(repo.path(), "intento").unwrap_err();

        assert_eq!(err.kind, AppErrorKind::Git);
        assert!(err.detail.unwrap().contains("el hook rechazó el commit"));
        assert!(list_commits(repo.path(), None, 10)
            .unwrap()
            .commits
            .is_empty());
    }
}
