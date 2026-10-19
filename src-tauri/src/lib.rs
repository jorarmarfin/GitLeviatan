mod commands;
mod git;
mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(git::repository::Repositories::default())
        .manage(git::sync::Operations::default())
        .setup(|app| {
            use tauri::Manager;
            let dir = app.path().app_config_dir()?;
            app.manage(commands::SettingsState::load(dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_version,
            commands::open_repository,
            commands::list_recent_repositories,
            commands::get_status,
            commands::list_commits,
            commands::get_commit,
            commands::stage_files,
            commands::unstage_files,
            commands::stage_all,
            commands::unstage_all,
            commands::get_diff,
            commands::create_commit,
            commands::list_branches,
            commands::create_branch,
            commands::checkout_branch,
            commands::delete_branch,
            commands::clear_recent_repositories,
            commands::remove_recent_repository,
            commands::get_settings,
            commands::update_settings,
            commands::detect_git,
            commands::list_remotes,
            commands::fetch,
            commands::pull,
            commands::push,
            commands::clone_repository,
            commands::cancel_operation,
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar la aplicación Tauri");
}
