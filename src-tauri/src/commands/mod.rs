//! Frontera pública de Tauri: cada comando expuesto al frontend vive aquí.

use std::path::Path;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::git::branches;
use crate::git::diff;
use crate::git::error::GitError;
use crate::git::operations;
use crate::git::remotes;
use crate::git::repository::{self, Repositories};
use crate::git::sync::{self, Operations, SyncContext};
use crate::git::sync_error::SyncError;
use crate::git::types::{
    BranchInfo, CommitDetail, CommitPage, CommitResult, DeleteBranchOutcome, DiffScope, FileDiff,
    RecentRepository, RemoteInfo, RepositoryRef, RepositoryStatus, SyncProgress,
};
use crate::git::write;
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
    open_path(&app, &repositories, path).await
}

async fn open_path(
    app: &AppHandle,
    repositories: &Repositories,
    path: String,
) -> Result<RepositoryRef, GitError> {
    let top = blocking(move || repository::resolve_toplevel(Path::new(&path))).await?;
    let repo = repositories.register(top);

    // Fallar al guardar recientes no debe impedir abrir el repositorio.
    if let Ok(store) = recent_store(app) {
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

#[tauri::command]
pub async fn stage_files(
    repositories: State<'_, Repositories>,
    repository_id: String,
    paths: Vec<String>,
) -> Result<(), GitError> {
    let repo = repositories.path(&repository_id)?;
    blocking(move || write::stage_files(&repo, &paths)).await
}

#[tauri::command]
pub async fn unstage_files(
    repositories: State<'_, Repositories>,
    repository_id: String,
    paths: Vec<String>,
) -> Result<(), GitError> {
    let repo = repositories.path(&repository_id)?;
    blocking(move || write::unstage_files(&repo, &paths)).await
}

#[tauri::command]
pub async fn get_diff(
    repositories: State<'_, Repositories>,
    repository_id: String,
    path: String,
    scope: DiffScope,
) -> Result<FileDiff, GitError> {
    let repo = repositories.path(&repository_id)?;
    blocking(move || diff::get_diff(&repo, &path, scope)).await
}

#[tauri::command]
pub async fn create_commit(
    repositories: State<'_, Repositories>,
    repository_id: String,
    message: String,
) -> Result<CommitResult, GitError> {
    let repo = repositories.path(&repository_id)?;
    blocking(move || write::create_commit(&repo, &message)).await
}

#[tauri::command]
pub async fn list_branches(
    repositories: State<'_, Repositories>,
    repository_id: String,
) -> Result<Vec<BranchInfo>, GitError> {
    let repo = repositories.path(&repository_id)?;
    blocking(move || branches::list_branches(&repo)).await
}

#[tauri::command]
pub async fn create_branch(
    repositories: State<'_, Repositories>,
    repository_id: String,
    name: String,
    start_point: Option<String>,
) -> Result<(), GitError> {
    let repo = repositories.path(&repository_id)?;
    blocking(move || branches::create_branch(&repo, &name, start_point.as_deref())).await
}

#[tauri::command]
pub async fn checkout_branch(
    repositories: State<'_, Repositories>,
    repository_id: String,
    branch: String,
) -> Result<(), GitError> {
    let repo = repositories.path(&repository_id)?;
    blocking(move || branches::checkout_branch(&repo, &branch)).await
}

#[tauri::command]
pub async fn delete_branch(
    repositories: State<'_, Repositories>,
    repository_id: String,
    branch: String,
    force: bool,
) -> Result<DeleteBranchOutcome, GitError> {
    let repo = repositories.path(&repository_id)?;
    blocking(move || branches::delete_branch(&repo, &branch, force)).await
}

#[tauri::command]
pub async fn list_remotes(
    repositories: State<'_, Repositories>,
    repository_id: String,
) -> Result<Vec<RemoteInfo>, GitError> {
    let repo = repositories.path(&repository_id)?;
    blocking(move || remotes::list_remotes(&repo)).await
}

/// Registra la operación, la ejecuta fuera del hilo de la UI emitiendo `sync-progress`
/// y la da de baja al terminar (con o sin error).
async fn run_sync<T, F>(app: &AppHandle, operations: &Operations, work: F) -> Result<T, SyncError>
where
    T: Send + 'static,
    F: FnOnce(&mut SyncContext) -> Result<T, SyncError> + Send + 'static,
{
    let (id, operation) = operations.start();
    let handle = app.clone();
    let task_id = id.clone();
    let joined = tauri::async_runtime::spawn_blocking(move || {
        let mut emit = |progress: SyncProgress| {
            let _ = handle.emit("sync-progress", &progress);
        };
        let mut ctx = SyncContext {
            operation_id: &task_id,
            operation: &operation,
            emit: &mut emit,
        };
        work(&mut ctx)
    })
    .await;
    operations.finish(&id);
    joined.map_err(|error| SyncError::invalid_input(error.to_string()))?
}

#[tauri::command]
pub async fn fetch(
    app: AppHandle,
    repositories: State<'_, Repositories>,
    operations: State<'_, Operations>,
    repository_id: String,
    remote: String,
) -> Result<(), SyncError> {
    let repo = repositories.path(&repository_id)?;
    run_sync(&app, &operations, move |ctx| {
        sync::fetch(&repo, &remote, ctx)
    })
    .await
}

#[tauri::command]
pub async fn pull(
    app: AppHandle,
    repositories: State<'_, Repositories>,
    operations: State<'_, Operations>,
    repository_id: String,
    remote: String,
    branch: String,
) -> Result<(), SyncError> {
    let repo = repositories.path(&repository_id)?;
    run_sync(&app, &operations, move |ctx| {
        sync::pull(&repo, &remote, &branch, ctx)
    })
    .await
}

#[tauri::command]
pub async fn push(
    app: AppHandle,
    repositories: State<'_, Repositories>,
    operations: State<'_, Operations>,
    repository_id: String,
    remote: String,
    branch: String,
) -> Result<(), SyncError> {
    let repo = repositories.path(&repository_id)?;
    run_sync(&app, &operations, move |ctx| {
        sync::push(&repo, &remote, &branch, ctx)
    })
    .await
}

/// Clona en `dest_dir` (carpeta exacta del nuevo repositorio) y lo abre al terminar.
#[tauri::command]
pub async fn clone_repository(
    app: AppHandle,
    repositories: State<'_, Repositories>,
    operations: State<'_, Operations>,
    url: String,
    dest_dir: String,
) -> Result<RepositoryRef, SyncError> {
    let dest = std::path::PathBuf::from(&dest_dir);
    run_sync(&app, &operations, move |ctx| sync::clone(&url, &dest, ctx)).await?;
    Ok(open_path(&app, &repositories, dest_dir).await?)
}

/// Cancela una operación en curso; no falla si ya terminó.
#[tauri::command]
pub fn cancel_operation(operations: State<'_, Operations>, operation_id: String) -> bool {
    operations.cancel(&operation_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ping_returns_pong() {
        assert_eq!(ping(), "pong");
    }
}
