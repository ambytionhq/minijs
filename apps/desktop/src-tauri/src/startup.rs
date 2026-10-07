//! Finding the game an exported app should play.
//!
//! "Export as app" copies the running Studio and puts the game beside it in a
//! file called `game.minipack` (a minijs share code). When that file is there,
//! the app starts straight into the game with no editor.

use std::path::{Path, PathBuf};

/// The name of the game file inside an exported app.
pub const GAME_FILE: &str = "game.minipack";

/// Where an exported app keeps its game, given the running executable.
///
/// - macOS: `<Game>.app/Contents/Resources/game.minipack`
/// - Windows and Linux: next to the executable
/// - Linux AppImage: next to the `.AppImage` file (the executable itself
///   lives in a read-only mount while it runs)
pub fn candidates(exe: &Path, appimage: Option<&Path>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(dir) = exe.parent() {
        if cfg!(target_os = "macos") {
            if let Some(contents) = dir.parent() {
                out.push(contents.join("Resources").join(GAME_FILE));
            }
        }
        out.push(dir.join(GAME_FILE));
    }
    if let Some(dir) = appimage.and_then(Path::parent) {
        out.push(dir.join(GAME_FILE));
    }
    out
}

/// The share code of the game this app should play, if it is an exported game.
/// `MINIJS_PLAYER_GAME` points at a game file directly, for trying player mode
/// while developing.
pub fn find_game() -> Option<String> {
    if let Some(path) = std::env::var_os("MINIJS_PLAYER_GAME") {
        return read_code(Path::new(&path));
    }
    let exe = std::env::current_exe().ok()?;
    let appimage = std::env::var_os("APPIMAGE").map(PathBuf::from);
    candidates(&exe, appimage.as_deref())
        .iter()
        .find_map(|path| read_code(path))
}

/// The exported game's name, from the app or program the person double-clicked.
pub fn game_title(exe: &Path) -> String {
    let from_bundle = crate::export::mac_bundle_of(exe)
        .and_then(|b| b.file_stem().map(|s| s.to_string_lossy().into_owned()));
    let from_appimage = std::env::var_os("APPIMAGE")
        .and_then(|p| Path::new(&p).file_stem().map(|s| s.to_string_lossy().into_owned()));
    let from_exe = exe.file_stem().map(|s| s.to_string_lossy().into_owned());
    from_bundle
        .or(from_appimage)
        .or(from_exe)
        .unwrap_or_else(|| "minijs game".to_string())
}

fn read_code(path: &Path) -> Option<String> {
    let text = std::fs::read_to_string(path).ok()?;
    let code = text.trim();
    if code.is_empty() {
        None
    } else {
        Some(code.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn looks_beside_the_executable() {
        let exe = Path::new("/games/Cloud Hopper/cloud-hopper");
        let found = candidates(exe, None);
        assert!(found.contains(&PathBuf::from("/games/Cloud Hopper/game.minipack")));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn looks_in_mac_resources_first() {
        let exe = Path::new("/Applications/Cloud Hopper.app/Contents/MacOS/minijs-studio");
        let found = candidates(exe, None);
        assert_eq!(
            found[0],
            PathBuf::from("/Applications/Cloud Hopper.app/Contents/Resources/game.minipack")
        );
    }

    #[test]
    fn looks_beside_the_appimage() {
        let exe = Path::new("/tmp/.mount_abc/usr/bin/minijs-studio");
        let found = candidates(exe, Some(Path::new("/home/sam/Games/Cloud Hopper.AppImage")));
        assert_eq!(found.last().unwrap(), &PathBuf::from("/home/sam/Games/game.minipack"));
    }

    #[test]
    fn reads_trimmed_codes_and_skips_empty_files() {
        let dir = tempfile::tempdir().unwrap();
        let full = dir.path().join("a.minipack");
        std::fs::write(&full, "  abc123\n").unwrap();
        assert_eq!(read_code(&full).as_deref(), Some("abc123"));
        let empty = dir.path().join("b.minipack");
        std::fs::write(&empty, "\n").unwrap();
        assert_eq!(read_code(&empty), None);
        assert_eq!(read_code(&dir.path().join("missing")), None);
    }
}
