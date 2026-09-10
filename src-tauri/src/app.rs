use env_logger::Env;
use std::sync::{Mutex, Once};
use tauri::{menu::Menu, Builder, Error, Manager, WindowEvent, Wry};

use crate::services::agent_runtime::AgentRuntime;
use crate::services::app_service::AppService;
use crate::services::command_service::CommandService;
use crate::services::data_service::DataService;

pub struct App;

impl App {
    pub fn new() -> Self {
        Self
    }

    pub fn run(self) -> Result<(), Error> {
        Self::initialize_logging();
        self.build()
            .run(tauri::generate_context!())
            .map_err(Into::into)
    }

    fn build(&self) -> Builder<Wry> {
        let builder = Builder::default()
            .plugin(tauri_plugin_dialog::init())
            .menu(|app| Menu::new(app))
            .invoke_handler(crate::known_commands!())
            .on_window_event(|window, event| {
                if window.label() != "main" {
                    return;
                }

                match event {
                    WindowEvent::Moved(_)
                    | WindowEvent::Resized(_)
                    | WindowEvent::CloseRequested { .. } => {
                        let state = window.app_handle().state::<Mutex<AppService>>();
                        let lock_result = state.lock();
                        if let Ok(mut app_service) = lock_result {
                            app_service.capture_main_window_state(window);
                        }
                    }
                    _ => {}
                }
            });

        builder.setup(|app| {
            let app_service = AppService::load(app.handle());
            log::info!(
                "app data directory: {}",
                app_service.app_data_dir().display()
            );
            let data_service = match DataService::new(app_service.app_data_dir().clone()) {
                Ok(service) => service,
                Err(error) => return Err(error.into()),
            };

            if let Some(main_window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    let _ = main_window.set_title_bar_style(tauri::TitleBarStyle::Overlay);
                }
                #[cfg(not(target_os = "macos"))]
                {
                    let _ = main_window.set_decorations(false);
                }
                app_service.restore_main_window(&main_window);
                let _ = main_window.show();
            }

            app.manage(Mutex::new(app_service));
            app.manage(Mutex::new(data_service));
            app.manage(AgentRuntime::new());
            app.manage(CommandService::new());
            log::info!("backend logging initialized");
            log::info!("app name: {}", app.package_info().name);

            Ok(())
        })
    }

    fn initialize_logging() {
        static LOGGER_INIT: Once = Once::new();

        LOGGER_INIT.call_once(|| {
            env_logger::Builder::from_env(Env::default().default_filter_or("debug")).init();
        });
    }
}
