mod ai;
mod commands;
mod db;
mod error;
mod library;
mod state;

use std::sync::Arc;

use tauri::Manager;

use crate::ai::{AiRegistry, mock::MockProvider};
use crate::db::Database;
use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let db = Database::open(&data_dir.join("workspace.db"))?;
            let ai = AiRegistry::new(vec![Arc::new(MockProvider::default())]);
            app.manage(AppState { db, ai, data_dir });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::conversations_list,
            commands::conversations_create,
            commands::conversations_rename,
            commands::conversations_set_project,
            commands::conversations_delete,
            commands::conversations_delete_all,
            commands::messages_list,
            commands::messages_append,
            commands::projects_list,
            commands::projects_create,
            commands::projects_update,
            commands::projects_delete,
            commands::documents_list,
            commands::documents_import,
            commands::documents_set_project,
            commands::documents_remove,
            commands::documents_reveal,
            commands::settings_load,
            commands::settings_save,
            commands::app_info,
            commands::app_reveal_data_dir,
            commands::ai_providers,
            commands::ai_stream_chat,
            commands::ai_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
