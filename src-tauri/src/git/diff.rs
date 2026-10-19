//! Contenido de un archivo en dos versiones, listo para un visor de diff.

use std::path::Path;

use super::error::{AppError, AppErrorKind};
use super::process::run_git;
use super::types::{DiffScope, FileDiff};
use super::write::validate_relative_path;

/// Por encima de este tamaño no se envía contenido al frontend.
pub const MAX_DIFF_BYTES: u64 = 1024 * 1024;

/// Misma heurística que Git: un NUL en los primeros 8000 bytes indica binario.
const BINARY_SNIFF_BYTES: usize = 8000;

/// Mensajes de Git cuando un objeto o ruta no existe en esa versión.
const MISSING_MARKERS: [&str; 6] = [
    "does not exist",
    "exists on disk",
    "Not a valid object name",
    "invalid object name",
    "bad revision",
    "unknown revision",
];

enum Side {
    Missing,
    Present { size: u64, bytes: Option<Vec<u8>> },
}

fn is_missing(error: &AppError) -> bool {
    error.kind == AppErrorKind::Git
        && error
            .detail
            .as_deref()
            .is_some_and(|d| MISSING_MARKERS.iter().any(|m| d.contains(m)))
}

/// Lee un blob de Git (`HEAD:ruta` o `:ruta` para el índice). `None` si no existe.
fn read_blob(repo: &Path, spec: &str) -> Result<Side, AppError> {
    let size = match run_git(repo, ["cat-file", "-s", spec]) {
        Ok(out) => String::from_utf8_lossy(&out.stdout)
            .trim()
            .parse::<u64>()
            .map_err(|_| AppError::internal("Tamaño de objeto ilegible."))?,
        Err(error) if is_missing(&error) => return Ok(Side::Missing),
        Err(error) => return Err(error),
    };
    if size > MAX_DIFF_BYTES {
        return Ok(Side::Present { size, bytes: None });
    }
    let out = run_git(repo, ["cat-file", "blob", spec])?;
    Ok(Side::Present {
        size,
        bytes: Some(out.stdout),
    })
}

/// Lee el archivo del working tree. Un enlace simbólico se representa por su destino
/// (como hace Git) y nunca se sigue, para no leer fuera del repositorio.
fn read_worktree(repo: &Path, path: &str) -> Result<Side, AppError> {
    let full = repo.join(path);
    let metadata = match std::fs::symlink_metadata(&full) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Side::Missing),
        Err(e) => return Err(AppError::io(e)),
    };
    if metadata.file_type().is_symlink() {
        let target = std::fs::read_link(&full).map_err(AppError::io)?;
        let bytes = target.to_string_lossy().into_owned().into_bytes();
        return Ok(Side::Present {
            size: bytes.len() as u64,
            bytes: Some(bytes),
        });
    }
    if !metadata.is_file() {
        // Directorios (p. ej. submódulos) u otros tipos: no hay texto que mostrar.
        return Ok(Side::Present {
            size: 0,
            bytes: Some(vec![0]),
        });
    }
    if metadata.len() > MAX_DIFF_BYTES {
        return Ok(Side::Present {
            size: metadata.len(),
            bytes: None,
        });
    }
    let bytes = std::fs::read(&full).map_err(AppError::io)?;
    Ok(Side::Present {
        size: bytes.len() as u64,
        bytes: Some(bytes),
    })
}

/// `core.autocrlf=true` (el valor por defecto de Git para Windows) guarda LF en el índice pero
/// deja CRLF en el working tree. Sin esto el visor mostraría todas las líneas como cambiadas.
fn autocrlf_converts(repo: &Path) -> bool {
    run_git(repo, ["config", "--get", "core.autocrlf"])
        .map(|out| {
            matches!(
                String::from_utf8_lossy(&out.stdout).trim(),
                "true" | "input"
            )
        })
        .unwrap_or(false)
}

/// Quita el `\r` de los `\r\n` del working tree cuando la versión de comparación usa LF.
/// Solo se aplica con `core.autocrlf`: sin él, un cambio de finales de línea es un cambio real.
fn align_line_endings(original: &[u8], modified: Vec<u8>) -> Vec<u8> {
    if original.contains(&b'\r') || !modified.windows(2).any(|pair| pair == b"\r\n") {
        return modified;
    }
    let mut out = Vec::with_capacity(modified.len());
    for (i, byte) in modified.iter().enumerate() {
        if *byte == b'\r' && modified.get(i + 1) == Some(&b'\n') {
            continue;
        }
        out.push(*byte);
    }
    out
}

fn looks_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(BINARY_SNIFF_BYTES).any(|b| *b == 0)
}

pub fn get_diff(repo: &Path, path: &str, scope: DiffScope) -> Result<FileDiff, AppError> {
    validate_relative_path(path)?;

    let (original, modified) = match scope {
        DiffScope::Staged => (
            read_blob(repo, &format!("HEAD:{path}"))?,
            read_blob(repo, &format!(":{path}"))?,
        ),
        DiffScope::Unstaged => (
            read_blob(repo, &format!(":{path}"))?,
            read_worktree(repo, path)?,
        ),
    };

    let too_large = [&original, &modified]
        .iter()
        .any(|side| matches!(side, Side::Present { size, .. } if *size > MAX_DIFF_BYTES));
    let contents = |side: Side| match side {
        Side::Missing => Some(Vec::new()),
        Side::Present { bytes, .. } => bytes,
    };
    let (original, modified) = (contents(original), contents(modified));

    let mut diff = FileDiff {
        path: path.to_string(),
        original: String::new(),
        modified: String::new(),
        is_binary: false,
        too_large,
    };
    if too_large {
        return Ok(diff);
    }
    let (original, modified) = (original.unwrap_or_default(), modified.unwrap_or_default());
    if looks_binary(&original) || looks_binary(&modified) {
        diff.is_binary = true;
        return Ok(diff);
    }
    let modified = if scope == DiffScope::Unstaged && autocrlf_converts(repo) {
        align_line_endings(&original, modified)
    } else {
        modified
    };
    diff.original = String::from_utf8_lossy(&original).into_owned();
    diff.modified = String::from_utf8_lossy(&modified).into_owned();
    Ok(diff)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::testutil::{commit_file, git, init_repo};
    use crate::git::write::stage_files;

    fn autocrlf_repo() -> tempfile::TempDir {
        let repo = init_repo();
        git(repo.path(), &["config", "core.autocrlf", "true"]);
        // Working tree con CRLF, como en Windows; el índice guarda LF.
        std::fs::write(repo.path().join("a.txt"), "uno\r\ndos\r\ntres\r\n").unwrap();
        git(repo.path(), &["add", "--", "a.txt"]);
        git(repo.path(), &["commit", "-q", "-m", "inicial"]);
        repo
    }

    #[test]
    fn autocrlf_does_not_show_every_line_as_changed() {
        let repo = autocrlf_repo();
        std::fs::write(repo.path().join("a.txt"), "uno\r\nCAMBIADA\r\ntres\r\n").unwrap();

        let diff = get_diff(repo.path(), "a.txt", DiffScope::Unstaged).unwrap();
        assert_eq!(diff.original, "uno\ndos\ntres\n");
        assert_eq!(diff.modified, "uno\nCAMBIADA\ntres\n");
    }

    #[test]
    fn without_autocrlf_a_line_ending_change_is_a_real_change() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "uno\ndos\n", "inicial");
        std::fs::write(repo.path().join("a.txt"), "uno\r\ndos\r\n").unwrap();

        let diff = get_diff(repo.path(), "a.txt", DiffScope::Unstaged).unwrap();
        assert_eq!(diff.original, "uno\ndos\n");
        assert_eq!(diff.modified, "uno\r\ndos\r\n");
    }

    #[test]
    fn files_that_really_use_crlf_keep_them() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "uno\r\ndos\r\n", "con CRLF");
        git(repo.path(), &["config", "core.autocrlf", "true"]);
        std::fs::write(repo.path().join("a.txt"), "uno\r\nTRES\r\n").unwrap();

        let diff = get_diff(repo.path(), "a.txt", DiffScope::Unstaged).unwrap();
        assert_eq!(diff.original, "uno\r\ndos\r\n");
        assert_eq!(diff.modified, "uno\r\nTRES\r\n");
    }

    #[test]
    fn align_line_endings_only_touches_crlf_pairs() {
        assert_eq!(
            align_line_endings(b"a\nb\n", b"a\r\nb\r\n".to_vec()),
            b"a\nb\n"
        );
        assert_eq!(
            align_line_endings(b"a\nb\n", b"a\rb\r\n".to_vec()),
            b"a\rb\n"
        );
        assert_eq!(align_line_endings(b"a\r\n", b"a\r\n".to_vec()), b"a\r\n");
    }

    #[test]
    fn unstaged_modification_shows_index_and_worktree() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "uno\n", "base");
        std::fs::write(repo.path().join("a.txt"), "dos\n").unwrap();
        let d = get_diff(repo.path(), "a.txt", DiffScope::Unstaged).unwrap();
        assert_eq!(
            (d.original.as_str(), d.modified.as_str()),
            ("uno\n", "dos\n")
        );
        assert!(!d.is_binary && !d.too_large);
    }

    #[test]
    fn staged_modification_shows_head_and_index() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "uno\n", "base");
        std::fs::write(repo.path().join("a.txt"), "dos\n").unwrap();
        stage_files(repo.path(), &["a.txt".into()]).unwrap();
        std::fs::write(repo.path().join("a.txt"), "tres\n").unwrap();

        let staged = get_diff(repo.path(), "a.txt", DiffScope::Staged).unwrap();
        assert_eq!(
            (staged.original.as_str(), staged.modified.as_str()),
            ("uno\n", "dos\n")
        );
        let unstaged = get_diff(repo.path(), "a.txt", DiffScope::Unstaged).unwrap();
        assert_eq!(
            (unstaged.original.as_str(), unstaged.modified.as_str()),
            ("dos\n", "tres\n")
        );
    }

    #[test]
    fn added_deleted_and_untracked_files() {
        let repo = init_repo();
        commit_file(repo.path(), "viejo.txt", "contenido\n", "base");

        // Añadido (staged) en un árbol con HEAD: no existe en HEAD.
        std::fs::write(repo.path().join("nuevo.txt"), "nuevo\n").unwrap();
        stage_files(repo.path(), &["nuevo.txt".into()]).unwrap();
        let added = get_diff(repo.path(), "nuevo.txt", DiffScope::Staged).unwrap();
        assert_eq!(
            (added.original.as_str(), added.modified.as_str()),
            ("", "nuevo\n")
        );

        // Eliminado (unstaged): sigue en el índice, ya no en disco.
        std::fs::remove_file(repo.path().join("viejo.txt")).unwrap();
        let deleted = get_diff(repo.path(), "viejo.txt", DiffScope::Unstaged).unwrap();
        assert_eq!(
            (deleted.original.as_str(), deleted.modified.as_str()),
            ("contenido\n", "")
        );

        // Sin seguimiento: no está en el índice.
        std::fs::write(repo.path().join("suelto.txt"), "hola\n").unwrap();
        let untracked = get_diff(repo.path(), "suelto.txt", DiffScope::Unstaged).unwrap();
        assert_eq!(
            (untracked.original.as_str(), untracked.modified.as_str()),
            ("", "hola\n")
        );
    }

    #[test]
    fn staged_diff_in_repository_without_commits() {
        let repo = init_repo();
        std::fs::write(repo.path().join("a.txt"), "hola\n").unwrap();
        stage_files(repo.path(), &["a.txt".into()]).unwrap();
        let d = get_diff(repo.path(), "a.txt", DiffScope::Staged).unwrap();
        assert_eq!((d.original.as_str(), d.modified.as_str()), ("", "hola\n"));
    }

    #[test]
    fn binary_files_are_flagged_without_content() {
        let repo = init_repo();
        std::fs::write(repo.path().join("img.bin"), [0u8, 1, 2, 3, 0, 255]).unwrap();
        let d = get_diff(repo.path(), "img.bin", DiffScope::Unstaged).unwrap();
        assert!(d.is_binary);
        assert!(d.original.is_empty() && d.modified.is_empty());
    }

    #[test]
    fn files_over_one_mib_are_flagged_without_content() {
        let repo = init_repo();
        let big = vec![b'a'; (MAX_DIFF_BYTES + 1) as usize];
        std::fs::write(repo.path().join("grande.txt"), &big).unwrap();
        let unstaged = get_diff(repo.path(), "grande.txt", DiffScope::Unstaged).unwrap();
        assert!(unstaged.too_large && unstaged.modified.is_empty());

        git(repo.path(), &["add", "grande.txt"]);
        let staged = get_diff(repo.path(), "grande.txt", DiffScope::Staged).unwrap();
        assert!(staged.too_large && staged.modified.is_empty());
    }

    #[test]
    fn handles_special_file_names() {
        let repo = init_repo();
        for name in ["con espacios.txt", "ñandú_日本.txt", "salto\nlinea.txt"] {
            std::fs::write(repo.path().join(name), format!("contenido de {name}")).unwrap();
            let d = get_diff(repo.path(), name, DiffScope::Unstaged).unwrap();
            assert_eq!(d.modified, format!("contenido de {name}"));
        }
    }

    #[test]
    fn rejects_paths_outside_the_repository() {
        let repo = init_repo();
        for bad in ["../secreto", "/etc/passwd", ""] {
            assert_eq!(
                get_diff(repo.path(), bad, DiffScope::Unstaged)
                    .unwrap_err()
                    .kind,
                AppErrorKind::Validation,
                "{bad}"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_show_their_target_and_never_the_pointed_file() {
        let repo = init_repo();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secreto.txt"), "contraseña").unwrap();
        std::os::unix::fs::symlink(
            outside.path().join("secreto.txt"),
            repo.path().join("enlace"),
        )
        .unwrap();
        let d = get_diff(repo.path(), "enlace", DiffScope::Unstaged).unwrap();
        assert!(d.modified.ends_with("secreto.txt"));
        assert!(!d.modified.contains("contraseña"));
    }
}
