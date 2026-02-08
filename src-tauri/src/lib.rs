// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod utils;

use tauri::{AppHandle, Emitter, Manager, Window, State};
use tauri_plugin_store::{StoreBuilder, StoreExt};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use std::sync::{Arc, Mutex};
use std::path::PathBuf;

// Overlay window state
struct OverlayState {
    is_visible: bool,
    current_monitor: Option<String>,
    drawing_mode: bool,
}

impl Default for OverlayState {
    fn default() -> Self {
        Self {
            is_visible: false,
            current_monitor: None,
            drawing_mode: false,
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
/// Feature #8: Positions overlay on the monitor where the cursor is currently located
/// Feature #15: Ensures z-index management to stay above other windows
#[tauri::command]
fn show_overlay(app: AppHandle) -> Result<(), String> {
    // Get the overlay window by label
    let overlay_window = app.get_webview_window("overlay")
        .ok_or("Overlay window not found")?;

    // Feature #8: Get cursor position and determine which monitor to use
    let cursor_monitor_info = get_cursor_monitor(app.clone())?;

    if let Some(monitor_id) = cursor_monitor_info["monitor_id"].as_str() {
        if let Some(monitor) = cursor_monitor_info["monitor"].as_object() {
            let x = monitor["x"].as_i64().unwrap_or(0) as i32;
            let y = monitor["y"].as_i64().unwrap_or(0) as i32;
            let width = monitor["width"].as_u64().unwrap_or(1920) as u32;
            let height = monitor["height"].as_u64().unwrap_or(1080) as u32;

            // Update state with current monitor
            if let Some(state) = app.state::<SharedState>().try_get() {
                let mut state_guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;
                state_guard.is_visible = true;
                state_guard.current_monitor = Some(monitor_id.to_string());
            }

            // Feature #9: Emit event when monitor changes - frontend needs this to filter shapes
            app.emit("monitor-changed", monitor_id)
                .map_err(|e| format!("Failed to emit monitor-changed event: {}", e))?;

            // Feature #8: Position overlay on the correct monitor
            overlay_window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }))?;

            // Feature #8: Set overlay size to match monitor size
            overlay_window.set_size(tauri::Size::Physical(tauri::PhysicalSize { width, height }))?;

            println!("Overlay positioned on monitor {} at ({}, {}), size: {}x{}",
                monitor_id, x, y, width, height);
        }
    } else {
        // Fallback: just update visibility state
        if let Some(state) = app.state::<SharedState>().try_get() {
            let mut state_guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;
            state_guard.is_visible = true;
        }
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

/// Get the current monitor ID
/// Feature #9: Returns the monitor where the overlay is currently positioned
#[tauri::command]
fn get_current_monitor(app: AppHandle) -> Result<Option<String>, String> {
    if let Some(state) = app.state::<SharedState>().try_get() {
        let state_guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;
        Ok(state_guard.current_monitor.clone())
    } else {
        Ok(None)
    }
}

/// Get information about all monitors
/// Feature #8: Returns real monitor information using Tauri's monitor API
#[tauri::command]
fn get_monitor_info(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    // Get all available monitors from the primary window
    let primary_window = app.get_webview_window("main")
        .or_else(|| app.get_webview_window("overlay"))
        .ok_or("No window available for monitor detection")?;

    let monitors = primary_window.available_monitors()
        .map_err(|e| format!("Failed to get monitor info: {}", e))?;

    // Convert monitor information to JSON
    let monitor_info: Vec<serde_json::Value> = monitors.iter().enumerate().map(|(i, monitor)| {
        let size = monitor.size();
        let position = monitor.position();
        let scale_factor = monitor.scale_factor();
        let name = monitor.name().unwrap_or(format!("Monitor {}", i + 1));

        serde_json::json!({
            "id": format!("monitor_{}", i),
            "name": name,
            "x": position.x,
            "y": position.y,
            "width": size.width,
            "height": size.height,
            "scale_factor": scale_factor
        })
    }).collect();

    println!("Detected {} monitors: {:?}", monitor_info.len(), monitor_info);

    Ok(monitor_info)
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

/// Feature #8: Get current cursor position and determine which monitor it's on
/// This is used to position the overlay on the correct monitor when drawing mode is activated
#[tauri::command]
fn get_cursor_monitor(app: AppHandle) -> Result<serde_json::Value, String> {
    use tauri::{Manager, PhysicalPosition};

    // Get the primary window to access monitor APIs
    let primary_window = app.get_webview_window("main")
        .or_else(|| app.get_webview_window("overlay"))
        .ok_or("No window available")?;

    // Get cursor position using Tauri's cursor position API
    let cursor_pos = primary_window.cursor_position()
        .map_err(|e| format!("Failed to get cursor position: {}", e))?
        .ok_or("Cursor position not available")?;

    // Get all monitors
    let monitors = primary_window.available_monitors()
        .map_err(|e| format!("Failed to get monitors: {}", e))?;

    // Find which monitor contains the cursor
    let mut current_monitor = None;
    let mut monitor_info = None;

    for (i, monitor) in monitors.iter().enumerate() {
        let size = monitor.size();
        let position = monitor.position();
        let scale_factor = monitor.scale_factor();
        let name = monitor.name().unwrap_or(format!("Monitor {}", i + 1));

        // Check if cursor is within this monitor's bounds
        let is_cursor_in_monitor = cursor_pos.x >= position.x
            && cursor_pos.x < position.x + size.width as i32
            && cursor_pos.y >= position.y
            && cursor_pos.y < position.y + size.height as i32;

        if is_cursor_in_monitor {
            current_monitor = Some(format!("monitor_{}", i));
            monitor_info = Some(serde_json::json!({
                "id": format!("monitor_{}", i),
                "name": name,
                "x": position.x,
                "y": position.y,
                "width": size.width,
                "height": size.height,
                "scale_factor": scale_factor
            }));
            break;
        }
    }

    // If no monitor found (shouldn't happen), use primary monitor
    if current_monitor.is_none() {
        if let Some(primary) = primary_window.primary_monitor()
            .map_err(|e| format!("Failed to get primary monitor: {}", e))? {
            let size = primary.size();
            let position = primary.position();
            let scale_factor = primary.scale_factor();
            let name = primary.name().unwrap_or("Primary Monitor".to_string());

            current_monitor = Some("monitor_0".to_string());
            monitor_info = Some(serde_json::json!({
                "id": "monitor_0",
                "name": name,
                "x": position.x,
                "y": position.y,
                "width": size.width,
                "height": size.height,
                "scale_factor": scale_factor
            }));
        }
    }

    println!("Cursor at ({}, {}) on monitor: {:?}", cursor_pos.x, cursor_pos.y, current_monitor);

    Ok(serde_json::json!({
        "cursor_x": cursor_pos.x,
        "cursor_y": cursor_pos.y,
        "monitor_id": current_monitor,
        "monitor": monitor_info
    }))
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
/// Feature #56, #57, #58, #62: Register global hotkeys for tools and toggle
/// Registers shortcuts like Ctrl+Shift+A for Arrow tool, Ctrl+Shift+D for toggle
#[tauri::command]
fn register_hotkeys(app: AppHandle, hotkey_config: serde_json::Value) -> Result<(), String> {
    // Get the hotkeys object from config
    let hotkeys_obj = hotkey_config["hotkeys"].as_object()
        .ok_or("Invalid hotkeys config: missing 'hotkeys' object")?;

    // Register each hotkey
    for (hotkey_name, hotkey_str) in hotkeys_obj.iter() {
        if let Some(hotkey_value) = hotkey_str.as_str() {
            // Parse the hotkey string (e.g., "Ctrl+Shift+A")
            let shortcut = parse_hotkey_string(hotkey_value)
                .map_err(|e| format!("Failed to parse hotkey '{}': {}", hotkey_value, e))?;

            let app_handle = app.clone();

            // Feature #62: Check if this is the toggle drawing mode hotkey
            if hotkey_name == "toggleDrawingMode" {
                // Register toggle drawing mode hotkey
                app.global_shortcut().register(shortcut, move || {
                    // When toggle hotkey is pressed, call toggle_drawing_mode
                    if let Err(e) = toggle_drawing_mode(app_handle.clone()) {
                        eprintln!("Failed to toggle drawing mode: {}", e);
                    }
                }).map_err(|e| format!("Failed to register toggle hotkey '{}': {}", hotkey_value, e))?;

                println!("Registered toggle hotkey '{}' for drawing mode", hotkey_value);
            } else {
                // Register tool hotkey
                let tool = hotkey_name.clone();
                app.global_shortcut().register(shortcut, move || {
                    // When hotkey is pressed, call activate_tool_hotkey
                    if let Err(e) = activate_tool_hotkey(app_handle.clone(), tool.clone()) {
                        eprintln!("Failed to activate tool '{}': {}", tool, e);
                    }
                }).map_err(|e| format!("Failed to register hotkey '{}' for tool '{}': {}", hotkey_value, hotkey_name, e))?;

                println!("Registered hotkey '{}' for tool '{}'", hotkey_value, hotkey_name);
            }
        }
    }

    Ok(())
}

/// Parse a hotkey string like "Ctrl+Shift+A" into a Shortcut
fn parse_hotkey_string(s: &str) -> Result<Shortcut, String> {
    let mut modifiers = Vec::new();
    let mut key = None;

    for part in s.split('+') {
        let part = part.trim();
        match part.to_uppercase().as_str() {
            "CTRL" | "CONTROL" => modifiers.push(tauri_plugin_global_shortcut::Modifier::Control),
            "SHIFT" => modifiers.push(tauri_plugin_global_shortcut::Modifier::Shift),
            "ALT" => modifiers.push(tauri_plugin_global_shortcut::Modifier::Alt),
            "META" | "CMD" | "SUPER" | "WIN" => modifiers.push(tauri_plugin_global_shortcut::Modifier::Super),
            _ => {
                // This is the key
                if key.is_some() {
                    return Err(format!("Multiple keys found in hotkey: '{}'", s));
                }
                key = Some(parse_key_string(part)?);
            }
        }
    }

    let key = key.ok_or(format!("No key found in hotkey: '{}'", s))?;

    Ok(Shortcut::new(modifiers, key))
}

/// Parse a key string (e.g., "A", "F1", "Space") into a Key
fn parse_key_string(s: &str) -> Result<tauri_plugin_global_shortcut::Key, String> {
    use tauri_plugin_global_shortcut::Key;

    let s_upper = s.to_uppercase();

    // Single character keys
    if s_upper.len() == 1 {
        let c = s_upper.chars().next().unwrap();
        if c.is_alphabetic() || c.is_ascii_digit() {
            return Ok(Key::Character(c.to_string()));
        }
    }

    // Special keys
    match s_upper.as_str() {
        "SPACE" => Ok(Key::Space),
        "ENTER" | "RETURN" => Ok(Key::Enter),
        "TAB" => Ok(Key::Tab),
        "ESCAPE" | "ESC" => Ok(Key::Escape),
        "BACKSPACE" => Ok(Key::Backspace),
        "DELETE" | "DEL" => Ok(Key::Delete),
        "INSERT" => Ok(Key::Insert),
        "HOME" => Ok(Key::Home),
        "END" => Ok(Key::End),
        "PAGEUP" => Ok(Key::PageUp),
        "PAGEDOWN" => Ok(Key::PageDown),
        "LEFT" | "ARROWLEFT" => Ok(Key::ArrowLeft),
        "RIGHT" | "ARROWRIGHT" => Ok(Key::ArrowRight),
        "UP" | "ARROWUP" => Ok(Key::ArrowUp),
        "DOWN" | "ARROWDOWN" => Ok(Key::ArrowDown),
        "F1" => Ok(Key::F1),
        "F2" => Ok(Key::F2),
        "F3" => Ok(Key::F3),
        "F4" => Ok(Key::F4),
        "F5" => Ok(Key::F5),
        "F6" => Ok(Key::F6),
        "F7" => Ok(Key::F7),
        "F8" => Ok(Key::F8),
        "F9" => Ok(Key::F9),
        "F10" => Ok(Key::F10),
        "F11" => Ok(Key::F11),
        "F12" => Ok(Key::F12),
        _ => Err(format!("Unknown key: '{}'", s))
    }
}

/// Convert hotkey config key to ToolType value
/// Example: "freehandTool" -> "freehand", "textTool" -> "text"
fn convert_hotkey_tool_name(hotkey_key: &str) -> String {
    match hotkey_key {
        "arrowTool" => "arrow".to_string(),
        "circleTool" => "circle".to_string(),
        "boxTool" => "box".to_string(),
        "freehandTool" => "freehand".to_string(),
        "highlighterTool" => "highlighter".to_string(),
        "textTool" => "text".to_string(),
        _ => hotkey_key.to_string(), // Return as-is if no match
    }
}

/// Feature #18: Activate overlay and select a tool via hotkey
/// This command is called when a hotkey for a specific tool is pressed
#[tauri::command]
fn activate_tool_hotkey(app: AppHandle, tool: String) -> Result<(), String> {
    // Convert hotkey config key to ToolType value
    // Example: "freehandTool" -> "freehand"
    let tool_type = convert_hotkey_tool_name(&tool);

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
    app.emit("tool-selected", tool_type)
        .map_err(|e| format!("Failed to emit event: {}", e))?;

    // Emit drawing-mode-changed event
    app.emit("drawing-mode-changed", true)
        .map_err(|e| format!("Failed to emit event: {}", e))?;

    println!("Activated tool '{}' via hotkey (from config key '{}'), overlay shown", tool_type, tool);

    Ok(())
}

/// Dismiss the overlay (hide and clean up state)
/// Feature #20: This is called when Escape key is pressed or toggle hotkey is triggered
/// Properly deactivates overlay and cleans up existing shapes
#[tauri::command]
fn dismiss_overlay(app: AppHandle) -> Result<(), String> {
    // Get the overlay window by label
    let overlay_window = app.get_webview_window("overlay")
        .ok_or("Overlay window not found")?;

    // Update state to mark overlay as not visible
    if let Some(state) = app.state::<SharedState>().try_get() {
        let mut state_guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;
        state_guard.is_visible = false;
        // Feature #20: Also disable drawing mode when dismissing
        state_guard.drawing_mode = false;
    }

    // Hide the overlay window
    overlay_window.hide()?;

    // Disable mouse capture (return to pass-through mode)
    overlay_window.set_ignore_cursor_events(true)?;

    // Feature #20: Emit event to clear drawing state and shapes
    app.emit("overlay-dismissed", ())
        .map_err(|e| format!("Failed to emit overlay-dismissed event: {}", e))?;

    // Feature #20: Clear all shapes
    app.emit("clear-all-shapes", ())
        .map_err(|e| format!("Failed to emit clear-all-shapes event: {}", e))?;

    // Feature #20: Emit drawing mode changed event to reset cursor
    app.emit("drawing-mode-changed", false)
        .map_err(|e| format!("Failed to emit drawing-mode-changed event: {}", e))?;

    println!("Overlay dismissed - shapes cleared, drawing state reset");

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

/// Feature #62: Toggle drawing mode on/off
/// Shows overlay and enables drawing mode if disabled, or dismisses overlay if enabled
#[tauri::command]
fn toggle_drawing_mode(app: AppHandle) -> Result<bool, String> {
    let overlay_window = app.get_webview_window("overlay")
        .ok_or("Overlay window not found")?;

    let is_visible = overlay_window.is_visible()?;

    if is_visible {
        // Overlay is visible - dismiss it (turn off drawing mode)
        dismiss_overlay(app)?;
        println!("Drawing mode toggled OFF (overlay dismissed)");
        Ok(false)
    } else {
        // Overlay is hidden - show it and enable drawing mode (turn on drawing mode)
        show_overlay(app)?;

        // Update state to enable drawing mode
        if let Some(state) = app.state::<SharedState>().try_get() {
            let mut state_guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;
            state_guard.is_visible = true;
            state_guard.drawing_mode = true;
        }

        // Emit drawing mode enabled event
        app.emit("drawing-mode-changed", true)
            .map_err(|e| format!("Failed to emit event: {}", e))?;

        println!("Drawing mode toggled ON (overlay shown, drawing mode enabled)");
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
/// Feature #50: Also saves which monitor the panel is on
/// Stores the off-screen position so it persists across app restarts
#[tauri::command]
fn save_mini_panel_position(app: AppHandle, x: i32, y: i32, monitor_id: Option<String>) -> Result<(), String> {
    use tauri_plugin_store::{StoreBuilder, StoreExt};
    use std::path::PathBuf;

    let store_path = PathBuf::from("settings.json");
    let store = StoreBuilder::new(app.clone(), store_path).build();

    // If no monitor_id provided, detect which monitor contains this position
    let monitor_id_final = if let Some(mid) = monitor_id {
        mid
    } else {
        // Auto-detect monitor from position
        let primary_window = app.get_webview_window("main")
            .or_else(|| app.get_webview_window("overlay"))
            .ok_or("No window available for monitor detection")?;

        let monitors = primary_window.available_monitors()
            .map_err(|e| format!("Failed to get monitors: {}", e))?;

        let mut detected_monitor = "monitor_0".to_string();

        for (i, monitor) in monitors.iter().enumerate() {
            let size = monitor.size();
            let position = monitor.position();

            // Check if panel position is within this monitor's bounds
            let is_in_monitor = x >= position.x
                && x < position.x + size.width as i32
                && y >= position.y
                && y < position.y + size.height as i32;

            if is_in_monitor {
                detected_monitor = format!("monitor_{}", i);
                break;
            }
        }

        detected_monitor
    };

    // Save panel position and monitor to storage
    store.set("mini_panel_position", serde_json::json!({
        "x": x,
        "y": y,
        "monitor_id": monitor_id_final
    }));
    store.save().map_err(|e| format!("Failed to save panel position: {}", e))?;

    println!("Mini panel position saved: ({}, {}) on monitor {}", x, y, monitor_id_final);

    Ok(())
}

/// Feature #19: Load and restore mini panel position from storage
/// Feature #50: Also restores the monitor the panel was on
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
        let monitor_id = position["monitor_id"].as_str().unwrap_or("monitor_0");

        // Restore position
        let panel_window = app.get_webview_window("mini-panel")
            .ok_or("Mini panel window not found")?;

        panel_window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }))?;

        println!("Mini panel position restored to: ({}, {}) on monitor {}", x, y, monitor_id);

        Ok(serde_json::json!({
            "x": x,
            "y": y,
            "monitor_id": monitor_id,
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

/// Feature #52: Toggle mini panel visibility (minimize/hide)
/// Shows the panel if hidden, hides if visible
#[tauri::command]
fn toggle_mini_panel(app: AppHandle) -> Result<bool, String> {
    let panel_window = app.get_webview_window("mini-panel")
        .ok_or("Mini panel window not found")?;

    let is_visible = panel_window.is_visible()?;

    if is_visible {
        // Hide the panel
        panel_window.hide()?;
        println!("Mini panel hidden (minimized)");
        Ok(false)
    } else {
        // Show the panel
        panel_window.show()?;
        panel_window.set_focus()?;
        println!("Mini panel shown (restored)");
        Ok(true)
    }
}

/// Feature #52: Hide the mini panel
#[tauri::command]
fn hide_mini_panel(app: AppHandle) -> Result<(), String> {
    let panel_window = app.get_webview_window("mini-panel")
        .ok_or("Mini panel window not found")?;

    panel_window.hide()?;
    println!("Mini panel hidden (minimized)");

    Ok(())
}

/// Feature #52: Show the mini panel
#[tauri::command]
fn show_mini_panel(app: AppHandle) -> Result<(), String> {
    let panel_window = app.get_webview_window("mini-panel")
        .ok_or("Mini panel window not found")?;

    panel_window.show()?;
    panel_window.set_focus()?;
    println!("Mini panel shown (restored)");

    Ok(())
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
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
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
            get_current_monitor,
            get_monitor_info,
            get_cursor_monitor,
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
            toggle_drawing_mode,
            ensure_on_top,
            get_platform_info,
            set_mini_panel_position,
            get_mini_panel_position,
            save_mini_panel_position,
            restore_mini_panel_position,
            toggle_mini_panel,
            hide_mini_panel,
            show_mini_panel
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
