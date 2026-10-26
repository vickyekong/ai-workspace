/// App commands registered here get generated `allow-*` permissions, so each
/// one must be explicitly granted to a window in `capabilities/`.
const COMMANDS: &[&str] = &[
    "conversations_list",
    "conversations_create",
    "conversations_rename",
    "conversations_set_project",
    "conversations_delete",
    "conversations_delete_all",
    "messages_list",
    "messages_append",
    "projects_list",
    "projects_create",
    "projects_update",
    "projects_delete",
    "documents_list",
    "documents_import",
    "documents_set_project",
    "documents_remove",
    "documents_reveal",
    "settings_load",
    "settings_save",
    "app_info",
    "app_reveal_data_dir",
    "ai_providers",
    "ai_stream_chat",
    "ai_cancel",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
