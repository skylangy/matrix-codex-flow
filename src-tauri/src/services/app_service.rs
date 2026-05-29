use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Runtime, Size, WebviewWindow,
    Window,
};

use crate::models::app_config::{AppConfig, MainWindowConfig};
use crate::models::setting::{AgentConfig, SettingModel, SettingValue, SettingValueType};

const APP_FOLDER_NAME: &str = "vibeflow";
const APP_CONFIG_FILE_NAME: &str = "app.config.json";
const SETTINGS_FILE_NAME: &str = "settings.json";
const DEFAULT_WINDOW_WIDTH: u32 = 400;
const DEFAULT_WINDOW_HEIGHT: u32 = 1000;

pub struct AppService {
    app_data_dir: PathBuf,
    app_config_path: PathBuf,
    settings_path: PathBuf,
    app_config: AppConfig,
    settings: Vec<SettingModel>,
}

impl AppService {
    pub fn load<R: Runtime>(app_handle: &AppHandle<R>) -> Self {
        let app_data_dir = Self::resolve_app_data_dir(app_handle);
        if let Err(error) = fs::create_dir_all(&app_data_dir) {
            log::error!(
                "failed to create app data dir {:?}: {}",
                app_data_dir,
                error
            );
        }

        let app_config_path = app_data_dir.join(APP_CONFIG_FILE_NAME);
        let settings_path = app_data_dir.join(SETTINGS_FILE_NAME);
        let app_config = Self::load_app_config(&app_config_path);
        let settings = Self::load_settings(&settings_path);

        let service = Self {
            app_data_dir,
            app_config_path,
            settings_path,
            app_config,
            settings,
        };

        if let Err(error) = service.save_app_config() {
            log::error!("failed to save app config: {}", error);
        }

        if let Err(error) = service.save_settings() {
            log::error!("failed to save settings: {}", error);
        }

        service
    }

    pub fn app_data_dir(&self) -> &PathBuf {
        &self.app_data_dir
    }

    pub fn get_settings(&self) -> Vec<SettingModel> {
        self.settings.clone()
    }

    pub fn set_settings(&mut self, settings: Vec<SettingModel>) -> Result<(), std::io::Error> {
        self.settings = settings;
        self.save_settings()
    }

    pub fn restore_main_window<R: Runtime>(&self, window: &WebviewWindow<R>) {
        let Some(main_window) = &self.app_config.main_window else {
            return;
        };

        let width = if main_window.width == 0 {
            DEFAULT_WINDOW_WIDTH
        } else {
            main_window.width
        };
        let height = if main_window.height == 0 {
            DEFAULT_WINDOW_HEIGHT
        } else {
            main_window.height
        };

        let _ = window.set_size(Size::Physical(PhysicalSize::new(width, height)));

        let saved_location_is_visible = match window.available_monitors() {
            Ok(monitors) => monitors.iter().any(|monitor| {
                Self::is_point_inside_monitor(
                    main_window.x,
                    main_window.y,
                    *monitor.position(),
                    *monitor.size(),
                )
            }),
            Err(error) => {
                log::error!("failed reading available monitors: {}", error);
                true
            }
        };

        let (x, y) = if saved_location_is_visible {
            (main_window.x, main_window.y)
        } else {
            match window.primary_monitor() {
                Ok(Some(monitor)) => Self::clamp_position_to_primary_monitor(
                    main_window.x,
                    main_window.y,
                    width,
                    height,
                    *monitor.position(),
                    *monitor.size(),
                ),
                Ok(None) => (main_window.x, main_window.y),
                Err(error) => {
                    log::error!("failed reading primary monitor: {}", error);
                    (main_window.x, main_window.y)
                }
            }
        };

        let _ = window.set_position(Position::Physical(PhysicalPosition::new(x, y)));

        if main_window.maximized {
            let _ = window.maximize();
        }
    }

    pub fn capture_main_window_state<R: Runtime>(&mut self, window: &Window<R>) {
        let maximized = window.is_maximized().unwrap_or(false);

        if maximized {
            if let Some(main_window) = &mut self.app_config.main_window {
                main_window.maximized = true;
            }

            if let Err(error) = self.save_app_config() {
                log::error!("failed saving app config: {}", error);
            }
            return;
        }

        let position = match window.outer_position() {
            Ok(value) => value,
            Err(error) => {
                log::error!("failed reading window position: {}", error);
                return;
            }
        };

        let size = match window.inner_size() {
            Ok(value) => value,
            Err(error) => {
                log::error!("failed reading window size: {}", error);
                return;
            }
        };

        self.app_config.main_window = Some(MainWindowConfig {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
            maximized: false,
        });

        if let Err(error) = self.save_app_config() {
            log::error!("failed saving app config: {}", error);
        }
    }

    fn load_app_config(path: &PathBuf) -> AppConfig {
        if !path.exists() {
            return AppConfig::default();
        }

        match fs::read_to_string(path) {
            Ok(content) => serde_json::from_str::<AppConfig>(&content).unwrap_or_default(),
            Err(_) => AppConfig::default(),
        }
    }

    fn load_settings(path: &PathBuf) -> Vec<SettingModel> {
        if !path.exists() {
            return Self::default_settings();
        }

        match fs::read_to_string(path) {
            Ok(content) => serde_json::from_str::<Vec<SettingModel>>(&content)
                .unwrap_or_else(|_| Self::default_settings()),
            Err(_) => Self::default_settings(),
        }
    }

    fn save_app_config(&self) -> Result<(), std::io::Error> {
        let content =
            serde_json::to_string_pretty(&self.app_config).unwrap_or_else(|_| "{}".to_string());
        fs::write(&self.app_config_path, content)
    }

    fn save_settings(&self) -> Result<(), std::io::Error> {
        let content =
            serde_json::to_string_pretty(&self.settings).unwrap_or_else(|_| "[]".to_string());
        fs::write(&self.settings_path, content)
    }

    fn default_settings() -> Vec<SettingModel> {
        vec![
            SettingModel {
                id: "setting-configured-agents".to_string(),
                key: "configured.agents".to_string(),
                value: SettingValue::String(Self::default_agents()),
                value_type: SettingValueType::String,
            },
            SettingModel {
                id: "setting-default-prompt-template".to_string(),
                key: "prompt.template".to_string(),
                value: SettingValue::String(
                    "You are Codex working inside VibeFlow.\nFollow project context and rules, keep outputs concise, and produce actionable steps."
                        .to_string(),
                ),
                value_type: SettingValueType::String,
            },
            SettingModel {
                id: "setting-generate-folder".to_string(),
                key: "project.generateVibeflowFolder".to_string(),
                value: SettingValue::Boolean(true),
                value_type: SettingValueType::Boolean,
            },
        ]
    }

    fn default_agents() -> String {
        let agents = vec![AgentConfig {
            id: Uuid::new_v4().to_string(),
            name: "Codex CLI Agent".to_string(),
            agent_type: "codex-cli".to_string(),
            model: "gpt-5-codex".to_string(),
            api_key: "".to_string(),
            base_url: "".to_string(),
            enabled: true,
            is_default: true,
            sandbox_mode: Some("workspace-write".to_string()),
            network_access_enabled: Some(false),
        }];

        serde_json::to_string(&agents).expect("Failed to serialize agent configs")
    }

    fn clamp_position_to_primary_monitor(
        saved_x: i32,
        saved_y: i32,
        width: u32,
        height: u32,
        monitor_position: PhysicalPosition<i32>,
        monitor_size: PhysicalSize<u32>,
    ) -> (i32, i32) {
        let min_x = monitor_position.x as i64;
        let min_y = monitor_position.y as i64;

        let mut max_x = min_x + monitor_size.width as i64 - width as i64;
        let mut max_y = min_y + monitor_size.height as i64 - height as i64;

        if max_x < min_x {
            max_x = min_x;
        }
        if max_y < min_y {
            max_y = min_y;
        }

        let clamped_x = (saved_x as i64).clamp(min_x, max_x) as i32;
        let clamped_y = (saved_y as i64).clamp(min_y, max_y) as i32;

        (clamped_x, clamped_y)
    }

    fn is_point_inside_monitor(
        x: i32,
        y: i32,
        monitor_position: PhysicalPosition<i32>,
        monitor_size: PhysicalSize<u32>,
    ) -> bool {
        let min_x = monitor_position.x as i64;
        let min_y = monitor_position.y as i64;
        let max_x = min_x + monitor_size.width as i64;
        let max_y = min_y + monitor_size.height as i64;

        let point_x = x as i64;
        let point_y = y as i64;

        point_x >= min_x && point_x < max_x && point_y >= min_y && point_y < max_y
    }

    fn resolve_app_data_dir<R: Runtime>(app_handle: &AppHandle<R>) -> PathBuf {
        #[cfg(target_os = "windows")]
        {
            use std::env;
            if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
                return PathBuf::from(local_app_data).join(APP_FOLDER_NAME);
            }
        }

        app_handle
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(APP_FOLDER_NAME)
    }
}
