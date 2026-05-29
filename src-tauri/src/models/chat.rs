use codex_sdk::ThreadItem;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub thread_id: String,
    pub role: String,
    pub content: String,
    pub model: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatThread {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub agent_thread_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub content: String,
    pub thread_id: Option<String>,
    pub model: Option<String>,
    pub working_directory: Option<String>,
    pub sandbox_mode: Option<String>,
    pub network_access_enabled: Option<bool>,
}

#[derive(Serialize)]
#[serde(tag = "type", content = "data")]
#[serde(rename_all = "camelCase")]
pub enum ChatResponse {
    Token { text: String },
    ThreadStarted {
        #[serde(rename = "threadId")]
        thread_id: String,
    },
    Message { role: String, content: String },
    Done {
        #[serde(rename = "totalTokens")]
        total_tokens: u32,
    },
    Error { message: String },
}

impl ChatResponse {
    pub fn to_json(&self) -> serde_json::Value {
        serde_json::to_value(self).unwrap()
    }
}

impl From<ThreadItem> for ChatResponse {
    fn from(item: ThreadItem) -> Self {
        match item {
            ThreadItem::AgentMessage { text, .. } => ChatResponse::Message {
                role: "assistant".into(),
                content: text,
            },

            ThreadItem::Reasoning { text, .. } => ChatResponse::Token { text },

            ThreadItem::CommandExecution {
                command,
                aggregated_output,
                exit_code,
                ..
            } => ChatResponse::Message {
                role: "tool".into(),
                content: format!(
                    "Command: {}\nExit: {:?}\n\n{}",
                    command, exit_code, aggregated_output
                ),
            },

            ThreadItem::FileChange { changes, .. } => {
                let summary = changes
                    .iter()
                    .map(|c| format!("{:?}", c))
                    .collect::<Vec<_>>()
                    .join("\n");

                ChatResponse::Message {
                    role: "tool".into(),
                    content: format!("File changes:\n{}", summary),
                }
            }

            ThreadItem::McpToolCall {
                server,
                tool,
                result,
                error,
                ..
            } => {
                let content = if let Some(r) = result {
                    format!("Tool {}@{} result:\n{:?}", tool, server, r)
                } else if let Some(e) = error {
                    format!("Tool {}@{} error:\n{:?}", tool, server, e)
                } else {
                    format!("Tool {}@{} running...", tool, server)
                };

                ChatResponse::Message {
                    role: "tool".into(),
                    content,
                }
            }

            ThreadItem::WebSearch { query, .. } => ChatResponse::Message {
                role: "tool".into(),
                content: format!("Web search: {}", query),
            },

            ThreadItem::TodoList { items, .. } => {
                let list = items
                    .iter()
                    .map(|i| format!("- {:?}", i))
                    .collect::<Vec<_>>()
                    .join("\n");

                ChatResponse::Message {
                    role: "assistant".into(),
                    content: format!("Todo list:\n{}", list),
                }
            }

            ThreadItem::Error { message, .. } => ChatResponse::Error { message },
        }
    }
}
