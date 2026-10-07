//! minijs Studio for macOS, Windows and Linux.
//!
//! The window shows the same Studio as the web, built from `playground/`.
//! This side adds what a browser can't: real folders with no permission
//! prompts, native save windows, `.mini` files opened from the file manager,
//! self-updates, and "Export as app".

mod export;
mod menu;
mod startup;

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_fs::FsExt;

/// What the page needs to know when it starts.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Startup {
    /// Share code of the game an exported app plays; `None` for the Studio.
    game: Option<String>,
    /// Title of that game (from the app's own name).
    title: Option<String>,
    /// The system: "macos", "windows" or "linux".
    os: &'static str,
}

/// `.mini` files the system asked us to open that the page hasn't taken yet.
#[derive(Default)]
struct Opened(Mutex<Vec<String>>);

#[tauri::command]
fn startup(state: State<'_, Startup>) -> Startup {
    state.inner().clone()
}

#[tauri::command]
fn take_opened_files(opened: State<'_, Opened>) -> Vec<String> {
    std::mem::take(&mut *opened.0.lock().unwrap())
}

/// Copy this app with the game beside it. Runs off the main thread: copying an
/// app takes a moment.
#[tauri::command]
async fn export_app(parent: String, title: String, code: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let exe = std::env::current_exe().map_err(|e| format!("I couldn't find this app on disk: {e}"))?;
        export::export(&exe, Path::new(&parent), &title, &code).map(|p| p.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Let the page read and write the folder around an opened `.mini` file, the
/// same as a folder picked in the Open window.
fn allow_and_queue(app: &AppHandle, paths: Vec<PathBuf>) {
    let mut fresh = Vec::new();
    for path in paths {
        let is_mini = path.extension().is_some_and(|e| e.eq_ignore_ascii_case("mini"));
        if !is_mini || !path.is_file() {
            continue;
        }
        if let Some(dir) = path.parent() {
            let _ = app.fs_scope().allow_directory(dir, true);
        }
        fresh.push(path.to_string_lossy().into_owned());
    }
    if fresh.is_empty() {
        return;
    }
    if let Some(opened) = app.try_state::<Opened>() {
        opened.0.lock().unwrap().extend(fresh);
    }
    // The page takes them on start; if it is already running, nudge it.
    let _ = app.emit("open-files", ());
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn run() {
    let game = startup::find_game();
    let exe = std::env::current_exe().unwrap_or_default();
    let title = game.as_ref().map(|_| startup::game_title(&exe));
    let is_player = game.is_some();
    let info = Startup { game, title: title.clone(), os: std::env::consts::OS };

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_window_state::Builder::default().build());
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    let app = builder
        .manage(info)
        .manage(Opened::default())
        .invoke_handler(tauri::generate_handler![startup, take_opened_files, export_app])
        .menu(move |app| match &title {
            Some(t) => menu::player(app, t),
            None => menu::studio(app),
        })
        .on_menu_event(|app, event| {
            let _ = app.emit("menu", event.id().0.as_str());
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            // Windows and Linux pass opened files as arguments.
            if !is_player {
                let args: Vec<PathBuf> = std::env::args_os().skip(1).map(PathBuf::from).collect();
                allow_and_queue(&handle, args);
            }
            if let Some(window) = app.get_webview_window("main") {
                if let Some(t) = app.state::<Startup>().title.clone() {
                    let _ = window.set_title(&t);
                }
                // The page shows the window once it has drawn, so there is no
                // white flash. If the page fails to start, show it anyway.
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(4));
                    let _ = window.show();
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("minijs Studio could not start");

    app.run(|handle, event| {
        // macOS passes opened files as an event, also while already running.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = &event {
            let paths = urls.iter().filter_map(|u| u.to_file_path().ok()).collect();
            allow_and_queue(handle, paths);
        }
        let _ = (handle, event);
    });
}
