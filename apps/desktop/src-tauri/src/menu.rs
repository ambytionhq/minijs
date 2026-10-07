//! The native menu bar. Studio items send their id to the page as a `menu`
//! event; standard items (copy, paste, full screen, quit) are handled by the
//! system. An exported game gets a much smaller menu.

use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Runtime};

/// Every custom item, as (id, label, shortcut).
pub const STUDIO_ITEMS: [(&str, &str, Option<&str>); 9] = [
    ("new-project", "New Project", Some("CmdOrCtrl+N")),
    ("open-folder", "Open Folder…", Some("CmdOrCtrl+O")),
    ("projects", "Show Projects", Some("CmdOrCtrl+Shift+P")),
    ("share", "Share…", Some("CmdOrCtrl+Shift+S")),
    ("export", "Export…", Some("CmdOrCtrl+E")),
    ("tutorial", "Tutorial", None),
    ("reference", "Language Reference", Some("F1")),
    ("website", "minijs Website", None),
    ("check-updates", "Check for Updates…", None),
];

fn item<R: Runtime>(app: &AppHandle<R>, id: &str) -> tauri::Result<MenuItem<R>> {
    let (_, label, accel) = STUDIO_ITEMS
        .iter()
        .find(|(i, _, _)| *i == id)
        .copied()
        .unwrap_or((id, id, None));
    MenuItem::with_id(app, id, label, true, accel)
}

fn about<R: Runtime>(app: &AppHandle<R>, name: &str) -> AboutMetadata<'static> {
    AboutMetadata {
        name: Some(name.to_string()),
        version: Some(app.package_info().version.to_string()),
        copyright: Some("Copyright 2026 Ambytion".into()),
        website: Some("https://minijs.ambytion.net".into()),
        website_label: Some("minijs.ambytion.net".into()),
        ..Default::default()
    }
}

/// The Studio's menu bar.
pub fn studio<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let name = "minijs Studio";
    let sep = || PredefinedMenuItem::separator(app);

    let file = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &item(app, "new-project")?,
            &item(app, "open-folder")?,
            &item(app, "projects")?,
            &sep()?,
            &item(app, "share")?,
            &item(app, "export")?,
            &sep()?,
            &PredefinedMenuItem::close_window(app, None)?,
            #[cfg(not(target_os = "macos"))]
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &sep()?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    let view = Submenu::with_items(app, "View", true, &[&PredefinedMenuItem::fullscreen(app, None)?])?;
    let window = Submenu::with_items(
        app,
        "Window",
        true,
        &[&PredefinedMenuItem::minimize(app, None)?, &PredefinedMenuItem::maximize(app, None)?],
    )?;
    let help = Submenu::with_items(
        app,
        "Help",
        true,
        &[
            &item(app, "reference")?,
            &item(app, "tutorial")?,
            &sep()?,
            &item(app, "website")?,
            #[cfg(not(target_os = "macos"))]
            &item(app, "check-updates")?,
            #[cfg(not(target_os = "macos"))]
            &PredefinedMenuItem::about(app, Some("About minijs Studio"), Some(about(app, name)))?,
        ],
    )?;

    #[cfg(target_os = "macos")]
    {
        let app_menu = Submenu::with_items(
            app,
            name,
            true,
            &[
                &PredefinedMenuItem::about(app, None, Some(about(app, name)))?,
                &item(app, "check-updates")?,
                &sep()?,
                &PredefinedMenuItem::services(app, None)?,
                &sep()?,
                &PredefinedMenuItem::hide(app, None)?,
                &PredefinedMenuItem::hide_others(app, None)?,
                &PredefinedMenuItem::show_all(app, None)?,
                &sep()?,
                &PredefinedMenuItem::quit(app, None)?,
            ],
        )?;
        Menu::with_items(app, &[&app_menu, &file, &edit, &view, &window, &help])
    }
    #[cfg(not(target_os = "macos"))]
    {
        Menu::with_items(app, &[&file, &edit, &view, &window, &help])
    }
}

/// An exported game's menu: just enough to quit, go full screen and copy text.
pub fn player<R: Runtime>(app: &AppHandle<R>, title: &str) -> tauri::Result<Menu<R>> {
    let name = title.to_string();
    let view = Submenu::with_items(app, "View", true, &[&PredefinedMenuItem::fullscreen(app, None)?])?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[&PredefinedMenuItem::copy(app, None)?, &PredefinedMenuItem::paste(app, None)?],
    )?;
    #[cfg(target_os = "macos")]
    {
        let app_menu = Submenu::with_items(
            app,
            &name,
            true,
            &[
                &PredefinedMenuItem::about(app, None, Some(AboutMetadata {
                    name: Some(name.clone()),
                    comments: Some("Made with minijs".into()),
                    website: Some("https://minijs.ambytion.net".into()),
                    website_label: Some("Made with minijs".into()),
                    ..Default::default()
                }))?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::hide(app, None)?,
                &PredefinedMenuItem::quit(app, None)?,
            ],
        )?;
        Menu::with_items(app, &[&app_menu, &edit, &view])
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = name;
        let file = Submenu::with_items(app, "Game", true, &[&PredefinedMenuItem::quit(app, None)?])?;
        Menu::with_items(app, &[&file, &edit, &view])
    }
}
