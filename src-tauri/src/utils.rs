/// Utility functions for the Annotatr application

/// Platform detection for Feature #11: Platform-appropriate overlay implementation
pub enum Platform {
    Windows,
    Macos,
    Linux,
    Unknown,
}

/// Detect the current platform at compile time
pub fn get_platform() -> Platform {
    #[cfg(target_os = "windows")]
    {
        return Platform::Windows;
    }

    #[cfg(target_os = "macos")]
    {
        return Platform::Macos;
    }

    #[cfg(target_os = "linux")]
    {
        return Platform::Linux;
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        return Platform::Unknown;
    }
}

/// Get platform-specific window configuration hints for Feature #11
/// This returns information about how overlays are implemented on each platform
pub fn get_platform_window_hints() -> &'static str {
    match get_platform() {
        Platform::Windows => {
            "Windows: Using DWM (Desktop Window Manager) composition with transparent layered windows"
        }
        Platform::Macos => {
            "macOS: Using NSWindow with canBecomeKeyWindow=false and level set to floating"
        }
        Platform::Linux => {
            "Linux: Using X11/Wayland compositing with _NET_WM_WINDOW_TYPE_TOOLBAR"
        }
        Platform::Unknown => {
            "Generic: Using standard Tauri window APIs (may have limited functionality)"
        }
    }
}

pub fn generate_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    format!("shape_{}", timestamp)
}
