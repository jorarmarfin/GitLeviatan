use std::fs;
use std::io;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::git::types::RecentRepository;

const VERSION: u32 = 1;
pub const MAX_RECENT: usize = 20;

#[derive(Serialize, Deserialize)]
struct RecentFile {
    version: u32,
    repositories: Vec<RecentRepository>,
}

/// Repositorios recientes en `recent.json` (versionado, escritura atómica).
pub struct RecentStore {
    path: PathBuf,
}

impl RecentStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
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
        list.truncate(MAX_RECENT);

        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let file = RecentFile {
            version: VERSION,
            repositories: list,
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

    fn store() -> (tempfile::TempDir, RecentStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = RecentStore::new(dir.path().join("cfg").join("recent.json"));
        (dir, store)
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
        assert_eq!(list.len(), MAX_RECENT);
        assert_eq!(list[0].path, "/repos/24");
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
