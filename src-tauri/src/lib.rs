// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod utils;

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
/// Save a setting to persistent storage
/// This uses Tauri's store plugin for cross-platform persistent storage
#[tauri::command]
async fn save_settings(app: AppHandle, key: String, value: serde_json::Value) -> Result<(), String> {
    // Get or create the settings store
    let store_path = PathBuf::from("settings.json");
    let store = StoreBuilder::new(app.clone(), store_path).build();

    // Save the key-value pair
    store.set(key.clone(), value.clone());
    store.save().map_err(|e| format!("Failed to save settings: {}", e))?;

    println!("Setting saved: {} = {:?}", key, value);

    // Emit event that settings were updated
    app.emit("settings_updated", serde_json::json!({
        "key": key,
        "value": value
    }))
    .map_err(|e| format!("Failed to emit event: {}", e))?;

    Ok(())
}

/// Load all settings from persistent storage
/// Returns the complete settings object
#[tauri::command]
async fn load_settings(app: AppHandle) -> Result<serde_json::Value, String> {
    // Get or create the settings store
    let store_path = PathBuf::from("settings.json");
    let store = StoreBuilder::new(app.clone(), store_path).build();

    // Load all settings as a JSON object
    let settings = store
        .as_json()
        .map_err(|e| format!("Failed to load settings: {}", e))?;

    println!("Settings loaded: {:?}", settings);

    Ok(settings)
}

/// Load a specific setting by key
#[tauri::command]
async fn load_setting(app: AppHandle, key: String) -> Result<serde_json::Value, String> {
    // Get or create the settings store
    let store_path = PathBuf::from("settings.json");
    let store = StoreBuilder::new(app.clone(), store_path).build();

    // Get the specific key
    if let Some(value) = store.get(&key) {
        println!("Setting loaded: {} = {:?}", key, value);
        Ok(value.clone())
    } else {
        // Return null if key doesn't exist
        Ok(serde_json::json!(null))
    }
}

/// Reset all settings to default values
#[tauri::command]
async fn reset_settings(app: AppHandle) -> Result<(), String> {
    // Get or create the settings store
    let store_path = PathBuf::from("settings.json");
    let store = StoreBuilder::new(app.clone(), store_path).build();

    // Clear all settings
    store.clear();
    store.save().map_err(|e| format!("Failed to reset settings: {}", e))?;

    // Set default values
    let defaults = get_default_settings();
    for (key, value) in defaults.as_object().unwrap().iter() {
        store.set(key.clone(), value.clone());
    }
    store.save().map_err(|e| format!("Failed to save default settings: {}", e))?;

    println!("Settings reset to defaults");

    // Emit event that settings were reset
    app.emit("settings_updated", defaults)
        .map_err(|e| format!("Failed to emit event: {}", e))?;

    Ok(())
}

/// Get default settings values
fn get_default_settings() -> serde_json::Value {
    serde_json::json!({
        "hotkeys": {
            "toggleDrawingMode": "Ctrl+Shift+D",
            "arrowTool": "Ctrl+Shift+A",
            "circleTool": "Ctrl+Shift+C",
            "boxTool": "Ctrl+Shift+B",
            "freehandTool": "Ctrl+Shift+F",
            "highlighterTool": "Ctrl+Shift+H",
            "textTool": "Ctrl+Shift+T"
        },
        "colors": {
            "arrow": "#FF0000",
            "circle": "#FF0000",
            "box": "#FF0000",
            "freehand": "#FF0000",
            "highlighter": "#FFFF00",
            "text": "#FF0000"
        },
        "lineThickness": 12,
        "fontSize": 14,
        "fadeDuration": 10
    })
}

// Overlay commands
#[tauri::command]
fn create_overlay_window() -> Result<(), String> {
    // Window is created via tauri.conf.json, this is for runtime setup
    Ok(())
}

/// Show the overlay window
/// This makes the overlay visible and brings it to the foreground
/// Feature #15: Ensures z-index management to stay above other windows
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

    // Feature #15: Ensure always-on-top is set BEFORE focusing
    // This ensures the overlay maintains proper z-index
    overlay_window.set_always_on_top(true)?;

    // Bring window to foreground and focus it
    overlay_window.set_focus()?;

    // Feature #15: Set window to topmost again after focus to handle window manager changes
    // This ensures the overlay stays above all other applications even after focus changes
    overlay_window.set_always_on_top(true)?;

    println!("Overlay window shown and focused, z-index set to topmost");

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

/// Set drawing mode and emit event to notify UI components
/// When enabled, activates drawing mode and changes cursor
/// When disabled, deactivates drawing mode and resets cursor
#[tauri::command]
fn set_drawing_mode(app: AppHandle, enabled: bool) -> Result<(), String> {
    // Emit drawing-mode-changed event for UI components to listen to
    app.emit("drawing-mode-changed", enabled)
        .map_err(|e| format!("Failed to emit drawing-mode-changed event: {}", e))?;

    println!("Drawing mode changed to: {}", enabled);

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

/// Feature #20: Clear all shapes from the overlay
/// This is called when dismissing the overlay to ensure clean state
#[tauri::command]
fn clear_all_shapes(app: AppHandle) -> Result<(), String> {
    // Feature #20: Emit event to frontend to clear all shapes
    app.emit("clear-all-shapes", ())
        .map_err(|e| format!("Failed to emit clear-all-shapes event: {}", e))?;

    println!("Clear all shapes event emitted");

    Ok(())
}

// Hotkey commands
#[tauri::command]
fn register_hotkeys(hotkey_config: serde_json::Value) -> Result<(), String> {
    // TODO: Implement hotkey registration
    Ok(())
}

/// Feature #18: Activate overlay and select a tool via hotkey
/// This command is called when a hotkey for a specific tool is pressed
#[tauri::command]
fn activate_tool_hotkey(app: AppHandle, tool: String) -> Result<(), String> {
    // Show the overlay if not already visible
    let overlay_window = app.get_webview_window("overlay")
        .ok_or("Overlay window not found")?;

    if !overlay_window.is_visible()? {
        overlay_window.show()?;
        overlay_window.set_focus()?;
        overlay_window.set_always_on_top(true)?;

        // Update state
        if let Some(state) = app.state::<SharedState>().try_get() {
            let mut state_guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;
            state_guard.is_visible = true;
            state_guard.drawing_mode = true;
        }
    }

    // Emit tool-selected event to notify overlay
    app.emit("tool-selected", tool)
        .map_err(|e| format!("Failed to emit event: {}", e))?;

    // Emit drawing-mode-changed event
    app.emit("drawing-mode-changed", true)
        .map_err(|e| format!("Failed to emit event: {}", e))?;

    println!("Activated tool '{}' via hotkey, overlay shown", tool);

    Ok(())
}

/// Dismiss the overlay (hide and clean up state)
/// This is called when Escape key is pressed or toggle hotkey is triggered
#[tauri::command]
fn dismiss_overlay(app: AppHandle) -> Result<(), String> {
    // Get the overlay window by label
    let overlay_window = app.get_webview_window("overlay")
        .ok_or("Overlay window not found")?;

    // Update state to mark overlay as not visible
    if let Some(state) = app.state::<SharedState>().try_get() {
        let mut state_guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;
        state_guard.is_visible = false;
    }

    // Hide the overlay window
    overlay_window.hide()?;

    // Disable mouse capture (return to pass-through mode)
    overlay_window.set_ignore_cursor_events(true)?;

    // Clear any active drawing state
    // TODO: Emit an event to frontend to clear drawing state

    println!("Overlay dismissed via Escape key or toggle");

    Ok(())
}

/// Toggle overlay visibility
/// Shows overlay if hidden, hides if visible
#[tauri::command]
fn toggle_overlay(app: AppHandle) -> Result<bool, String> {
    let overlay_window = app.get_webview_window("overlay")
        .ok_or("Overlay window not found")?;

    let is_visible = overlay_window.is_visible()?;

    if is_visible {
        // Hide the overlay
        dismiss_overlay(app)?;
        Ok(false)
    } else {
        // Show the overlay
        show_overlay(app)?;
        Ok(true)
    }
}

/// Feature #15: Ensure overlay stays on top after window focus changes
/// This handles cases where other applications might steal focus or z-index
#[tauri::command]
fn ensure_on_top(app: AppHandle) -> Result<(), String> {
    let overlay_window = app.get_webview_window("overlay")
        .ok_or("Overlay window not found")?;

    // Only proceed if overlay is visible
    if !overlay_window.is_visible()? {
        return Ok(());
    }

    // Re-assert always-on-top property to maintain z-index
    overlay_window.set_always_on_top(true)?;

    // Bring to front without stealing focus from other apps unnecessarily
    overlay_window.set_always_on_top(true)?;

    println!("Overlay z-index re-asserted to stay on top");

    Ok(())
}

/// Feature #19: Set mini panel position (supports off-screen positioning)
/// Allows the panel to be positioned off-screen to hide it from recordings
#[tauri::command]
fn set_mini_panel_position(app: AppHandle, x: i32, y: i32) -> Result<(), String> {
    let panel_window = app.get_webview_window("mini-panel")
        .ok_or("Mini panel window not found")?;

    // Feature #19: Allow off-screen positioning by not validating bounds
    // The window can be positioned anywhere, including off-screen
    panel_window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }))?;

    println!("Mini panel positioned at off-screen coordinates ({}, {})", x, y);

    Ok(())
}

/// Feature #19: Get mini panel position
/// Returns the current position of the mini panel
#[tauri::command]
fn get_mini_panel_position(app: AppHandle) -> Result<serde_json::Value, String> {
    let panel_window = app.get_webview_window("mini-panel")
        .ok_or("Mini panel window not found")?;

    let position = panel_window.position()?;

    Ok(serde_json::json!({
        "x": position.x,
        "y": position.y
    }))
}

/// Feature #19: Save mini panel position to persistent storage
/// Stores the off-screen position so it persists across app restarts
#[tauri::command]
fn save_mini_panel_position(app: AppHandle, x: i32, y: i32) -> Result<(), String> {
    use tauri_plugin_store::{StoreBuilder, StoreExt};
    use std::path::PathBuf;

    let store_path = PathBuf::from("settings.json");
    let store = StoreBuilder::new(app.clone(), store_path).build();

    // Save panel position to storage
    store.set("mini_panel_position", serde_json::json!({
        "x": x,
        "y": y
    }));
    store.save().map_err(|e| format!("Failed to save panel position: {}", e))?;

    println!("Mini panel position saved: ({}, {})", x, y);

    Ok(())
}

/// Feature #19: Load and restore mini panel position from storage
/// Restores the panel to its last saved position (including off-screen)
#[tauri::command]
fn restore_mini_panel_position(app: AppHandle) -> Result<serde_json::Value, String> {
    use tauri_plugin_store::{StoreBuilder, StoreExt};
    use std::path::PathBuf;

    let store_path = PathBuf::from("settings.json");
    let store = StoreBuilder::new(app.clone(), store_path).build();

    // Get panel position from storage
    if let Some(position) = store.get("mini_panel_position") {
        let x = position["x"].as_i64().unwrap_or(0) as i32;
        let y = position["y"].as_i64().unwrap_or(0) as i32;

        // Restore position
        let panel_window = app.get_webview_window("mini-panel")
            .ok_or("Mini panel window not found")?;

        panel_window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }))?;

        println!("Mini panel position restored to: ({}, {})", x, y);

        Ok(serde_json::json!({
            "x": x,
            "y": y,
            "restored": true
        }))
    } else {
        // No saved position, return current position
        let panel_window = app.get_webview_window("mini-panel")
            .ok_or("Mini panel window not found")?;

        let position = panel_window.position()?;

        Ok(serde_json::json!({
            "x": position.x,
            "y": position.y,
            "restored": false
        }))
    }
}

/// Feature #11: Get platform information
/// Returns the detected platform and platform-specific window hints
#[tauri::command]
fn get_platform_info() -> Result<serde_json::Value, String> {
    use utils::{get_platform, Platform};

    let platform = match get_platform() {
        Platform::Windows => "windows",
        Platform::Macos => "macos",
        Platform::Linux => "linux",
        Platform::Unknown => "unknown",
    };

    let hints = get_platform_window_hints();

    println!("Platform detected: {} - {}", platform, hints);

    Ok(serde_json::json!({
        "platform": platform,
        "hints": hints,
        "overlay_implementation": "Tauri cross-platform window API with platform-specific optimizations"
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize shared state
    let overlay_state = SharedState::default();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(overlay_state)
        .invoke_handler(tauri::generate_handler![
            greet,
            save_settings,
            load_settings,
            load_setting,
            reset_settings,
            create_overlay_window,
            show_overlay,
            hide_overlay,
            focus_overlay,
            get_overlay_state,
            get_monitor_info,
            set_overlay_position,
            enable_mouse_capture,
            disable_mouse_capture,
            set_drawing_mode,
            drawing_start,
            drawing_update,
            drawing_end,
            create_shape,
            clear_all_shapes,
            register_hotkeys,
            activate_tool_hotkey,
            dismiss_overlay,
            toggle_overlay,
            ensure_on_top,
            get_platform_info,
            set_mini_panel_position,
            get_mini_panel_position,
            save_mini_panel_position,
            restore_mini_panel_position
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
