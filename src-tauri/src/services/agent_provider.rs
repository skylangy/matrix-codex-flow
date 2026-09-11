use crate::models::chat::ChatRequest;
use crate::models::event_handler::AgentEventHandler;

/// Common execution contract for AI coding agents managed by Matrix Flow.
///
/// Providers own vendor-specific session/thread details while the harness owns
/// routing, policy, orchestration, and lifecycle decisions.
pub trait AgentProvider: Send + Sync {
    fn id(&self) -> &'static str;

    fn display_name(&self) -> &'static str;

    async fn invoke_stream<H: AgentEventHandler>(
        &self,
        payload: ChatRequest,
        handler: H,
    ) -> Result<(), String>;
}
