//! Archivos que modificó un commit (respecto a su primer padre) y el diff de cada uno.

use std::path::Path;

use super::diff::diff_between;
use super::error::AppError;
use super::operations::is_valid_oid;
use super::process::{run_git, run_git_with_input};
use super::types::{CommitFile, CommitFileStatus, CommitFiles, FileDiff};
use super::write::validate_relative_path;

/// Máximo de archivos que se listan; `total_files` informa del total real.
pub const MAX_COMMIT_FILES: usize = 500;

fn text(out: &super::process::GitOutput) -> String {
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

/// Oid completo del commit y de su primer padre (`None` en el commit raíz). Sin más padres
/// que mirar: `is_merge` dice si había alguno más.
struct Commit {
    oid: String,
    first_parent: Option<String>,
    is_merge: bool,
}

fn resolve_commit(repo: &Path, oid: &str) -> Result<Commit, AppError> {
    if !is_valid_oid(oid) {
        return Err(AppError::invalid_input(format!(
            "Identificador de commit inválido: {oid}"
        )));
    }
    let full = run_git(
        repo,
        [
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("{oid}^{{commit}}"),
        ],
    )
    .map(|out| text(&out))
    .map_err(|_| AppError::invalid_input(format!("No existe el commit {oid}.")))?;
    let line = run_git(
        repo,
        [
            "rev-list",
            "--parents",
            "-n",
            "1",
            "--end-of-options",
            &full,
        ],
    )?;
    let parents: Vec<String> = text(&line)
        .split_whitespace()
        .skip(1)
        .map(str::to_string)
        .collect();
    Ok(Commit {
        oid: full,
        is_merge: parents.len() > 1,
        first_parent: parents.into_iter().next(),
    })
}

/// Árbol vacío del repositorio (vale también en repositorios SHA-256).
fn empty_tree(repo: &Path) -> Result<String, AppError> {
    run_git_with_input(repo, ["hash-object", "-t", "tree", "--stdin"], b"").map(|out| text(&out))
}

fn status_of(code: &str) -> CommitFileStatus {
    match code.chars().next() {
        Some('A') => CommitFileStatus::Added,
        Some('D') => CommitFileStatus::Deleted,
        Some('R') => CommitFileStatus::Renamed,
        Some('C') => CommitFileStatus::Copied,
        Some('T') => CommitFileStatus::Typechange,
        _ => CommitFileStatus::Modified,
    }
}

/// `--raw -z`: `:modos modos oid oid ESTADO\0ruta\0` (renombrados y copias llevan dos rutas).
fn parse_raw(stdout: &[u8]) -> Result<Vec<(CommitFileStatus, Option<String>, String)>, AppError> {
    let text = String::from_utf8_lossy(stdout);
    let mut tokens = text.split('\0').filter(|t| !t.is_empty());
    let mut entries = Vec::new();
    while let Some(meta) = tokens.next() {
        let unexpected =
            || AppError::internal(format!("Salida de Git inesperada (diff): {meta:?}"));
        let code = meta
            .strip_prefix(':')
            .and_then(|m| m.rsplit(' ').next())
            .ok_or_else(unexpected)?;
        let status = status_of(code);
        let first = tokens.next().ok_or_else(unexpected)?.to_string();
        if matches!(status, CommitFileStatus::Renamed | CommitFileStatus::Copied) {
            let second = tokens.next().ok_or_else(unexpected)?.to_string();
            entries.push((status, Some(first), second));
        } else {
            entries.push((status, None, first));
        }
    }
    Ok(entries)
}

type Counts = (Option<u32>, Option<u32>);

/// `--numstat -z`: `añadidas\teliminadas\truta\0`; en renombrados la ruta va vacía y siguen
/// `origen\0destino\0`. En binarios los contadores son `-`.
fn parse_numstat(stdout: &[u8]) -> Result<Vec<Counts>, AppError> {
    let text = String::from_utf8_lossy(stdout);
    let mut tokens = text.split('\0').filter(|t| !t.is_empty());
    let mut counts = Vec::new();
    while let Some(record) = tokens.next() {
        let mut fields = record.splitn(3, '\t');
        let (Some(added), Some(deleted), Some(path)) =
            (fields.next(), fields.next(), fields.next())
        else {
            return Err(AppError::internal(format!(
                "Salida de Git inesperada (numstat): {record:?}"
            )));
        };
        if path.is_empty() {
            tokens.next();
            tokens.next();
        }
        counts.push((added.parse().ok(), deleted.parse().ok()));
    }
    Ok(counts)
}

/// Archivos modificados por el commit respecto a su primer padre (o al árbol vacío en el commit
/// raíz), recortados a `MAX_COMMIT_FILES`.
pub fn list_commit_files(repo: &Path, oid: &str) -> Result<CommitFiles, AppError> {
    let commit = resolve_commit(repo, oid)?;
    let base = match &commit.first_parent {
        Some(parent) => parent.clone(),
        None => empty_tree(repo)?,
    };
    let diff = |format: &str| {
        run_git(
            repo,
            [
                "diff",
                format,
                "-z",
                "-M",
                "--no-ext-diff",
                "--no-textconv",
                "--no-color",
                &base,
                &commit.oid,
                "--",
            ],
        )
    };
    let raw = parse_raw(&diff("--raw")?.stdout)?;
    let numstat = parse_numstat(&diff("--numstat")?.stdout)?;
    if raw.len() != numstat.len() {
        return Err(AppError::internal(
            "Git devolvió listas de archivos distintas para el mismo commit.",
        ));
    }

    let total_files = raw.len();
    let files = raw
        .into_iter()
        .zip(numstat)
        .take(MAX_COMMIT_FILES)
        .map(
            |((status, orig_path, path), (additions, deletions))| CommitFile {
                path,
                orig_path,
                status,
                additions,
                deletions,
                is_binary: additions.is_none() && deletions.is_none(),
            },
        )
        .collect::<Vec<_>>();
    Ok(CommitFiles {
        oid: commit.oid,
        compared_with: commit.first_parent,
        is_merge: commit.is_merge,
        total_files,
        truncated: total_files > files.len(),
        files,
    })
}

/// Diff de un archivo del commit: la versión del primer padre (en renombrados, con su ruta
/// original) contra la del commit.
pub fn get_commit_file_diff(
    repo: &Path,
    oid: &str,
    path: &str,
    orig_path: Option<&str>,
) -> Result<FileDiff, AppError> {
    validate_relative_path(path)?;
    if let Some(orig) = orig_path {
        validate_relative_path(orig)?;
    }
    let commit = resolve_commit(repo, oid)?;
    let original = commit
        .first_parent
        .as_ref()
        .map(|parent| format!("{parent}:{}", orig_path.unwrap_or(path)));
    diff_between(
        repo,
        path,
        original.as_deref(),
        &format!("{}:{path}", commit.oid),
    )
}

#[cfg(test)]
mod tests {
    use super::super::diff::MAX_DIFF_BYTES;
    use super::*;
    use crate::git::error::AppErrorKind;
    use crate::git::testutil::{commit_file, git, init_repo, portable_names};

    fn head(repo: &Path) -> String {
        text(&run_git(repo, ["rev-parse", "HEAD"]).unwrap())
    }

    fn summary(files: &CommitFiles) -> Vec<(String, CommitFileStatus)> {
        files
            .files
            .iter()
            .map(|f| (f.path.clone(), f.status))
            .collect()
    }

    #[test]
    fn lists_added_modified_and_deleted_files_with_line_counts() {
        let repo = init_repo();
        commit_file(repo.path(), "mod.txt", "a\nb\nc\n", "base");
        commit_file(repo.path(), "borrar.txt", "x\ny\n", "base 2");
        std::fs::write(repo.path().join("mod.txt"), "a\nB\nc\nd\n").unwrap();
        std::fs::write(repo.path().join("nuevo.txt"), "1\n2\n3\n").unwrap();
        std::fs::remove_file(repo.path().join("borrar.txt")).unwrap();
        git(repo.path(), &["add", "-A"]);
        git(repo.path(), &["commit", "-q", "-m", "cambios"]);

        let files = list_commit_files(repo.path(), &head(repo.path())).unwrap();
        assert_eq!(
            summary(&files),
            vec![
                ("borrar.txt".to_string(), CommitFileStatus::Deleted),
                ("mod.txt".to_string(), CommitFileStatus::Modified),
                ("nuevo.txt".to_string(), CommitFileStatus::Added),
            ]
        );
        let by_name = |n: &str| files.files.iter().find(|f| f.path == n).unwrap();
        assert_eq!(
            (
                by_name("borrar.txt").additions,
                by_name("borrar.txt").deletions
            ),
            (Some(0), Some(2))
        );
        assert_eq!(
            (by_name("mod.txt").additions, by_name("mod.txt").deletions),
            (Some(2), Some(1))
        );
        assert_eq!(
            (
                by_name("nuevo.txt").additions,
                by_name("nuevo.txt").deletions
            ),
            (Some(3), Some(0))
        );
        assert!(files
            .files
            .iter()
            .all(|f| !f.is_binary && f.orig_path.is_none()));
        assert_eq!(files.total_files, 3);
        assert!(!files.truncated && !files.is_merge);
        assert!(files.compared_with.is_some());
    }

    #[test]
    fn a_short_oid_is_accepted_and_the_full_one_is_returned() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "x\n", "base");
        let full = head(repo.path());
        let files = list_commit_files(repo.path(), &full[..8]).unwrap();
        assert_eq!(files.oid, full);
    }

    #[test]
    fn the_root_commit_lists_everything_as_added() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "uno\n", "raíz");
        std::fs::write(repo.path().join("b.txt"), "dos\n").unwrap();
        git(repo.path(), &["add", "b.txt"]);
        git(
            repo.path(),
            &["commit", "-q", "--amend", "-m", "raíz con dos"],
        );

        let files = list_commit_files(repo.path(), &head(repo.path())).unwrap();
        assert_eq!(files.compared_with, None);
        assert!(!files.is_merge);
        assert!(files
            .files
            .iter()
            .all(|f| f.status == CommitFileStatus::Added));
        assert_eq!(files.total_files, 2);
    }

    #[test]
    fn renames_report_the_original_path() {
        let repo = init_repo();
        let content = "línea de contenido suficiente para detectar el renombrado\n".repeat(20);
        commit_file(repo.path(), "viejo.txt", &content, "base");
        git(repo.path(), &["mv", "viejo.txt", "nuevo.txt"]);
        git(repo.path(), &["commit", "-q", "-m", "renombra"]);

        let files = list_commit_files(repo.path(), &head(repo.path())).unwrap();
        assert_eq!(files.files.len(), 1);
        let file = &files.files[0];
        assert_eq!(file.status, CommitFileStatus::Renamed);
        assert_eq!(file.path, "nuevo.txt");
        assert_eq!(file.orig_path.as_deref(), Some("viejo.txt"));
        assert_eq!((file.additions, file.deletions), (Some(0), Some(0)));
    }

    #[test]
    fn binary_files_have_no_line_counts() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "x\n", "base");
        std::fs::write(repo.path().join("img.bin"), [0u8, 1, 2, 3, 0, 255]).unwrap();
        git(repo.path(), &["add", "img.bin"]);
        git(repo.path(), &["commit", "-q", "-m", "binario"]);

        let files = list_commit_files(repo.path(), &head(repo.path())).unwrap();
        let file = &files.files[0];
        assert!(file.is_binary);
        assert_eq!((file.additions, file.deletions), (None, None));
    }

    #[test]
    fn a_merge_commit_is_compared_with_its_first_parent() {
        let repo = init_repo();
        commit_file(repo.path(), "base.txt", "x\n", "base");
        git(repo.path(), &["switch", "-q", "-c", "feature"]);
        commit_file(repo.path(), "feature.txt", "f\n", "en feature");
        git(repo.path(), &["switch", "-q", "main"]);
        commit_file(repo.path(), "main.txt", "m\n", "en main");
        let first_parent = head(repo.path());
        git(
            repo.path(),
            &["merge", "-q", "--no-ff", "-m", "fusión", "feature"],
        );

        let files = list_commit_files(repo.path(), &head(repo.path())).unwrap();
        assert!(files.is_merge);
        assert_eq!(files.compared_with.as_deref(), Some(first_parent.as_str()));
        assert_eq!(
            summary(&files),
            vec![("feature.txt".to_string(), CommitFileStatus::Added)]
        );
    }

    #[test]
    fn a_commit_without_changes_has_an_empty_list() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "x\n", "base");
        git(
            repo.path(),
            &["commit", "-q", "--allow-empty", "-m", "vacío"],
        );
        let files = list_commit_files(repo.path(), &head(repo.path())).unwrap();
        assert!(files.files.is_empty());
        assert_eq!(files.total_files, 0);
    }

    #[test]
    fn handles_special_file_names() {
        let repo = init_repo();
        commit_file(repo.path(), "base.txt", "x\n", "base");
        let names = portable_names(&[
            "con espacios.txt",
            "ñandú_日本.txt",
            "salto\nlinea.txt",
            "tab\there.txt",
        ]);
        for name in &names {
            std::fs::write(repo.path().join(name), "contenido\n").unwrap();
        }
        git(repo.path(), &["add", "-A"]);
        git(repo.path(), &["commit", "-q", "-m", "nombres raros"]);

        let files = list_commit_files(repo.path(), &head(repo.path())).unwrap();
        let mut listed: Vec<&str> = files.files.iter().map(|f| f.path.as_str()).collect();
        listed.sort_unstable();
        let mut expected = names.clone();
        expected.sort_unstable();
        assert_eq!(listed, expected);
        for file in &files.files {
            let diff = get_commit_file_diff(repo.path(), &files.oid, &file.path, None).unwrap();
            assert_eq!(diff.modified, "contenido\n", "{}", file.path);
        }
    }

    #[test]
    fn caps_the_list_at_500_files_and_reports_the_real_total() {
        let repo = init_repo();
        commit_file(repo.path(), "base.txt", "x\n", "base");
        for i in 0..(MAX_COMMIT_FILES + 7) {
            std::fs::write(repo.path().join(format!("f{i:04}.txt")), "x\n").unwrap();
        }
        git(repo.path(), &["add", "-A"]);
        git(repo.path(), &["commit", "-q", "-m", "muchos"]);

        let files = list_commit_files(repo.path(), &head(repo.path())).unwrap();
        assert_eq!(files.files.len(), MAX_COMMIT_FILES);
        assert_eq!(files.total_files, MAX_COMMIT_FILES + 7);
        assert!(files.truncated);
        assert_eq!(files.files[0].path, "f0000.txt");
    }

    #[test]
    fn rejects_invalid_and_unknown_commits() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "x\n", "base");
        for bad in ["", "--all", "-x", "no-es-hex", "zzzz", "main"] {
            assert_eq!(
                list_commit_files(repo.path(), bad).unwrap_err().kind,
                AppErrorKind::Validation,
                "{bad:?}"
            );
        }
        let unknown = "a".repeat(40);
        let error = list_commit_files(repo.path(), &unknown).unwrap_err();
        assert_eq!(error.kind, AppErrorKind::Validation);
        assert!(error.message.contains("No existe el commit"));
    }

    #[test]
    fn diff_of_a_modified_file_compares_parent_and_commit() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "uno\n", "base");
        commit_file(repo.path(), "a.txt", "dos\n", "cambia");
        let diff = get_commit_file_diff(repo.path(), &head(repo.path()), "a.txt", None).unwrap();
        assert_eq!(
            (diff.original.as_str(), diff.modified.as_str()),
            ("uno\n", "dos\n")
        );
        assert!(!diff.is_binary && !diff.too_large);
        assert_eq!(diff.path, "a.txt");
    }

    #[test]
    fn diff_of_added_and_deleted_files_has_an_empty_side() {
        let repo = init_repo();
        commit_file(repo.path(), "viejo.txt", "contenido\n", "base");
        std::fs::write(repo.path().join("nuevo.txt"), "nuevo\n").unwrap();
        std::fs::remove_file(repo.path().join("viejo.txt")).unwrap();
        git(repo.path(), &["add", "-A"]);
        git(repo.path(), &["commit", "-q", "-m", "mueve"]);
        let oid = head(repo.path());

        let added = get_commit_file_diff(repo.path(), &oid, "nuevo.txt", None).unwrap();
        assert_eq!(
            (added.original.as_str(), added.modified.as_str()),
            ("", "nuevo\n")
        );
        let deleted = get_commit_file_diff(repo.path(), &oid, "viejo.txt", None).unwrap();
        assert_eq!(
            (deleted.original.as_str(), deleted.modified.as_str()),
            ("contenido\n", "")
        );
    }

    #[test]
    fn diff_of_a_renamed_file_reads_the_original_path() {
        let repo = init_repo();
        let content = "línea de contenido suficiente para detectar el renombrado\n".repeat(20);
        commit_file(repo.path(), "viejo.txt", &content, "base");
        git(repo.path(), &["mv", "viejo.txt", "nuevo.txt"]);
        std::fs::write(repo.path().join("nuevo.txt"), format!("{content}extra\n")).unwrap();
        git(repo.path(), &["add", "-A"]);
        git(repo.path(), &["commit", "-q", "-m", "renombra y edita"]);

        let diff = get_commit_file_diff(
            repo.path(),
            &head(repo.path()),
            "nuevo.txt",
            Some("viejo.txt"),
        )
        .unwrap();
        assert_eq!(diff.original, content);
        assert_eq!(diff.modified, format!("{content}extra\n"));
    }

    #[test]
    fn diff_in_the_root_commit_has_an_empty_original() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "hola\n", "raíz");
        let diff = get_commit_file_diff(repo.path(), &head(repo.path()), "a.txt", None).unwrap();
        assert_eq!(
            (diff.original.as_str(), diff.modified.as_str()),
            ("", "hola\n")
        );
    }

    #[test]
    fn diff_flags_binary_and_large_files_without_content() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "x\n", "base");
        std::fs::write(repo.path().join("img.bin"), [0u8, 1, 2, 3, 0, 255]).unwrap();
        std::fs::write(
            repo.path().join("grande.txt"),
            vec![b'a'; (MAX_DIFF_BYTES + 1) as usize],
        )
        .unwrap();
        git(repo.path(), &["add", "-A"]);
        git(repo.path(), &["commit", "-q", "-m", "binario y grande"]);
        let oid = head(repo.path());

        let binary = get_commit_file_diff(repo.path(), &oid, "img.bin", None).unwrap();
        assert!(binary.is_binary && binary.modified.is_empty());
        let large = get_commit_file_diff(repo.path(), &oid, "grande.txt", None).unwrap();
        assert!(large.too_large && large.modified.is_empty());
    }

    #[test]
    fn diff_rejects_bad_paths_and_commits() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "x\n", "base");
        let oid = head(repo.path());
        for bad in ["../secreto", "/etc/passwd", ""] {
            assert_eq!(
                get_commit_file_diff(repo.path(), &oid, bad, None)
                    .unwrap_err()
                    .kind,
                AppErrorKind::Validation,
                "{bad}"
            );
        }
        assert_eq!(
            get_commit_file_diff(repo.path(), &oid, "a.txt", Some("../x"))
                .unwrap_err()
                .kind,
            AppErrorKind::Validation
        );
        assert_eq!(
            get_commit_file_diff(repo.path(), "--all", "a.txt", None)
                .unwrap_err()
                .kind,
            AppErrorKind::Validation
        );
    }

    #[test]
    fn the_empty_tree_comes_from_the_repository() {
        let repo = init_repo();
        assert_eq!(empty_tree(repo.path()).unwrap().len(), 40);
    }
}
