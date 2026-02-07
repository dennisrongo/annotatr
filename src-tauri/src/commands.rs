use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Window};

#[derive(Debug, Serialize, Deserialize)]
pub struct MonitorInfo {
    pub id: String,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

/// Get information about all monitors
#[tauri::command]
pub fn get_monitor_info() -> Result<Vec<MonitorInfo>, String> {
    // For now, return a placeholder
    // In a real implementation, this would use platform-specific APIs
    // to query monitor information
    Ok(vec![MonitorInfo {
        id: "default".to_string(),
        name: "Primary Monitor".to_string(),
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        scale_factor: 1.0,
    }])
}

/// Create or show the overlay window
#[tauri::command]
pub fn create_overlay_window(app: AppHandle) -> Result<(), String> {
    if let Some(overlay) = app.get_webview_window("overlay") {
        overlay.show()?;
        overlay.set_ignore_cursor_events(false)?;
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}

/// Show the overlay window and enable mouse input capture
#[tauri::command]
pub fn show_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(overlay) = app.get_webview_window("overlay") {
        overlay.show()?;
        overlay.set_focus()?;
        // Enable mouse input capture when drawing mode is active
        overlay.set_ignore_cursor_events(false)?;
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}

/// Hide the overlay window
#[tauri::command]
pub fn hide_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(overlay) = app.get_webview_window("overlay") {
        overlay.hide()?;
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}

/// Set the overlay window position on a specific monitor
#[tauri::command]
pub fn set_overlay_position(
    app: AppHandle,
    monitor_id: String,
    x: i32,
    y: i32,
) -> Result<(), String> {
    if let Some(overlay) = app.get_webview_window("overlay") {
        overlay.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }))?;
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}

/// Enable mouse input capture (drawing mode active)
#[tauri::command]
pub fn enable_mouse_capture(app: AppHandle) -> Result<(), String> {
    if let Some(overlay) = app.get_webview_window("overlay") {
        overlay.set_ignore_cursor_events(false)?;
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}

/// Disable mouse input capture (pass-through mode)
#[tauri::command]
pub fn disable_mouse_capture(app: AppHandle) -> Result<(), String> {
    if let Some(overlay) = app.get_webview_window("overlay") {
        overlay.set_ignore_cursor_events(true)?;
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}
