use std::path::Path;

use super::error::GitError;
use super::parse::{parse_commit_detail, parse_log, parse_status, DETAIL_FORMAT, LOG_FORMAT};
use super::process::run_git;
use super::types::{CommitDetail, CommitPage, RepositoryStatus};

pub const MAX_PAGE_SIZE: usize = 500;

pub fn get_status(repo: &Path) -> Result<RepositoryStatus, GitError> {
    let out = run_git(repo, ["status", "--porcelain=v2", "-z", "--branch"])?;
    parse_status(&out.stdout)
}

/// Historial paginado. `cursor` es un desplazamiento (`--skip`) en texto.
pub fn list_commits(
    repo: &Path,
    cursor: Option<&str>,
    limit: usize,
) -> Result<CommitPage, GitError> {
    let skip: usize = match cursor {
        None => 0,
        Some(value) => value
            .parse()
            .map_err(|_| GitError::invalid_input(format!("Cursor inválido: {value}")))?,
    };
    let limit = limit.clamp(1, MAX_PAGE_SIZE);

    // Se pide un commit de más para saber si existe una página siguiente.
    let out = run_git(
        repo,
        [
            "log",
            "--exclude=refs/stash",
            "--all",
            "--topo-order",
            "--decorate=full",
            &format!("--skip={skip}"),
            &format!("--max-count={}", limit + 1),
            LOG_FORMAT,
        ],
    )?;
    let mut commits = parse_log(&out.stdout)?;

    let next_cursor = if commits.len() > limit {
        commits.truncate(limit);
        Some((skip + limit).to_string())
    } else {
        None
    };
    Ok(CommitPage {
        commits,
        next_cursor,
    })
}

fn is_valid_oid(oid: &str) -> bool {
    (4..=64).contains(&oid.len()) && oid.chars().all(|c| c.is_ascii_hexdigit())
}

/// Detalle de un commit. `oid` se valida como hexadecimal para que nunca se
/// interprete como una opción de Git.
pub fn get_commit(repo: &Path, oid: &str) -> Result<CommitDetail, GitError> {
    if !is_valid_oid(oid) {
        return Err(GitError::invalid_input(format!(
            "Identificador de commit inválido: {oid}"
        )));
    }
    let out = run_git(
        repo,
        [
            "log",
            "-1",
            "--decorate=full",
            DETAIL_FORMAT,
            "--end-of-options",
            oid,
        ],
    )?;
    parse_commit_detail(&out.stdout)
}

#[cfg(test)]
mod tests {
    use super::super::types::ChangeKind;
    use super::*;
    use crate::git::testutil::{commit_file, git, init_repo};

    #[test]
    fn status_of_empty_repository() {
        let repo = init_repo();
        let status = get_status(repo.path()).unwrap();
        assert_eq!(status.branch.as_deref(), Some("main"));
        assert!(status.staged.is_empty() && status.unstaged.is_empty());
    }

    #[test]
    fn status_reports_every_kind() {
        let repo = init_repo();
        commit_file(repo.path(), "mod.txt", "a\n", "uno");
        commit_file(repo.path(), "del.txt", "b\n", "dos");
        commit_file(
            repo.path(),
            "viejo.txt",
            "contenido largo para detectar rename\n",
            "tres",
        );

        std::fs::write(repo.path().join("mod.txt"), "cambiado\n").unwrap();
        std::fs::remove_file(repo.path().join("del.txt")).unwrap();
        git(repo.path(), &["mv", "viejo.txt", "nuevo.txt"]);
        std::fs::write(repo.path().join("added.txt"), "x\n").unwrap();
        git(repo.path(), &["add", "added.txt"]);
        std::fs::write(repo.path().join("sin seguimiento.txt"), "y\n").unwrap();

        let s = get_status(repo.path()).unwrap();
        let find = |list: &[crate::git::types::ChangedFile], p: &str| {
            list.iter().find(|f| f.path == p).map(|f| f.kind)
        };
        assert_eq!(find(&s.unstaged, "mod.txt"), Some(ChangeKind::Modified));
        assert_eq!(find(&s.unstaged, "del.txt"), Some(ChangeKind::Deleted));
        assert_eq!(find(&s.staged, "added.txt"), Some(ChangeKind::Added));
        assert_eq!(find(&s.staged, "nuevo.txt"), Some(ChangeKind::Renamed));
        assert_eq!(
            s.staged
                .iter()
                .find(|f| f.path == "nuevo.txt")
                .unwrap()
                .orig_path
                .as_deref(),
            Some("viejo.txt")
        );
        assert_eq!(s.untracked, vec!["sin seguimiento.txt"]);
    }

    #[test]
    fn status_handles_special_file_names() {
        let repo = init_repo();
        for name in ["con espacios.txt", "ñandú_日本.txt", "salto\nlinea.txt"] {
            std::fs::write(repo.path().join(name), "x").unwrap();
        }
        let mut untracked = get_status(repo.path()).unwrap().untracked;
        untracked.sort();
        let mut expected = vec!["con espacios.txt", "salto\nlinea.txt", "ñandú_日本.txt"];
        expected.sort();
        assert_eq!(untracked, expected);
    }

    #[test]
    fn status_detects_detached_head() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "a", "uno");
        git(repo.path(), &["checkout", "-q", "--detach"]);
        let s = get_status(repo.path()).unwrap();
        assert!(s.detached_head);
        assert_eq!(s.branch, None);
    }

    #[test]
    fn status_reports_conflicts() {
        let repo = init_repo();
        commit_file(repo.path(), "c.txt", "base\n", "base");
        git(repo.path(), &["checkout", "-q", "-b", "otra"]);
        commit_file(repo.path(), "c.txt", "otra\n", "otra");
        git(repo.path(), &["checkout", "-q", "main"]);
        commit_file(repo.path(), "c.txt", "main\n", "main");
        let merge = std::process::Command::new("git")
            .args(["merge", "otra"])
            .current_dir(repo.path())
            .output()
            .unwrap();
        assert!(!merge.status.success());
        let s = get_status(repo.path()).unwrap();
        assert_eq!(s.unstaged[0].kind, ChangeKind::Conflicted);
    }

    #[test]
    fn commits_of_empty_repository_is_empty_page() {
        let repo = init_repo();
        let page = list_commits(repo.path(), None, 100).unwrap();
        assert!(page.commits.is_empty());
        assert_eq!(page.next_cursor, None);
    }

    #[test]
    fn commits_are_paginated() {
        let repo = init_repo();
        for i in 0..120 {
            git(
                repo.path(),
                &["commit", "-q", "--allow-empty", "-m", &format!("c{i}")],
            );
        }
        let first = list_commits(repo.path(), None, 100).unwrap();
        assert_eq!(first.commits.len(), 100);
        assert_eq!(first.commits[0].subject, "c119");
        assert_eq!(first.commits[0].author, "Prueba");
        assert!(first.commits[0].refs.iter().any(|r| r.contains("main")));
        let cursor = first.next_cursor.expect("debe haber otra página");

        let second = list_commits(repo.path(), Some(&cursor), 100).unwrap();
        assert_eq!(second.commits.len(), 20);
        assert_eq!(second.next_cursor, None);
        assert_eq!(second.commits[19].subject, "c0");
    }

    #[test]
    fn rejects_invalid_cursor() {
        let repo = init_repo();
        assert!(list_commits(repo.path(), Some("abc"), 10).is_err());
    }

    #[test]
    fn get_commit_returns_body_and_refs() {
        let repo = init_repo();
        git(
            repo.path(),
            &[
                "commit",
                "-q",
                "--allow-empty",
                "-m",
                "Asunto",
                "-m",
                "Cuerpo <i>html</i>",
            ],
        );
        let page = list_commits(repo.path(), None, 10).unwrap();
        let oid = &page.commits[0].oid;
        let detail = get_commit(repo.path(), oid).unwrap();
        assert_eq!(detail.commit.subject, "Asunto");
        assert_eq!(detail.body, "Cuerpo <i>html</i>");
        assert_eq!(detail.committer, "Prueba");
        assert!(detail
            .commit
            .refs
            .contains(&"HEAD -> refs/heads/main".to_string()));
    }

    #[test]
    fn get_commit_rejects_option_like_and_unknown_oids() {
        let repo = init_repo();
        git(repo.path(), &["commit", "-q", "--allow-empty", "-m", "uno"]);
        assert_eq!(
            get_commit(repo.path(), "--output=/tmp/x").unwrap_err().kind,
            crate::git::error::GitErrorKind::InvalidInput
        );
        assert!(get_commit(repo.path(), "deadbeefdeadbeef").is_err());
    }

    #[test]
    fn commits_use_full_ref_names() {
        let repo = init_repo();
        git(repo.path(), &["commit", "-q", "--allow-empty", "-m", "uno"]);
        git(repo.path(), &["tag", "v1"]);
        let page = list_commits(repo.path(), None, 10).unwrap();
        let refs = &page.commits[0].refs;
        assert!(refs.contains(&"HEAD -> refs/heads/main".to_string()));
        assert!(refs.contains(&"tag: refs/tags/v1".to_string()));
    }

    /// Medición manual (no corre en CI):
    /// `GL_PERF_REPO=<ruta> cargo test --release perf_list_commits -- --ignored --nocapture`
    #[test]
    #[ignore = "medición manual; ver docs/performance.md"]
    fn perf_list_commits() {
        let Ok(path) = std::env::var("GL_PERF_REPO") else {
            return;
        };
        let repo = Path::new(&path);
        let total: usize = String::from_utf8_lossy(
            &run_git(repo, ["rev-list", "--all", "--count"])
                .unwrap()
                .stdout,
        )
        .trim()
        .parse()
        .unwrap();

        let measure = |label: &str, cursor: Option<String>| {
            let started = std::time::Instant::now();
            let page = list_commits(repo, cursor.as_deref(), 500).unwrap();
            println!(
                "PERF commits={total} {label}: {:?} ({} filas)",
                started.elapsed(),
                page.commits.len()
            );
        };
        measure("primera página", None);
        measure("página media", Some((total / 2).to_string()));
        measure("última página", Some(total.saturating_sub(500).to_string()));

        let started = std::time::Instant::now();
        get_status(repo).unwrap();
        println!("PERF commits={total} get_status: {:?}", started.elapsed());
    }
}
