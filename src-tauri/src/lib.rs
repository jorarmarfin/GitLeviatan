mod commands;
mod git;
mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(git::repository::Repositories::default())
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::open_repository,
            commands::list_recent_repositories,
            commands::get_status,
            commands::list_commits,
            commands::get_commit,
            commands::stage_files,
            commands::unstage_files,
            commands::get_diff,
            commands::create_commit,
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar la aplicación Tauri");
}
