// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{AppHandle, Emitter, Manager, Window, State};
use tauri_plugin_store::{StoreBuilder, StoreExt};
use std::sync::{Arc, Mutex};
use std::path::PathBuf;

// Overlay window state
struct OverlayState {
    is_visible: bool,
    current_monitor: Option<String>,
}

impl Default for OverlayState {
    fn default() -> Self {
        Self {
            is_visible: false,
            current_monitor: None,
        }
    }
}

type SharedState = Arc<Mutex<OverlayState>>;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// Settings commands
#[tauri::command]
fn save_settings(key: String, value: serde_json::Value) -> Result<(), String> {
    // TODO: Implement actual storage
    println!("Saving setting: {} = {:?}", key, value);
    Ok(())
}

#[tauri::command]
fn load_settings() -> Result<serde_json::Value, String> {
    // TODO: Implement actual storage
    Ok(serde_json::json!({}))
}

// Overlay commands
#[tauri::command]
fn create_overlay_window() -> Result<(), String> {
    // Window is created via tauri.conf.json, this is for runtime setup
    Ok(())
}

/// Show the overlay window
/// This makes the overlay visible and brings it to the foreground
#[tauri::command]
fn show_overlay(app: AppHandle) -> Result<(), String> {
    // Get the overlay window by label
    let overlay_window = app.get_webview_window("overlay")
        .ok_or("Overlay window not found")?;

    // Update state
    if let Some(state) = app.state::<SharedState>().try_get() {
        let mut state_guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;
        state_guard.is_visible = true;
    }

    // Show the window if it's hidden
    overlay_window.show()?;

    // Bring window to foreground and focus it
    overlay_window.set_focus()?;

    // Ensure it stays on top
    overlay_window.set_always_on_top(true)?;

    println!("Overlay window shown and focused");

    Ok(())
}

/// Hide the overlay window
/// This hides the overlay without destroying it
#[tauri::command]
fn hide_overlay(app: AppHandle) -> Result<(), String> {
    // Get the overlay window by label
    let overlay_window = app.get_webview_window("overlay")
        .ok_or("Overlay window not found")?;

    // Update state
    if let Some(state) = app.state::<SharedState>().try_get() {
        let mut state_guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;
        state_guard.is_visible = false;
    }

    // Hide the window
    overlay_window.hide()?;

    println!("Overlay window hidden");

    Ok(())
}

/// Focus the overlay window
/// Brings the overlay to the foreground without changing visibility state
#[tauri::command]
fn focus_overlay(app: AppHandle) -> Result<(), String> {
    // Get the overlay window by label
    let overlay_window = app.get_webview_window("overlay")
        .ok_or("Overlay window not found")?;

    // Check if window is visible first
    if !overlay_window.is_visible()? {
        return Err("Overlay window is not visible".to_string());
    }

    // Bring window to foreground and focus it
    overlay_window.set_focus()?;

    println!("Overlay window focused");

    Ok(())
}

/// Get the current visibility state of the overlay
#[tauri::command]
fn get_overlay_state(app: AppHandle) -> Result<bool, String> {
    if let Some(state) = app.state::<SharedState>().try_get() {
        let state_guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;
        Ok(state_guard.is_visible)
    } else {
        // Fallback: check window directly
        let overlay_window = app.get_webview_window("overlay")
            .ok_or("Overlay window not found")?;
        Ok(overlay_window.is_visible()?)
    }
}

/// Get information about all monitors
#[tauri::command]
fn get_monitor_info() -> Result<Vec<serde_json::Value>, String> {
    // For now, return a placeholder for the primary monitor
    // In a real implementation, this would use platform-specific APIs
    Ok(vec![
        serde_json::json!({
            "id": "default",
            "name": "Primary Monitor",
            "x": 0,
            "y": 0,
            "width": 1920,
            "height": 1080,
            "scale_factor": 1.0
        })
    ])
}

/// Set the overlay window position on a specific monitor
#[tauri::command]
fn set_overlay_position(app: AppHandle, monitor_id: String, x: i32, y: i32) -> Result<(), String> {
    let overlay_window = app.get_webview_window("overlay")
        .ok_or("Overlay window not found")?;

    // Update state with current monitor
    if let Some(state) = app.state::<SharedState>().try_get() {
        let mut state_guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;
        state_guard.current_monitor = Some(monitor_id);
    }

    // Set window position
    overlay_window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }))?;

    println!("Overlay positioned at ({}, {}) on monitor {}", x, y, monitor_id);

    Ok(())
}

/// Enable mouse input capture (drawing mode active)
/// When enabled, the overlay captures mouse events instead of letting them pass through
#[tauri::command]
fn enable_mouse_capture(app: AppHandle) -> Result<(), String> {
    let overlay_window = app.get_webview_window("overlay")
        .ok_or("Overlay window not found")?;

    // Disable ignore_cursor_events to capture mouse input
    overlay_window.set_ignore_cursor_events(false)?;

    println!("Mouse capture enabled - overlay will capture mouse events");

    Ok(())
}

/// Disable mouse input capture (pass-through mode)
/// When disabled, mouse events pass through to underlying applications
#[tauri::command]
fn disable_mouse_capture(app: AppHandle) -> Result<(), String> {
    let overlay_window = app.get_webview_window("overlay")
        .ok_or("Overlay window not found")?;

    // Enable ignore_cursor_events to allow click-through
    overlay_window.set_ignore_cursor_events(true)?;

    println!("Mouse capture disabled - overlay allows pass-through");

    Ok(())
}

// Drawing commands
#[tauri::command]
fn drawing_start(tool: String, x: i32, y: i32) -> Result<(), String> {
    // TODO: Implement drawing start
    Ok(())
}

#[tauri::command]
fn drawing_update(x: i32, y: i32) -> Result<(), String> {
    // TODO: Implement drawing update
    Ok(())
}

#[tauri::command]
fn drawing_end(shape_data: serde_json::Value) -> Result<(), String> {
    // TODO: Implement drawing end
    Ok(())
}

#[tauri::command]
fn create_shape(shape_data: serde_json::Value) -> Result<String, String> {
    // TODO: Implement shape creation
    Ok("shape-id".to_string())
}

#[tauri::command]
fn clear_all_shapes() -> Result<(), String> {
    // TODO: Implement clear shapes
    Ok(())
}

// Hotkey commands
#[tauri::command]
fn register_hotkeys(hotkey_config: serde_json::Value) -> Result<(), String> {
    // TODO: Implement hotkey registration
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize shared state
    let overlay_state = SharedState::default();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(overlay_state)
        .invoke_handler(tauri::generate_handler![
            greet,
            save_settings,
            load_settings,
            create_overlay_window,
            show_overlay,
            hide_overlay,
            focus_overlay,
            get_overlay_state,
            get_monitor_info,
            set_overlay_position,
            enable_mouse_capture,
            disable_mouse_capture,
            drawing_start,
            drawing_update,
            drawing_end,
            create_shape,
            clear_all_shapes,
            register_hotkeys
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
