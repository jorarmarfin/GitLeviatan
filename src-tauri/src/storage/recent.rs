use std::fs;
use std::io;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::git::types::RecentRepository;

const VERSION: u32 = 1;

#[derive(Serialize, Deserialize)]
struct RecentFile {
    version: u32,
    repositories: Vec<RecentRepository>,
}

/// Repositorios recientes en `recent.json` (versionado, escritura atómica).
pub struct RecentStore {
    path: PathBuf,
    /// Cuántos repositorios se conservan (preferencia `maxRecentRepositories`).
    limit: usize,
}

impl RecentStore {
    pub fn new(path: PathBuf, limit: usize) -> Self {
        Self { path, limit }
    }

    /// Un archivo ausente, corrupto o de otra versión se trata como lista vacía.
    pub fn load(&self) -> Vec<RecentRepository> {
        let Ok(text) = fs::read_to_string(&self.path) else {
            return Vec::new();
        };
        match serde_json::from_str::<RecentFile>(&text) {
            Ok(file) if file.version == VERSION => file.repositories,
            _ => Vec::new(),
        }
    }

    pub fn record(&self, repository: RecentRepository) -> io::Result<()> {
        let mut list = self.load();
        list.retain(|r| r.path != repository.path);
        list.insert(0, repository);
        list.truncate(self.limit);
        self.write(list)
    }

    /// Vacía la lista y persiste el cambio.
    pub fn clear(&self) -> io::Result<()> {
        self.write(Vec::new())
    }

    /// Recorta la lista al límite actual (p. ej. tras bajarlo en preferencias).
    pub fn enforce_limit(&self) -> io::Result<()> {
        let mut list = self.load();
        if list.len() <= self.limit {
            return Ok(());
        }
        list.truncate(self.limit);
        self.write(list)
    }

    fn write(&self, repositories: Vec<RecentRepository>) -> io::Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let file = RecentFile {
            version: VERSION,
            repositories,
        };
        let json = serde_json::to_string_pretty(&file).map_err(io::Error::other)?;
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, json)?;
        fs::rename(&tmp, &self.path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo(n: usize) -> RecentRepository {
        RecentRepository {
            path: format!("/repos/{n}"),
            name: format!("repo{n}"),
            last_opened_at: "2026-10-19T00:00:00Z".into(),
        }
    }

    fn store_with(limit: usize) -> (tempfile::TempDir, RecentStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = RecentStore::new(dir.path().join("cfg").join("recent.json"), limit);
        (dir, store)
    }

    fn store() -> (tempfile::TempDir, RecentStore) {
        store_with(20)
    }

    #[test]
    fn records_most_recent_first_without_duplicates() {
        let (_dir, store) = store();
        store.record(repo(1)).unwrap();
        store.record(repo(2)).unwrap();
        store.record(repo(1)).unwrap();
        let paths: Vec<_> = store.load().into_iter().map(|r| r.path).collect();
        assert_eq!(paths, vec!["/repos/1", "/repos/2"]);
    }

    #[test]
    fn keeps_at_most_twenty() {
        let (_dir, store) = store();
        for n in 0..25 {
            store.record(repo(n)).unwrap();
        }
        let list = store.load();
        assert_eq!(list.len(), 20);
        assert_eq!(list[0].path, "/repos/24");
    }

    #[test]
    fn respects_a_custom_limit() {
        let (_dir, store) = store_with(5);
        for n in 0..8 {
            store.record(repo(n)).unwrap();
        }
        assert_eq!(store.load().len(), 5);
    }

    #[test]
    fn enforce_limit_trims_existing_list() {
        let (dir, store) = store_with(20);
        for n in 0..10 {
            store.record(repo(n)).unwrap();
        }
        let smaller = RecentStore::new(dir.path().join("cfg").join("recent.json"), 6);
        smaller.enforce_limit().unwrap();
        let list = smaller.load();
        assert_eq!(list.len(), 6);
        assert_eq!(list[0].path, "/repos/9");
    }

    #[test]
    fn clear_empties_and_persists() {
        let (dir, store) = store();
        store.record(repo(1)).unwrap();
        store.clear().unwrap();
        assert!(store.load().is_empty());
        let again = RecentStore::new(dir.path().join("cfg").join("recent.json"), 20);
        assert!(again.load().is_empty());
    }

    #[test]
    fn corrupt_file_is_ignored_and_recreated() {
        let (_dir, store) = store();
        fs::create_dir_all(store.path.parent().unwrap()).unwrap();
        fs::write(&store.path, "{ esto no es json").unwrap();
        assert!(store.load().is_empty());
        store.record(repo(1)).unwrap();
        assert_eq!(store.load().len(), 1);
    }

    #[test]
    fn unknown_version_is_ignored() {
        let (_dir, store) = store();
        fs::create_dir_all(store.path.parent().unwrap()).unwrap();
        fs::write(&store.path, r#"{"version":99,"repositories":[]}"#).unwrap();
        assert!(store.load().is_empty());
    }
}
