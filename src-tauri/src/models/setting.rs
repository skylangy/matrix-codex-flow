use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SettingValueType {
    String,
    Boolean,
    Number,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SettingValue {
    String(String),
    Boolean(bool),
    Number(f64),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingModel {
    pub id: String,
    pub key: String,
    pub value: SettingValue,
    pub value_type: SettingValueType,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
    pub id: String,
    pub name: String,
    pub agent_type: String, // `type` is reserved in Rust
    pub model: String,
    pub api_key: String,
    pub base_url: String,
    pub enabled: bool,
    pub is_default: bool,
    pub sandbox_mode: Option<String>,
    pub network_access_enabled: Option<bool>,
}
