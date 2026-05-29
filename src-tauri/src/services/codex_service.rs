use crate::models::chat::{ChatRequest, ChatResponse};
use crate::models::event_handler::CodexEventHandler;
use codex_sdk::{
    ApprovalMode, Codex, CodexOptions, SandboxMode, ThreadEvent, ThreadOptions, TurnOptions,
    WebSearchMode,
};
use futures::StreamExt;

pub struct CodexService {
    codex: Codex,
}

impl CodexService {
    pub fn new() -> Self {
        let options = CodexOptions::default();
        Self {
            codex: Codex::new(options)
                .expect("failed to initialize codex-sdk in CodexService::new"),
        }
    }

    pub async fn invoke_stream<H: CodexEventHandler>(
        &self,
        payload: ChatRequest,
        handler: H,
    ) -> Result<(), String> {
        let trimmed_prompt = payload.content.trim();

        if trimmed_prompt.is_empty() {
            return Err("prompt cannot be empty".to_string());
        }

        let sandbox_mode_name = payload.sandbox_mode.as_deref().unwrap_or("workspace-write");
        let sandbox_mode = Self::parse_sandbox_mode(Some(sandbox_mode_name))?;
        let network_access_enabled = if sandbox_mode_name == "danger-full-access" {
            true
        } else {
            payload.network_access_enabled.unwrap_or(false)
        };
        let thread_options = ThreadOptions {
            model: payload.model.clone(),
            working_directory: payload.working_directory.clone(),
            network_access_enabled: Some(network_access_enabled),
            approval_policy: Some(ApprovalMode::Never),
            sandbox_mode: Some(sandbox_mode),
            web_search_mode: Some(WebSearchMode::Cached),
            ..ThreadOptions::default()
        };

        log::info!(
            "Starting thread with prompt: '{}' and working directory: '{}'",
            trimmed_prompt,
            thread_options.working_directory.as_deref().unwrap_or(".")
        );
        log::info!("Thread options: {}", thread_options);

        let thread = if let Some(id) = payload.thread_id {
            self.codex.resume_thread(id, thread_options)
        } else {
            self.codex.start_thread(thread_options)
        };

        let streamed = thread
            .run_streamed(trimmed_prompt.into(), TurnOptions::default())
            .map_err(|e| e.to_string())?;
        let mut events = streamed.events;

        while let Some(event) = events.next().await {
            match event.map_err(|e| e.to_string())? {
                ThreadEvent::ThreadStarted { thread_id } => {
                    log::info!(" Turn started with thread ID: {}", thread_id);
                    let response = ChatResponse::ThreadStarted { thread_id };
                    handler.on_thread_started(response.to_json());
                }
                ThreadEvent::ItemUpdated { item } => {
                    log::debug!("Received in-progress item update: {:?}", item);
                }
                ThreadEvent::ItemCompleted { item } => {
                    log::info!("Received item: {:?}", item);
                    let response = ChatResponse::from(item);
                    handler.on_item(response.to_json());
                }
                ThreadEvent::TurnCompleted { usage } => {
                    log::info!("Turn completed with usage: {:?}", usage);
                    let response = ChatResponse::Done {
                        total_tokens: usage.output_tokens as u32,
                    };
                    handler.on_done(response.to_json());
                }
                ThreadEvent::TurnFailed { error } => {
                    log::error!("Turn failed: {:?}", error);
                    let response = ChatResponse::Error {
                        message: error.message.clone(),
                    };
                    handler.on_done(response.to_json());
                    return Err(error.message);
                }
                ThreadEvent::ThreadErrorEvent { message } => {
                    log::error!("Thread error: {}", message);
                    let response = ChatResponse::Error {
                        message: message.clone(),
                    };
                    handler.on_done(response.to_json());
                    return Err(message);
                }
                _ => {}
            }
        }

        Ok(())
    }

    fn parse_sandbox_mode(mode: Option<&str>) -> Result<SandboxMode, String> {
        match mode.unwrap_or("workspace-write") {
            "read-only" => Ok(SandboxMode::ReadOnly),
            "workspace-write" => Ok(SandboxMode::WorkspaceWrite),
            "danger-full-access" => Ok(SandboxMode::DangerFullAccess),
            other => Err(format!("unsupported sandbox mode: {other}")),
        }
    }
}
