//! Frontera pública de Tauri: cada comando expuesto al frontend vive aquí.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::git::branches;
use crate::git::diff;
use crate::git::error::AppError;
use crate::git::operations;
use crate::git::process::{check_git, set_git_path};
use crate::git::remotes;
use crate::git::repository::{self, Repositories};
use crate::git::sync::{self, Operations, SyncContext};
use crate::git::types::{
    BranchInfo, CommitDetail, CommitPage, CommitResult, DeleteBranchOutcome, DiffScope, FileDiff,
    RecentRepository, RemoteInfo, RepositoryRef, RepositoryStatus, SyncProgress,
};
use crate::git::write;
use crate::storage::recent::RecentStore;
use crate::storage::settings::{Settings, SettingsStore};

/// Versión de la app: la de `tauri.conf.json`, la misma que llevan los instaladores.
#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Ejecuta trabajo bloqueante (procesos Git) fuera del hilo de la UI.
async fn blocking<T, F>(work: F) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, AppError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| AppError::internal(error.to_string()))?
}

/// Preferencias en memoria más el archivo donde se persisten. Un único escritor.
pub struct SettingsState {
    store: SettingsStore,
    current: Mutex<Settings>,
}

impl SettingsState {
    /// Lee `settings.json` (recuperándolo si está corrupto) y aplica la ruta de Git.
    pub fn load(config_dir: PathBuf) -> Self {
        let store = SettingsStore::new(config_dir.join("settings.json"));
        let current = store.load();
        set_git_path(current.git_path.clone().map(PathBuf::from));
        Self {
            store,
            current: Mutex::new(current),
        }
    }

    fn get(&self) -> Settings {
        self.current
            .lock()
            .expect("preferencias envenenadas")
            .clone()
    }
}

fn config_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    app.path()
        .app_config_dir()
        .map_err(|error| AppError::internal(error.to_string()))
}

fn recent_store(app: &AppHandle, settings: &SettingsState) -> Result<RecentStore, AppError> {
    let limit = settings.get().max_recent_repositories as usize;
    Ok(RecentStore::new(
        config_dir(app)?.join("recent.json"),
        limit,
    ))
}

#[tauri::command]
pub async fn open_repository(
    app: AppHandle,
    repositories: State<'_, Repositories>,
    settings: State<'_, SettingsState>,
    path: String,
) -> Result<RepositoryRef, AppError> {
    open_path(&app, &repositories, &settings, path).await
}

async fn open_path(
    app: &AppHandle,
    repositories: &Repositories,
    settings: &SettingsState,
    path: String,
) -> Result<RepositoryRef, AppError> {
    let top = blocking(move || repository::resolve_toplevel(Path::new(&path))).await?;
    let repo = repositories.register(top);

    // Fallar al guardar recientes no debe impedir abrir el repositorio.
    if let Ok(store) = recent_store(app, settings) {
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
pub async fn list_recent_repositories(
    app: AppHandle,
    settings: State<'_, SettingsState>,
) -> Result<Vec<RecentRepository>, AppError> {
    let store = recent_store(&app, &settings)?;
    blocking(move || Ok(store.load())).await
}

#[tauri::command]
pub async fn clear_recent_repositories(
    app: AppHandle,
    settings: State<'_, SettingsState>,
) -> Result<(), AppError> {
    let store = recent_store(&app, &settings)?;
    blocking(move || store.clear().map_err(AppError::io)).await
}

/// Quita un proyecto de la lista de recientes. No toca el repositorio ni el disco.
#[tauri::command]
pub async fn remove_recent_repository(
    app: AppHandle,
    settings: State<'_, SettingsState>,
    path: String,
) -> Result<(), AppError> {
    let store = recent_store(&app, &settings)?;
    blocking(move || store.remove(&path).map_err(AppError::io)).await
}

#[tauri::command]
pub fn get_settings(settings: State<'_, SettingsState>) -> Settings {
    settings.get()
}

/// Valida y guarda las preferencias. Si algo no es válido (rango, ruta de Git) no se
/// guarda nada. Una ruta de Git nueva se aplica a las operaciones siguientes.
#[tauri::command]
pub async fn update_settings(
    app: AppHandle,
    settings: State<'_, SettingsState>,
    new_settings: Settings,
) -> Result<Settings, AppError> {
    let validated = blocking(move || new_settings.validated()).await?;
    let mut current = settings.current.lock().expect("preferencias envenenadas");
    settings.store.save(&validated).map_err(AppError::io)?;
    set_git_path(validated.git_path.clone().map(PathBuf::from));
    *current = validated.clone();
    drop(current);

    // Si bajó el límite, la lista de recientes se recorta de inmediato.
    if let Ok(store) = recent_store(&app, &settings) {
        if let Err(error) = store.enforce_limit() {
            eprintln!("no se pudo recortar recent.json: {error}");
        }
    }
    Ok(validated)
}

/// Resultado de buscar Git con la configuración actual.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    pub available: bool,
    pub version: Option<String>,
    pub message: Option<String>,
}

#[tauri::command]
pub async fn detect_git() -> GitInfo {
    let result = blocking(|| check_git(None)).await;
    match result {
        Ok(version) => GitInfo {
            available: true,
            version: Some(version),
            message: None,
        },
        Err(error) => GitInfo {
            available: false,
            version: None,
            message: Some(error.message),
        },
    }
}

#[tauri::command]
pub async fn get_status(
    repositories: State<'_, Repositories>,
    repository_id: String,
) -> Result<RepositoryStatus, AppError> {
    let path = repositories.path(&repository_id)?;
    blocking(move || operations::get_status(&path)).await
}

#[tauri::command]
pub async fn list_commits(
    repositories: State<'_, Repositories>,
    repository_id: String,
    cursor: Option<String>,
    limit: usize,
) -> Result<CommitPage, AppError> {
    let path = repositories.path(&repository_id)?;
    blocking(move || operations::list_commits(&path, cursor.as_deref(), limit)).await
}

#[tauri::command]
pub async fn get_commit(
    repositories: State<'_, Repositories>,
    repository_id: String,
    oid: String,
) -> Result<CommitDetail, AppError> {
    let path = repositories.path(&repository_id)?;
    blocking(move || operations::get_commit(&path, &oid)).await
}

#[tauri::command]
pub async fn stage_files(
    repositories: State<'_, Repositories>,
    repository_id: String,
    paths: Vec<String>,
) -> Result<(), AppError> {
    let repo = repositories.path(&repository_id)?;
    blocking(move || write::stage_files(&repo, &paths)).await
}

#[tauri::command]
pub async fn unstage_files(
    repositories: State<'_, Repositories>,
    repository_id: String,
    paths: Vec<String>,
) -> Result<(), AppError> {
    let repo = repositories.path(&repository_id)?;
    blocking(move || write::unstage_files(&repo, &paths)).await
}

/// Prepara todo el repositorio (`git add -A`).
#[tauri::command]
pub async fn stage_all(
    repositories: State<'_, Repositories>,
    repository_id: String,
) -> Result<(), AppError> {
    let repo = repositories.path(&repository_id)?;
    blocking(move || write::stage_all(&repo)).await
}

/// Quita todo de staged (`git reset -q`) sin tocar el working tree.
#[tauri::command]
pub async fn unstage_all(
    repositories: State<'_, Repositories>,
    repository_id: String,
) -> Result<(), AppError> {
    let repo = repositories.path(&repository_id)?;
    blocking(move || write::unstage_all(&repo)).await
}

#[tauri::command]
pub async fn get_diff(
    repositories: State<'_, Repositories>,
    repository_id: String,
    path: String,
    scope: DiffScope,
) -> Result<FileDiff, AppError> {
    let repo = repositories.path(&repository_id)?;
    blocking(move || diff::get_diff(&repo, &path, scope)).await
}

#[tauri::command]
pub async fn create_commit(
    repositories: State<'_, Repositories>,
    repository_id: String,
    message: String,
) -> Result<CommitResult, AppError> {
    let repo = repositories.path(&repository_id)?;
    blocking(move || write::create_commit(&repo, &message)).await
}

#[tauri::command]
pub async fn list_branches(
    repositories: State<'_, Repositories>,
    repository_id: String,
) -> Result<Vec<BranchInfo>, AppError> {
    let repo = repositories.path(&repository_id)?;
    blocking(move || branches::list_branches(&repo)).await
}

#[tauri::command]
pub async fn create_branch(
    repositories: State<'_, Repositories>,
    repository_id: String,
    name: String,
    start_point: Option<String>,
) -> Result<(), AppError> {
    let repo = repositories.path(&repository_id)?;
    blocking(move || branches::create_branch(&repo, &name, start_point.as_deref())).await
}

#[tauri::command]
pub async fn checkout_branch(
    repositories: State<'_, Repositories>,
    repository_id: String,
    branch: String,
) -> Result<(), AppError> {
    let repo = repositories.path(&repository_id)?;
    blocking(move || branches::checkout_branch(&repo, &branch)).await
}

#[tauri::command]
pub async fn delete_branch(
    repositories: State<'_, Repositories>,
    repository_id: String,
    branch: String,
    force: bool,
) -> Result<DeleteBranchOutcome, AppError> {
    let repo = repositories.path(&repository_id)?;
    blocking(move || branches::delete_branch(&repo, &branch, force)).await
}

#[tauri::command]
pub async fn list_remotes(
    repositories: State<'_, Repositories>,
    repository_id: String,
) -> Result<Vec<RemoteInfo>, AppError> {
    let repo = repositories.path(&repository_id)?;
    blocking(move || remotes::list_remotes(&repo)).await
}

/// Registra la operación, la ejecuta fuera del hilo de la UI emitiendo `sync-progress`
/// y la da de baja al terminar (con o sin error).
async fn run_sync<T, F>(app: &AppHandle, operations: &Operations, work: F) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce(&mut SyncContext) -> Result<T, AppError> + Send + 'static,
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
    joined.map_err(|error| AppError::invalid_input(error.to_string()))?
}

#[tauri::command]
pub async fn fetch(
    app: AppHandle,
    repositories: State<'_, Repositories>,
    operations: State<'_, Operations>,
    repository_id: String,
    remote: String,
) -> Result<(), AppError> {
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
) -> Result<(), AppError> {
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
) -> Result<(), AppError> {
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
    settings: State<'_, SettingsState>,
    url: String,
    dest_dir: String,
) -> Result<RepositoryRef, AppError> {
    let dest = std::path::PathBuf::from(&dest_dir);
    run_sync(&app, &operations, move |ctx| sync::clone(&url, &dest, ctx)).await?;
    open_path(&app, &repositories, &settings, dest_dir).await
}

/// Cancela una operación en curso; no falla si ya terminó.
#[tauri::command]
pub fn cancel_operation(operations: State<'_, Operations>, operation_id: String) -> bool {
    operations.cancel(&operation_id)
}
