use std::path::Path;

use super::error::AppError;
use super::parse::{parse_commit_detail, parse_log, parse_status, DETAIL_FORMAT, LOG_FORMAT};
use super::process::run_git;
use super::types::{CommitDetail, CommitPage, RepositoryStatus};

pub const MAX_PAGE_SIZE: usize = 500;

pub fn get_status(repo: &Path) -> Result<RepositoryStatus, AppError> {
    let out = run_git(repo, ["status", "--porcelain=v2", "-z", "--branch"])?;
    parse_status(&out.stdout)
}

/// Historial paginado. `cursor` es un desplazamiento (`--skip`) en texto.
pub fn list_commits(
    repo: &Path,
    cursor: Option<&str>,
    limit: usize,
) -> Result<CommitPage, AppError> {
    let skip: usize = match cursor {
        None => 0,
        Some(value) => value
            .parse()
            .map_err(|_| AppError::invalid_input(format!("Cursor inválido: {value}")))?,
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

pub(crate) fn is_valid_oid(oid: &str) -> bool {
    (4..=64).contains(&oid.len()) && oid.chars().all(|c| c.is_ascii_hexdigit())
}

/// Detalle de un commit. `oid` se valida como hexadecimal para que nunca se
/// interprete como una opción de Git.
pub fn get_commit(repo: &Path, oid: &str) -> Result<CommitDetail, AppError> {
    if !is_valid_oid(oid) {
        return Err(AppError::invalid_input(format!(
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
    use crate::git::testutil::{commit_file, git, init_repo, portable_names};

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
        let names = portable_names(&["con espacios.txt", "ñandú_日本.txt", "salto\nlinea.txt"]);
        for name in &names {
            std::fs::write(repo.path().join(name), "x").unwrap();
        }
        let mut untracked = get_status(repo.path()).unwrap().untracked;
        untracked.sort();
        let mut expected = names;
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
            crate::git::error::AppErrorKind::Validation
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

    /// Un repositorio con `core.autocrlf=true` (Windows) no debe mostrar cambios falsos: el
    /// working tree tiene CRLF y el índice LF, pero para Git son el mismo contenido.
    #[test]
    fn autocrlf_does_not_create_false_changes() {
        let repo = init_repo();
        git(repo.path(), &["config", "core.autocrlf", "true"]);
        std::fs::write(repo.path().join("a.txt"), "uno\r\ndos\r\n").unwrap();
        std::fs::write(repo.path().join("b.txt"), "tres\r\n").unwrap();
        git(repo.path(), &["add", "--", "a.txt", "b.txt"]);
        git(repo.path(), &["commit", "-q", "-m", "inicial"]);

        let clean = get_status(repo.path()).unwrap();
        assert!(clean.staged.is_empty() && clean.unstaged.is_empty() && clean.untracked.is_empty());

        // Reescribir el mismo contenido (otro editor, otro checkout) tampoco cambia nada.
        std::fs::write(repo.path().join("a.txt"), "uno\r\ndos\r\n").unwrap();
        assert!(get_status(repo.path()).unwrap().unstaged.is_empty());

        // Un cambio real sí aparece, y solo en ese archivo.
        std::fs::write(repo.path().join("a.txt"), "uno\r\nDOS\r\n").unwrap();
        let status = get_status(repo.path()).unwrap();
        assert_eq!(status.unstaged.len(), 1);
        assert_eq!(status.unstaged[0].path, "a.txt");
    }

    /// Umbrales de `tests/perf/thresholds.json` (SPEC 08). Se toma el mejor de 3 intentos
    /// para que el ruido del CI no dé falsos positivos.
    #[test]
    fn perf_stays_within_thresholds() {
        let thresholds: serde_json::Value =
            serde_json::from_str(include_str!("../../../tests/perf/thresholds.json")).unwrap();
        let max_ms = |key: &str| thresholds[key]["maxMs"].as_f64().unwrap();
        let best = |mut work: Box<dyn FnMut()>| {
            (0..3)
                .map(|_| {
                    let started = std::time::Instant::now();
                    work();
                    started.elapsed().as_secs_f64() * 1000.0
                })
                .fold(f64::MAX, f64::min)
        };

        let repo = crate::git::testutil::perf_repo(10_000);
        let path = repo.path().to_path_buf();
        let page = best(Box::new({
            let path = path.clone();
            move || {
                assert_eq!(list_commits(&path, None, 500).unwrap().commits.len(), 500);
            }
        }));
        let status = best(Box::new(move || {
            get_status(&path).unwrap();
        }));
        eprintln!("PERF list_commits(500)={page:.1}ms get_status={status:.1}ms");

        assert!(
            page <= max_ms("backend_list_commits_page_11k"),
            "list_commits tardó {page:.1} ms"
        );
        assert!(
            status <= max_ms("backend_get_status_11k"),
            "get_status tardó {status:.1} ms"
        );
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
