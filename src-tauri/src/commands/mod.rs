//! Frontera pública de Tauri: cada comando expuesto al frontend vive aquí.

use std::path::Path;

use tauri::{AppHandle, Manager, State};

use crate::git::error::GitError;
use crate::git::operations;
use crate::git::repository::{self, Repositories};
use crate::git::types::{
    CommitDetail, CommitPage, RecentRepository, RepositoryRef, RepositoryStatus,
};
use crate::storage::recent::RecentStore;

/// Comando de prueba para validar el puente `invoke()` Rust ↔ React.
#[tauri::command]
pub fn ping() -> String {
    "pong".to_string()
}

/// Ejecuta trabajo bloqueante (procesos Git) fuera del hilo de la UI.
async fn blocking<T, F>(work: F) -> Result<T, GitError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, GitError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| GitError::internal(error.to_string()))?
}

fn recent_store(app: &AppHandle) -> Result<RecentStore, GitError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| GitError::internal(error.to_string()))?;
    Ok(RecentStore::new(dir.join("recent.json")))
}

#[tauri::command]
pub async fn open_repository(
    app: AppHandle,
    repositories: State<'_, Repositories>,
    path: String,
) -> Result<RepositoryRef, GitError> {
    let top = blocking(move || repository::resolve_toplevel(Path::new(&path))).await?;
    let repo = repositories.register(top);

    // Fallar al guardar recientes no debe impedir abrir el repositorio.
    if let Ok(store) = recent_store(&app) {
        let entry = RecentRepository {
            path: repo.path.clone(),
            name: repo.name.clone(),
            last_opened_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        };
        if let Err(error) = store.record(entry) {
            eprintln!("no se pudo guardar recent.json: {error}");
        }
    }
    Ok(repo)
}

#[tauri::command]
pub async fn list_recent_repositories(app: AppHandle) -> Result<Vec<RecentRepository>, GitError> {
    let store = recent_store(&app)?;
    blocking(move || Ok(store.load())).await
}

#[tauri::command]
pub async fn get_status(
    repositories: State<'_, Repositories>,
    repository_id: String,
) -> Result<RepositoryStatus, GitError> {
    let path = repositories.path(&repository_id)?;
    blocking(move || operations::get_status(&path)).await
}

#[tauri::command]
pub async fn list_commits(
    repositories: State<'_, Repositories>,
    repository_id: String,
    cursor: Option<String>,
    limit: usize,
) -> Result<CommitPage, GitError> {
    let path = repositories.path(&repository_id)?;
    blocking(move || operations::list_commits(&path, cursor.as_deref(), limit)).await
}

#[tauri::command]
pub async fn get_commit(
    repositories: State<'_, Repositories>,
    repository_id: String,
    oid: String,
) -> Result<CommitDetail, GitError> {
    let path = repositories.path(&repository_id)?;
    blocking(move || operations::get_commit(&path, &oid)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ping_returns_pong() {
        assert_eq!(ping(), "pong");
    }
}
