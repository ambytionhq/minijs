// True inside the minijs Studio desktop app (Tauri), false on the web.
export const IS_DESKTOP = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
