use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use super::error::GitError;
use super::process::run_git;
use super::types::RepositoryRef;

/// Valida que `path` esté dentro de un working tree Git y devuelve su raíz.
pub fn resolve_toplevel(path: &Path) -> Result<PathBuf, GitError> {
    let bare = run_git(path, ["rev-parse", "--is-bare-repository"]).map_err(|error| {
        let detail = error.detail.as_deref().unwrap_or("");
        if detail.contains("not a git repository") {
            GitError::not_a_repository()
        } else {
            error
        }
    })?;
    if String::from_utf8_lossy(&bare.stdout).trim() == "true" {
        return Err(GitError::bare_repository());
    }

    let top = run_git(path, ["rev-parse", "--show-toplevel"])?;
    let top = String::from_utf8_lossy(&top.stdout).trim_end().to_string();
    if top.is_empty() {
        return Err(GitError::not_a_repository());
    }
    Ok(PathBuf::from(top))
}

#[derive(Default)]
struct Registry {
    next: u64,
    by_path: HashMap<PathBuf, String>,
    by_id: HashMap<String, PathBuf>,
}

/// Repositorios abiertos: asigna y resuelve los `repositoryId` del frontend.
#[derive(Default)]
pub struct Repositories {
    inner: Mutex<Registry>,
}

impl Repositories {
    pub fn register(&self, top: PathBuf) -> RepositoryRef {
        let mut registry = self
            .inner
            .lock()
            .expect("registro de repositorios envenenado");
        let id = match registry.by_path.get(&top) {
            Some(id) => id.clone(),
            None => {
                registry.next += 1;
                let id = format!("repo-{}", registry.next);
                registry.by_path.insert(top.clone(), id.clone());
                registry.by_id.insert(id.clone(), top.clone());
                id
            }
        };
        let name = top
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| top.to_string_lossy().into_owned());
        RepositoryRef {
            id,
            path: top.to_string_lossy().into_owned(),
            name,
        }
    }

    pub fn path(&self, id: &str) -> Result<PathBuf, GitError> {
        let registry = self
            .inner
            .lock()
            .expect("registro de repositorios envenenado");
        registry
            .by_id
            .get(id)
            .cloned()
            .ok_or_else(|| GitError::invalid_input(format!("Repositorio desconocido: {id}")))
    }
}

#[cfg(test)]
mod tests {
    use super::super::error::GitErrorKind;
    use super::super::testutil::{git, init_repo};
    use super::*;

    #[test]
    fn resolves_toplevel_from_subdirectory() {
        let repo = init_repo();
        std::fs::create_dir(repo.path().join("sub")).unwrap();
        let top = resolve_toplevel(&repo.path().join("sub")).unwrap();
        assert_eq!(
            top.canonicalize().unwrap(),
            repo.path().canonicalize().unwrap()
        );
    }

    #[test]
    fn rejects_non_repository() {
        let dir = tempfile::tempdir().unwrap();
        let err = resolve_toplevel(dir.path()).unwrap_err();
        assert_eq!(err.kind, GitErrorKind::NotARepository);
    }

    #[test]
    fn rejects_bare_repository() {
        let dir = tempfile::tempdir().unwrap();
        git(dir.path(), &["init", "-q", "--bare"]);
        let err = resolve_toplevel(dir.path()).unwrap_err();
        assert_eq!(err.kind, GitErrorKind::BareRepository);
    }

    #[test]
    fn registry_reuses_id_for_same_path() {
        let repos = Repositories::default();
        let a = repos.register(PathBuf::from("/tmp/a"));
        let again = repos.register(PathBuf::from("/tmp/a"));
        let b = repos.register(PathBuf::from("/tmp/b"));
        assert_eq!(a.id, again.id);
        assert_ne!(a.id, b.id);
        assert_eq!(repos.path(&a.id).unwrap(), PathBuf::from("/tmp/a"));
        assert!(repos.path("nope").is_err());
    }
}
