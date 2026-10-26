//! IPC surface exposed to the webview. Every command is explicitly allow-listed
//! in `capabilities/default.json`; anything not listed here is unreachable.

use std::path::PathBuf;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::ai::{ChatRequest, EventSink, ProviderInfo, StreamEvent};
use crate::db::conversations::{self, Conversation, Message, NewConversation, NewMessage};
use crate::db::documents::{self, Document};
use crate::db::projects::{self, Project, ProjectInput};
use crate::db::settings;
use crate::error::{AppError, AppResult};
use crate::library;
use crate::state::AppState;

const SETTINGS_KEY: &str = "app";

// MARK: Conversations

#[tauri::command]
pub async fn conversations_list(state: State<'_, AppState>) -> AppResult<Vec<Conversation>> {
    conversations::list(&*state.db.conn()?)
}

#[tauri::command]
pub async fn conversations_create(
    state: State<'_, AppState>,
    input: NewConversation,
) -> AppResult<Conversation> {
    conversations::create(&*state.db.conn()?, input)
}

#[tauri::command]
pub async fn conversations_rename(
    state: State<'_, AppState>,
    id: String,
    title: String,
) -> AppResult<Conversation> {
    conversations::rename(&*state.db.conn()?, &id, &title)
}

#[tauri::command]
pub async fn conversations_set_project(
    state: State<'_, AppState>,
    id: String,
    project_id: Option<String>,
) -> AppResult<Conversation> {
    conversations::set_project(&*state.db.conn()?, &id, project_id.as_deref())
}

#[tauri::command]
pub async fn conversations_delete(state: State<'_, AppState>, id: String) -> AppResult<()> {
    conversations::delete(&*state.db.conn()?, &id)
}

#[tauri::command]
pub async fn conversations_delete_all(state: State<'_, AppState>) -> AppResult<usize> {
    conversations::delete_all(&*state.db.conn()?)
}

#[tauri::command]
pub async fn messages_list(
    state: State<'_, AppState>,
    conversation_id: String,
) -> AppResult<Vec<Message>> {
    conversations::list_messages(&*state.db.conn()?, &conversation_id)
}

#[tauri::command]
pub async fn messages_append(
    state: State<'_, AppState>,
    input: NewMessage,
) -> AppResult<Message> {
    conversations::append_message(&mut *state.db.conn()?, input)
}

// MARK: Projects

#[tauri::command]
pub async fn projects_list(state: State<'_, AppState>) -> AppResult<Vec<Project>> {
    projects::list(&*state.db.conn()?)
}

#[tauri::command]
pub async fn projects_create(
    state: State<'_, AppState>,
    input: ProjectInput,
) -> AppResult<Project> {
    projects::create(&*state.db.conn()?, input)
}

#[tauri::command]
pub async fn projects_update(
    state: State<'_, AppState>,
    id: String,
    input: ProjectInput,
) -> AppResult<Project> {
    projects::update(&*state.db.conn()?, &id, input)
}

#[tauri::command]
pub async fn projects_delete(state: State<'_, AppState>, id: String) -> AppResult<()> {
    projects::delete(&*state.db.conn()?, &id)
}

// MARK: Library

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFailure {
    pub name: String,
    pub reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub cancelled: bool,
    pub imported: Vec<Document>,
    pub duplicates: usize,
    pub failed: Vec<ImportFailure>,
}

#[tauri::command]
pub async fn documents_list(state: State<'_, AppState>) -> AppResult<Vec<Document>> {
    documents::list(&*state.db.conn()?)
}

/// Opens the native file picker from Rust. The webview never supplies paths,
/// so it cannot make the app read arbitrary files.
#[tauri::command]
pub async fn documents_import(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<ImportResult> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Import Documents")
            .add_filter("Documents", library::IMPORTABLE_EXTENSIONS)
            .blocking_pick_files()
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    let Some(files) = picked else {
        return Ok(ImportResult {
            cancelled: true,
            imported: vec![],
            duplicates: 0,
            failed: vec![],
        });
    };

    let mut result = ImportResult {
        cancelled: false,
        imported: vec![],
        duplicates: 0,
        failed: vec![],
    };
    for file in files {
        let path: PathBuf = match file.into_path() {
            Ok(p) => p,
            Err(e) => {
                result.failed.push(ImportFailure {
                    name: "Unknown file".into(),
                    reason: e.to_string(),
                });
                continue;
            }
        };
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let outcome = library::probe(&path)
            .and_then(|probed| documents::insert(&*state.db.conn()?, &probed));
        match outcome {
            Ok(Some(doc)) => result.imported.push(doc),
            Ok(None) => result.duplicates += 1,
            Err(e) => result.failed.push(ImportFailure {
                name,
                reason: e.to_string(),
            }),
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn documents_set_project(
    state: State<'_, AppState>,
    id: String,
    project_id: Option<String>,
) -> AppResult<Document> {
    documents::set_project(&*state.db.conn()?, &id, project_id.as_deref())
}

#[tauri::command]
pub async fn documents_remove(state: State<'_, AppState>, id: String) -> AppResult<()> {
    documents::remove(&*state.db.conn()?, &id)
}

/// Reveals a library document in Finder. Only paths already stored in the
/// library can be revealed.
#[tauri::command]
pub async fn documents_reveal(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let doc = documents::get(&*state.db.conn()?, &id)?;
    if !doc.available {
        return Err(AppError::NotFound("file on disk"));
    }
    tauri_plugin_opener::reveal_item_in_dir(&doc.path)
        .map_err(|e| AppError::Internal(e.to_string()))
}

// MARK: Settings & app

#[tauri::command]
pub async fn settings_load(state: State<'_, AppState>) -> AppResult<Option<serde_json::Value>> {
    settings::get(&*state.db.conn()?, SETTINGS_KEY)
}

#[tauri::command]
pub async fn settings_save(
    state: State<'_, AppState>,
    settings: serde_json::Value,
) -> AppResult<()> {
    settings::set(&*state.db.conn()?, SETTINGS_KEY, &settings)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub data_dir: String,
}

#[tauri::command]
pub fn app_info(app: AppHandle, state: State<'_, AppState>) -> AppInfo {
    let pkg = app.package_info();
    AppInfo {
        name: pkg.name.clone(),
        version: pkg.version.to_string(),
        data_dir: state.data_dir.to_string_lossy().into_owned(),
    }
}

#[tauri::command]
pub async fn app_reveal_data_dir(state: State<'_, AppState>) -> AppResult<()> {
    tauri_plugin_opener::reveal_item_in_dir(&state.data_dir)
        .map_err(|e| AppError::Internal(e.to_string()))
}

// MARK: AI

struct ChannelSink(Channel<StreamEvent>);

impl EventSink for ChannelSink {
    fn emit(&self, event: StreamEvent) -> bool {
        self.0.send(event).is_ok()
    }
}

#[tauri::command]
pub fn ai_providers(state: State<'_, AppState>) -> Vec<ProviderInfo> {
    state.ai.providers()
}

#[tauri::command]
pub async fn ai_stream_chat(
    state: State<'_, AppState>,
    request: ChatRequest,
    on_event: Channel<StreamEvent>,
) -> AppResult<()> {
    state.ai.stream(request, &ChannelSink(on_event)).await
}

#[tauri::command]
pub fn ai_cancel(state: State<'_, AppState>, request_id: String) -> AppResult<bool> {
    state.ai.cancel(&request_id)
}

/// Guards the JSON contract with `src/types/domain.ts` and `src/services/ai/types.ts`.
#[cfg(test)]
mod contract_tests {
    use serde_json::json;

    use crate::ai::{ChatRequest, FinishReason, StreamEvent};
    use crate::db::Database;
    use crate::db::conversations::{self, NewConversation, NewMessage};
    use crate::db::projects::ProjectInput;
    use crate::error::AppError;

    #[test]
    fn accepts_frontend_payloads() {
        let msg: NewMessage = serde_json::from_value(json!({
            "conversationId": "c1", "role": "assistant", "content": "hi",
            "status": "cancelled", "model": "mock-1", "error": null
        }))
        .unwrap();
        assert_eq!(msg.conversation_id, "c1");

        let minimal: NewMessage =
            serde_json::from_value(json!({ "conversationId": "c1", "role": "user", "content": "x" }))
                .unwrap();
        assert_eq!(minimal.status, conversations::MessageStatus::Complete);

        let conv: NewConversation = serde_json::from_value(json!({ "projectId": null })).unwrap();
        assert!(conv.project_id.is_none());
        let _: NewConversation = serde_json::from_value(json!({})).unwrap();

        let project: ProjectInput =
            serde_json::from_value(json!({ "name": "P", "color": "teal" })).unwrap();
        assert_eq!(project.description, "");

        let req: ChatRequest = serde_json::from_value(json!({
            "requestId": "r1", "providerId": "mock",
            "messages": [{ "role": "user", "content": "hello" }]
        }))
        .unwrap();
        assert_eq!(req.messages.len(), 1);
    }

    #[test]
    fn emits_camel_case_shapes() {
        let db = Database::open_in_memory().unwrap();
        let conn = db.conn().unwrap();
        let c = conversations::create(&conn, NewConversation::default()).unwrap();
        let value = serde_json::to_value(&c).unwrap();
        for key in ["id", "title", "projectId", "createdAt", "updatedAt", "messageCount", "preview"] {
            assert!(value.get(key).is_some(), "missing {key}");
        }

        assert_eq!(
            serde_json::to_value(StreamEvent::Completed { finish_reason: FinishReason::Cancelled })
                .unwrap(),
            json!({ "type": "completed", "finishReason": "cancelled" })
        );
        assert_eq!(
            serde_json::to_value(StreamEvent::Started { provider_id: "mock".into(), model: "m".into() })
                .unwrap(),
            json!({ "type": "started", "providerId": "mock", "model": "m" })
        );
        assert_eq!(
            serde_json::to_value(AppError::NotFound("conversation")).unwrap(),
            json!({ "kind": "not_found", "message": "conversation not found" })
        );
    }
}
