//! "Export as app": turn one game into its own app for players.
//!
//! The running Studio is copied and the game is written beside it as
//! `game.minipack`. When the copy starts, it finds that file and plays the game
//! full window with no editor (see `startup.rs`). Nobody needs a compiler, and
//! the copy is the same signed-or-not build the person already runs.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::startup::GAME_FILE;

/// Messages here are shown to people as they are, so they stay plain.
pub type Result<T> = std::result::Result<T, String>;

/// A file or folder name made from a game title: no characters any system
/// refuses, no leading or trailing dots and spaces, and never empty.
pub fn safe_name(title: &str) -> String {
    let cleaned: String = title
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => ' ',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();
    let collapsed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = collapsed.trim_matches(|c: char| c == '.' || c == ' ');
    let short: String = trimmed.chars().take(60).collect();
    let short = short.trim_end_matches(|c: char| c == '.' || c == ' ').to_string();
    // Names Windows keeps for devices.
    const RESERVED: [&str; 22] = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if short.is_empty() || RESERVED.contains(&short.to_uppercase().as_str()) {
        "minijs game".to_string()
    } else {
        short
    }
}

/// Lowercase letters, digits and dashes, for bundle ids and Linux binaries.
pub fn slug(title: &str) -> String {
    let mut out = String::new();
    for c in title.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    let out = out.trim_end_matches('-').to_string();
    if out.is_empty() {
        "game".to_string()
    } else {
        out
    }
}

/// Escape text for an XML string value.
fn xml_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Replace the `<string>` value that follows `<key>name</key>`, if the key is there.
fn set_plist_string(xml: &str, key: &str, value: &str) -> String {
    let needle = format!("<key>{key}</key>");
    let Some(key_at) = xml.find(&needle) else {
        return xml.to_string();
    };
    let after_key = key_at + needle.len();
    let Some(open_rel) = xml[after_key..].find("<string>") else {
        return xml.to_string();
    };
    let open = after_key + open_rel + "<string>".len();
    let Some(close_rel) = xml[open..].find("</string>") else {
        return xml.to_string();
    };
    format!("{}{}{}", &xml[..open], xml_escape(value), &xml[open + close_rel..])
}

/// Remove `<key>name</key>` and the array that follows it (nested arrays included).
fn remove_plist_array(xml: &str, key: &str) -> String {
    let needle = format!("<key>{key}</key>");
    let Some(start) = xml.find(&needle) else {
        return xml.to_string();
    };
    let mut at = start + needle.len();
    let Some(first) = xml[at..].find("<array>") else {
        return xml.to_string();
    };
    at += first;
    let mut depth = 0usize;
    while at < xml.len() {
        let rest = &xml[at..];
        if rest.starts_with("<array>") {
            depth += 1;
            at += "<array>".len();
        } else if rest.starts_with("</array>") {
            depth -= 1;
            at += "</array>".len();
            if depth == 0 {
                // Also drop the line break and indent before the key.
                let line_start = xml[..start].trim_end_matches([' ', '\t']).len();
                let line_start = if xml[..line_start].ends_with('\n') { line_start - 1 } else { start };
                return format!("{}{}", &xml[..line_start], &xml[at..]);
            }
        } else {
            at += rest.chars().next().map_or(1, char::len_utf8);
        }
    }
    xml.to_string()
}

/// The exported game's Info.plist: its own name and id (so it keeps its own
/// saved data and window size), and no claim on `.mini` files.
pub fn patch_info_plist(xml: &str, title: &str) -> String {
    let id = format!("net.ambytion.minijs.game.{}", slug(title));
    let xml = set_plist_string(xml, "CFBundleName", title);
    let xml = set_plist_string(&xml, "CFBundleDisplayName", title);
    let xml = set_plist_string(&xml, "CFBundleIdentifier", &id);
    remove_plist_array(&xml, "CFBundleDocumentTypes")
}

/// Copy a folder with everything inside, keeping symbolic links and file permissions.
pub fn copy_dir(from: &Path, to: &Path) -> io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        let target = to.join(entry.file_name());
        if kind.is_symlink() {
            let link = fs::read_link(entry.path())?;
            #[cfg(unix)]
            std::os::unix::fs::symlink(&link, &target)?;
            #[cfg(windows)]
            {
                let _ = link;
                fs::copy(entry.path(), &target)?;
            }
        } else if kind.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// The `.app` folder around a macOS executable (`X.app/Contents/MacOS/exe`).
pub fn mac_bundle_of(exe: &Path) -> Option<PathBuf> {
    let bundle = exe.parent()?.parent()?.parent()?;
    let is_app = bundle.extension().is_some_and(|e| e.eq_ignore_ascii_case("app"));
    is_app.then(|| bundle.to_path_buf())
}

/// What gets written where, worked out before touching the disk.
#[derive(Debug, PartialEq, Eq)]
pub struct Layout {
    /// The new app (`.app` on macOS) or folder (Windows, Linux).
    pub root: PathBuf,
    /// Where `game.minipack` goes.
    pub game: PathBuf,
}

/// Plan the export into `parent` for this system.
pub fn layout(parent: &Path, title: &str, os: &str) -> Layout {
    let name = safe_name(title);
    if os == "macos" {
        let root = parent.join(format!("{name}.app"));
        let game = root.join("Contents").join("Resources").join(GAME_FILE);
        Layout { root, game }
    } else {
        let root = parent.join(&name);
        let game = root.join(GAME_FILE);
        Layout { root, game }
    }
}

/// Export the game called `title`, whose share code is `code`, into the folder `parent`.
/// Returns the new app or folder.
pub fn export(exe: &Path, parent: &Path, title: &str, code: &str) -> Result<PathBuf> {
    let os = std::env::consts::OS;
    let plan = layout(parent, title, os);
    if !parent.is_dir() {
        return Err("That folder is gone. Pick another one.".into());
    }
    if plan.root.exists() {
        let shown = plan.root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        return Err(format!(
            "There is already something called \"{shown}\" in that folder. Rename it, or pick another folder."
        ));
    }
    let made = match os {
        "macos" => export_mac(exe, &plan, title),
        "windows" => export_windows(exe, &plan, title),
        _ => export_linux(exe, &plan, title),
    };
    if let Err(message) = made {
        // Leave nothing half-made behind.
        let _ = fs::remove_dir_all(&plan.root);
        return Err(message);
    }
    fs::write(&plan.game, format!("{}\n", code.trim())).map_err(|e| {
        let _ = fs::remove_dir_all(&plan.root);
        format!("I couldn't write the game file: {e}")
    })?;
    if os == "macos" {
        sign_mac(&plan.root);
    }
    Ok(plan.root)
}

fn export_mac(exe: &Path, plan: &Layout, title: &str) -> Result<()> {
    let bundle = mac_bundle_of(exe)
        .ok_or("Export as app works in the installed minijs Studio, not in a development build.")?;
    copy_dir(&bundle, &plan.root).map_err(|e| format!("I couldn't copy the app: {e}"))?;
    let plist = plan.root.join("Contents").join("Info.plist");
    let xml = fs::read_to_string(&plist).map_err(|e| format!("I couldn't read the app details: {e}"))?;
    fs::write(&plist, patch_info_plist(&xml, title)).map_err(|e| format!("I couldn't name the app: {e}"))?;
    // A copied Studio must not carry another game, or the Studio's own update files.
    let _ = fs::remove_file(plan.root.join("Contents").join("Resources").join(GAME_FILE));
    Ok(())
}

/// Changing Info.plist breaks the original signature, and Apple silicon Macs
/// refuse to start apps with no valid signature at all. An ad-hoc signature
/// fixes that. If `codesign` is missing the app still works on Intel Macs.
fn sign_mac(app: &Path) {
    let _ = std::process::Command::new("codesign")
        .args(["--force", "--deep", "--sign", "-"])
        .arg(app)
        .output();
}

fn export_windows(exe: &Path, plan: &Layout, title: &str) -> Result<()> {
    fs::create_dir_all(&plan.root).map_err(|e| format!("I couldn't make the folder: {e}"))?;
    let target = plan.root.join(format!("{}.exe", safe_name(title)));
    fs::copy(exe, &target).map_err(|e| format!("I couldn't copy the app: {e}"))?;
    Ok(())
}

fn export_linux(exe: &Path, plan: &Layout, title: &str) -> Result<()> {
    fs::create_dir_all(&plan.root).map_err(|e| format!("I couldn't make the folder: {e}"))?;
    // Inside an AppImage the running file is in a temporary mount; copy the AppImage itself.
    let (source, target) = match std::env::var_os("APPIMAGE") {
        Some(appimage) => (PathBuf::from(appimage), plan.root.join(format!("{}.AppImage", safe_name(title)))),
        None => (exe.to_path_buf(), plan.root.join(slug(title))),
    };
    fs::copy(&source, &target).map_err(|e| format!("I couldn't copy the app: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&target, fs::Permissions::from_mode(0o755));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_names() {
        assert_eq!(safe_name("Cloud Hopper"), "Cloud Hopper");
        assert_eq!(safe_name("  a/b:c*?  "), "a b c");
        assert_eq!(safe_name("...hidden..."), "hidden");
        assert_eq!(safe_name("con"), "minijs game");
        assert_eq!(safe_name("\u{7}"), "minijs game");
        assert_eq!(safe_name(&"x".repeat(100)).len(), 60);
    }

    #[test]
    fn slugs() {
        assert_eq!(slug("Cloud Hopper!"), "cloud-hopper");
        assert_eq!(slug("  Star  Defender 2 "), "star-defender-2");
        assert_eq!(slug("ゲーム"), "game");
    }

    const PLIST: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>minijs Studio</string>
	<key>CFBundleDocumentTypes</key>
	<array>
		<dict>
			<key>CFBundleTypeExtensions</key>
			<array>
				<string>mini</string>
			</array>
		</dict>
	</array>
	<key>CFBundleIdentifier</key>
	<string>net.ambytion.minijs</string>
	<key>CFBundleName</key>
	<string>minijs Studio</string>
</dict>
</plist>"#;

    #[test]
    fn renames_the_app_and_drops_file_types() {
        let out = patch_info_plist(PLIST, "Cats & Dogs");
        assert!(out.contains("<key>CFBundleName</key>\n\t<string>Cats &amp; Dogs</string>"));
        assert!(out.contains("<key>CFBundleDisplayName</key>\n\t<string>Cats &amp; Dogs</string>"));
        assert!(out.contains("<string>net.ambytion.minijs.game.cats-dogs</string>"));
        assert!(!out.contains("CFBundleDocumentTypes"));
        assert!(!out.contains("<string>mini</string>"));
        assert!(out.contains("<string>Cats &amp; Dogs</string>\n\t<key>CFBundleIdentifier</key>"));
        assert!(out.ends_with("</dict>\n</plist>"));
    }

    #[test]
    fn leaves_plists_without_the_keys_alone() {
        let xml = "<plist><dict></dict></plist>";
        assert_eq!(patch_info_plist(xml, "Game"), xml);
    }

    #[test]
    fn finds_the_mac_bundle() {
        let exe = Path::new("/Applications/minijs Studio.app/Contents/MacOS/minijs-studio");
        assert_eq!(mac_bundle_of(exe), Some(PathBuf::from("/Applications/minijs Studio.app")));
        assert_eq!(mac_bundle_of(Path::new("/repo/target/debug/minijs-studio")), None);
    }

    #[test]
    fn layouts_per_system() {
        let parent = Path::new("/out");
        let mac = layout(parent, "Cloud Hopper", "macos");
        assert_eq!(mac.root, PathBuf::from("/out/Cloud Hopper.app"));
        assert_eq!(mac.game, PathBuf::from("/out/Cloud Hopper.app/Contents/Resources/game.minipack"));
        let win = layout(parent, "Cloud Hopper", "windows");
        assert_eq!(win.root, PathBuf::from("/out/Cloud Hopper"));
        assert_eq!(win.game, PathBuf::from("/out/Cloud Hopper/game.minipack"));
    }

    #[test]
    fn copies_folders_with_links() {
        let dir = tempfile::tempdir().unwrap();
        let from = dir.path().join("a");
        fs::create_dir_all(from.join("inner")).unwrap();
        fs::write(from.join("inner/file.txt"), "hi").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink("inner/file.txt", from.join("link")).unwrap();
        let to = dir.path().join("b");
        copy_dir(&from, &to).unwrap();
        assert_eq!(fs::read_to_string(to.join("inner/file.txt")).unwrap(), "hi");
        #[cfg(unix)]
        assert_eq!(fs::read_link(to.join("link")).unwrap(), PathBuf::from("inner/file.txt"));
    }

    #[test]
    fn refuses_to_overwrite_and_needs_a_real_folder() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("studio");
        fs::write(&exe, "binary").unwrap();
        let missing = dir.path().join("nope");
        assert!(export(&exe, &missing, "Game", "code").unwrap_err().contains("gone"));
        let plan = layout(dir.path(), "Game", std::env::consts::OS);
        fs::create_dir_all(&plan.root).unwrap();
        assert!(export(&exe, dir.path(), "Game", "code").unwrap_err().contains("already something"));
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn exports_a_runnable_folder() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("studio");
        fs::write(&exe, "binary").unwrap();
        let out = dir.path().join("out");
        fs::create_dir_all(&out).unwrap();
        let root = export(&exe, &out, "Cloud Hopper", " code ").unwrap();
        assert_eq!(fs::read_to_string(root.join(GAME_FILE)).unwrap(), "code\n");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn exports_a_mac_app() {
        let dir = tempfile::tempdir().unwrap();
        let app = dir.path().join("minijs Studio.app");
        let macos = app.join("Contents/MacOS");
        fs::create_dir_all(&macos).unwrap();
        fs::create_dir_all(app.join("Contents/Resources")).unwrap();
        fs::write(app.join("Contents/Info.plist"), PLIST).unwrap();
        let exe = macos.join("minijs-studio");
        fs::write(&exe, "binary").unwrap();
        let out = dir.path().join("out");
        fs::create_dir_all(&out).unwrap();
        let root = export(&exe, &out, "Cloud Hopper", "code").unwrap();
        assert_eq!(root, out.join("Cloud Hopper.app"));
        assert_eq!(fs::read_to_string(root.join("Contents/Resources/game.minipack")).unwrap(), "code\n");
        assert_eq!(fs::read_to_string(root.join("Contents/MacOS/minijs-studio")).unwrap(), "binary");
        let plist = fs::read_to_string(root.join("Contents/Info.plist")).unwrap();
        assert!(plist.contains("net.ambytion.minijs.game.cloud-hopper"));
    }
}
