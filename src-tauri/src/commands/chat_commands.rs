use std::sync::Mutex;

use crate::models::chat::{ChatMessage, ChatRequest, ChatThread};
use crate::models::event_handler::TauriCodexEventHandler;
use crate::services::agent_runtime::AgentRuntime;
use crate::services::data_service::DataService;
use tauri::State;

#[tauri::command]
pub async fn chat(
    payload: ChatRequest,
    app: tauri::AppHandle,
    agent_runtime: State<'_, AgentRuntime>,
) -> Result<(), String> {
    let handler = TauriCodexEventHandler::new(app);
    agent_runtime.invoke_stream(payload, handler).await
}

#[tauri::command]
pub fn save_chat_thread(
    thread: ChatThread,
    data_service: State<'_, Mutex<DataService>>,
) -> Result<(), String> {
    if thread.project_id.trim().is_empty() {
        return Err("failed to save chat thread: projectId is required".to_string());
    }

    let service = data_service
        .lock()
        .map_err(|error| format!("failed to lock data service: {error}"))?;

    let project_exists = service
        .load_project(&thread.project_id)
        .map_err(|error| format!("failed to validate project for chat thread: {error}"))?
        .is_some();

    if !project_exists {
        return Err(format!(
            "failed to save chat thread: project not found: {}",
            thread.project_id
        ));
    }

    service
        .save_chat_thread(&thread)
        .map_err(|error| format!("failed to save chat thread: {error}"))
}

#[tauri::command]
pub fn save_chat_message(
    message: ChatMessage,
    data_service: State<'_, Mutex<DataService>>,
) -> Result<(), String> {
    let service = data_service
        .lock()
        .map_err(|error| format!("failed to lock data service: {error}"))?;

    service
        .save_chat_message(&message)
        .map_err(|error| format!("failed to save chat message: {error}"))
}

#[tauri::command]
pub fn load_chat_threads(
    project_id: String,
    count: usize,
    data_service: State<'_, Mutex<DataService>>,
) -> Result<Vec<ChatThread>, String> {
    let service = data_service
        .lock()
        .map_err(|error| format!("failed to lock data service: {error}"))?;

    service
        .load_chat_threads_by_project(&project_id, count)
        .map_err(|error| format!("failed to load chat threads: {error}"))
}

#[tauri::command]
pub fn load_chat_messages(
    thread_id: String,
    data_service: State<'_, Mutex<DataService>>,
) -> Result<Vec<ChatMessage>, String> {
    let service = data_service
        .lock()
        .map_err(|error| format!("failed to lock data service: {error}"))?;

    service
        .load_chat_messages_by_thread(&thread_id, count)
        .map_err(|error| format!("failed to load chat messages: {error}"))
}
