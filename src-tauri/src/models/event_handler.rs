use tauri::Emitter;

/// Provider-neutral event sink used by the agent harness runtime.
pub trait AgentEventHandler: Send + Sync {
    fn on_item(&self, item: serde_json::Value);
    fn on_done(&self, usage: serde_json::Value);
    fn on_thread_started(&self, thread_info: serde_json::Value);
}

/// Compatibility marker for code that still refers to Codex-specific handlers.
pub trait CodexEventHandler: AgentEventHandler {}
impl<T: AgentEventHandler> CodexEventHandler for T {}

pub struct TauriCodexEventHandler {
    app: tauri::AppHandle,
}

impl TauriCodexEventHandler {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self { app }
    }
}

impl AgentEventHandler for TauriCodexEventHandler {
    fn on_item(&self, item: serde_json::Value) {
        let _ = self.app.emit("codex:message", item);
    }

    fn on_done(&self, usage: serde_json::Value) {
        let _ = self.app.emit("codex:done", usage);
    }

    fn on_thread_started(&self, thread_info: serde_json::Value) {
        let _ = self.app.emit("codex:thread-started", thread_info);
    }
}
