use crate::models::chat::ChatRequest;
use crate::models::event_handler::AgentEventHandler;
use crate::services::agent_provider::AgentProvider;
use crate::services::codex_provider::CodexProvider;

/// Matrix Flow's execution entrypoint.
///
/// The runtime is intentionally provider-agnostic: callers ask it to execute
/// an agent turn, while vendor-specific behavior stays inside providers.
pub struct AgentRuntime {
    codex: CodexProvider,
}

impl AgentRuntime {
    pub fn new() -> Self {
        Self {
            codex: CodexProvider::new(),
        }
    }

    pub async fn invoke_stream<H: AgentEventHandler>(
        &self,
        payload: ChatRequest,
        handler: H,
    ) -> Result<(), String> {
        let provider = payload
            .agent_provider
            .as_deref()
            .unwrap_or(self.codex.id());

        match provider {
            "codex" | "codex-cli" => self.codex.invoke_stream(payload, handler).await,
            other => Err(format!(
                "unsupported agent provider: {other}. Available providers: codex"
            )),
        }
    }
}
