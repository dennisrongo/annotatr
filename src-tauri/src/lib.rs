// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_store::StoreBuilder;
use tauri_plugin_global_shortcut::{Modifiers, Code, ShortcutState};
use std::collections::{HashMap, HashSet};
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

// Feature #65: Track registered hotkeys for deregistration
struct HotkeyRegistry {
    registered_hotkeys: Vec<String>,
}

impl Default for HotkeyRegistry {
    fn default() -> Self {
        Self {
            registered_hotkeys: Vec::new(),
        }
    }
}

type SharedHotkeyRegistry = Arc<Mutex<HotkeyRegistry>>;

/// Action triggered by a global hotkey press
#[derive(Clone)]
enum HotkeyAction {
    /// Settings key "toggleDrawingMode": toggle the toolbar/session on or off
    ToggleToolbar,
    /// Activate a drawing tool ("arrow", "line", "circle", "box", "diamond", "freehand", "highlighter", "text")
    Tool(String),
}

/// Dispatch table for global hotkeys, keyed by Shortcut::id().
/// The plugin handler looks up the pressed shortcut here; `held` suppresses
/// OS key-repeat (a second Pressed before Released is ignored).
#[derive(Default)]
struct HotkeyDispatch {
    actions: HashMap<u32, HotkeyAction>,
    held: HashSet<u32>,
}

type SharedHotkeyDispatch = Arc<Mutex<HotkeyDispatch>>;

// Settings commands
/// Save a setting to persistent storage
/// This uses Tauri's store plugin for cross-platform persistent storage
#[tauri::command]
async fn save_settings(app: AppHandle, key: String, value: serde_json::Value) -> Result<(), String> {
    // Get or create the settings store
    let store_path = PathBuf::from("settings.json");
    let store = StoreBuilder::new(&app, store_path).build()
        .map_err(|e| format!("Failed to create store: {}", e))?;

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
    let store = StoreBuilder::new(&app, store_path).build()
        .map_err(|e| format!("Failed to create store: {}", e))?;

    // Load all settings as a JSON object - get all keys and build JSON object
    let mut settings = serde_json::Map::new();
    for key in store.keys().into_iter() {
        if let Some(value) = store.get(&key) {
            settings.insert(key, value.clone());
        }
    }

    println!("Settings loaded: {:?}", settings);

    Ok(serde_json::Value::Object(settings))
}

/// Load a specific setting by key
#[tauri::command]
async fn load_setting(app: AppHandle, key: String) -> Result<serde_json::Value, String> {
    // Get or create the settings store
    let store_path = PathBuf::from("settings.json");
    let store = StoreBuilder::new(&app, store_path).build()
        .map_err(|e| format!("Failed to create store: {}", e))?;

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
    let store = StoreBuilder::new(&app, store_path).build()
        .map_err(|e| format!("Failed to create store: {}", e))?;

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
            "lineTool": "Ctrl+Shift+L",
            "circleTool": "Ctrl+Shift+C",
            "boxTool": "Ctrl+Shift+B",
            "diamondTool": "Ctrl+Shift+G",
            "freehandTool": "Ctrl+Shift+F",
            "highlighterTool": "Ctrl+Shift+H",
            "textTool": "Ctrl+Shift+T"
        },
        "colors": {
            "arrow": "#FF0000",
            "line": "#FF0000",
            "circle": "#FF0000",
            "box": "#FF0000",
            "diamond": "#FF0000",
            "freehand": "#FF0000",
            "highlighter": "#FFFF00",
            "text": "#FF0000"
        },
        "lineThickness": {
            "arrow": 12,
            "line": 12,
            "circle": 12,
            "box": 12,
            "diamond": 12,
            "freehand": 12,
            "highlighter": 12,
            "text": 12
        },
        "fontSize": 14,
        "fadeDuration": 10,
        "panelTransparency": 0.95,
        "panelCollapsed": false,
        "arrowHeadStyle": "filled"
    })
}

// Overlay commands

/// All per-monitor overlay windows, labelled "overlay_0", "overlay_1", ...
/// One transparent overlay covers each monitor so annotations work on every
/// screen simultaneously (instead of moving one window between monitors).
fn overlay_windows(app: &AppHandle) -> Vec<tauri::WebviewWindow> {
    app.webview_windows()
        .into_iter()
        .filter(|(label, _)| label.starts_with("overlay_"))
        .map(|(_, w)| w)
        .collect()
}

/// Ensure exactly one overlay window exists per connected monitor, each sized
/// and positioned to fill its own monitor. Creates missing overlays, re-syncs
/// existing ones to their monitor's current geometry, and hides any overlay
/// whose monitor was disconnected. Safe to call repeatedly (startup + every
/// activation), which also handles monitors being plugged in/out at runtime.
///
/// Positions/sizes are set in LOGICAL coordinates (points). macOS reports
/// monitor geometry in physical pixels (logical * scale_factor); dividing back
/// by the monitor's own scale factor recovers the global points the window
/// manager actually expects. Setting physical coordinates instead is what made
/// the old single-moving-window approach land on the wrong monitor under mixed
/// DPI — the physical->points conversion used the *source* window's scale.
fn sync_overlay_windows(app: &AppHandle) {
    let Some(query_window) = app.get_webview_window("main")
        .or_else(|| overlay_windows(app).into_iter().next())
    else {
        return;
    };

    let monitors = match query_window.available_monitors() {
        Ok(m) => m,
        Err(e) => {
            eprintln!("sync_overlay_windows: failed to enumerate monitors: {}", e);
            return;
        }
    };

    for (i, monitor) in monitors.iter().enumerate() {
        let label = format!("overlay_{}", i);
        let scale = monitor.scale_factor();
        let pos = monitor.position();
        let size = monitor.size();
        let lx = pos.x as f64 / scale;
        let ly = pos.y as f64 / scale;
        let lw = size.width as f64 / scale;
        let lh = size.height as f64 / scale;

        if let Some(window) = app.get_webview_window(&label) {
            // Re-sync an existing overlay to its monitor's current geometry
            let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition { x: lx, y: ly }));
            let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize { width: lw, height: lh }));
        } else {
            match tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::App("overlay.html".into()))
                .title("Annotatr Overlay")
                .position(lx, ly)
                .inner_size(lw, lh)
                .resizable(false)
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .shadow(false)
                .accept_first_mouse(true)
                .visible_on_all_workspaces(true)
                .closable(false)
                .minimizable(false)
                .maximizable(false)
                .visible(false)
                .build()
            {
                Ok(window) => {
                    // The overlay must be click-through from the first frame;
                    // it only captures the mouse while drawing (see show_overlay)
                    let _ = window.set_ignore_cursor_events(true);
                    // Force a hidden initial state — builder visible(false) is
                    // not always honored for transparent windows on macOS, and
                    // a phantom-visible overlay would confuse session toggling.
                    let _ = window.hide();
                    println!("Created overlay '{}' on monitor {} at logical ({}, {}), size: {}x{}",
                        label, i, lx, ly, lw, lh);
                }
                Err(e) => eprintln!("sync_overlay_windows: failed to create {}: {}", label, e),
            }
        }
    }

    // Hide overlays whose monitor was disconnected (label index >= monitor count)
    let monitor_count = monitors.len();
    for (label, window) in app.webview_windows() {
        if let Some(idx) = label.strip_prefix("overlay_").and_then(|s| s.parse::<usize>().ok()) {
            if idx >= monitor_count {
                let _ = window.set_ignore_cursor_events(true);
                let _ = window.hide();
            }
        }
    }
}

/// Show the overlays
/// This makes every monitor's overlay visible and brings them to the foreground
/// Feature #8: One overlay per monitor, so drawing works on all screens at once
/// Feature #15: Ensures z-index management to stay above other windows
#[tauri::command]
fn show_overlay(app: AppHandle) -> Result<(), String> {
    // Ensure one overlay exists per monitor and each is positioned correctly
    // (also picks up monitors connected since the last activation)
    sync_overlay_windows(&app);

    let overlays = overlay_windows(&app);
    if overlays.is_empty() {
        return Err("No overlay windows available".to_string());
    }

    // Feature #8: Determine the cursor's monitor so we can focus that overlay
    // (focus drives which overlay receives the Escape key before any click)
    let cursor_info = get_cursor_monitor(app.clone()).ok();
    let focus_label = cursor_info
        .as_ref()
        .and_then(|info| info["monitor_id"].as_str())
        .map(|monitor_id| monitor_id.replace("monitor_", "overlay_"));

    // Update state with current monitor
    if let Ok(mut state_guard) = app.state::<SharedState>().try_lock() {
        state_guard.is_visible = true;
        if let Some(monitor_id) = cursor_info
            .as_ref()
            .and_then(|info| info["monitor_id"].as_str())
        {
            state_guard.current_monitor = Some(monitor_id.to_string());
        }
    }

    // Show and arm every overlay so the user can draw on any monitor
    for overlay_window in &overlays {
        // Re-enable mouse capture: dismiss leaves the window in click-through
        // mode (ignore_cursor_events=true), so every show path must capture
        // input again or drawing breaks after the first dismiss
        overlay_window.set_ignore_cursor_events(false).map_err(|e| e.to_string())?;
        overlay_window.show().map_err(|e| e.to_string())?;
        // Feature #15: Ensure always-on-top is set so the overlay stays topmost
        overlay_window.set_always_on_top(true).map_err(|e| e.to_string())?;
    }

    // Bring the cursor's-monitor overlay to the foreground and focus it.
    // Focus is intentional — that overlay must be key so Escape works before
    // any click. acceptFirstMouse lets the other overlays draw without focus.
    let focused = focus_label
        .as_ref()
        .and_then(|label| app.get_webview_window(label))
        .or_else(|| overlays.first().cloned());
    if let Some(window) = focused {
        window.set_focus().map_err(|e| e.to_string())?;
        // Re-assert topmost after focus to handle window manager changes
        window.set_always_on_top(true).map_err(|e| e.to_string())?;
    }

    println!("Overlays shown ({} monitor(s)), focused {:?}", overlays.len(), focus_label);

    Ok(())
}

/// Get the current monitor ID
/// Feature #9: Returns the monitor where the overlay is currently positioned
#[tauri::command]
fn get_current_monitor(app: AppHandle) -> Result<Option<String>, String> {
    if let Ok(state_guard) = app.state::<SharedState>().try_lock() {
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
        .or_else(|| overlay_windows(&app).into_iter().next())
        .ok_or("No window available for monitor detection")?;

    let monitors = primary_window.available_monitors()
        .map_err(|e| format!("Failed to get monitor info: {}", e))?;

    // Convert monitor information to JSON
    let monitor_info: Vec<serde_json::Value> = monitors.iter().enumerate().map(|(i, monitor)| {
        let size = monitor.size();
        let position = monitor.position();
        let scale_factor = monitor.scale_factor();
        let default_name = format!("Monitor {}", i + 1);
        let name = monitor.name().unwrap_or(&default_name);

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

/// Feature #8: Get current cursor position and determine which monitor it's on
/// This is used to position the overlay on the correct monitor when drawing mode is activated
#[tauri::command]
fn get_cursor_monitor(app: AppHandle) -> Result<serde_json::Value, String> {
    use tauri::Manager;

    // Get the primary window to access monitor APIs
    let primary_window = app.get_webview_window("main")
        .or_else(|| overlay_windows(&app).into_iter().next())
        .ok_or("No window available")?;

    // Get cursor position using Tauri's cursor position API
    let cursor_pos = primary_window.cursor_position()
        .map_err(|e| format!("Failed to get cursor position: {}", e))?;

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
        let default_name = format!("Monitor {}", i + 1);
        let name = monitor.name().unwrap_or(&default_name);

        // Check if cursor is within this monitor's bounds
        // Note: cursor_pos is now PhysicalPosition<f64> (not i32)
        let is_cursor_in_monitor = cursor_pos.x >= position.x as f64
            && cursor_pos.x < (position.x + size.width as i32) as f64
            && cursor_pos.y >= position.y as f64
            && cursor_pos.y < (position.y + size.height as i32) as f64;

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
        let primary = primary_window.primary_monitor()
            .map_err(|e| format!("Failed to get primary monitor: {}", e))?;
        if let Some(primary) = primary {
            let size = primary.size();
            let position = primary.position();
            let scale_factor = primary.scale_factor();
            let default_name = "Primary Monitor".to_string();
            let name = primary.name().unwrap_or(&default_name);

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
/// Unregister all currently registered hotkeys and clear the dispatch table
fn clear_registered_hotkeys(app: &AppHandle) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

    if let Ok(mut registry_guard) = app.state::<SharedHotkeyRegistry>().lock() {
        for hotkey_str in registry_guard.registered_hotkeys.iter() {
            if let Ok((modifiers, code)) = parse_hotkey_string(hotkey_str) {
                let shortcut = Shortcut::new(Some(modifiers), code);
                if let Err(e) = app.global_shortcut().unregister(shortcut) {
                    eprintln!("Failed to unregister hotkey '{}': {}", hotkey_str, e);
                }
            }
        }
        registry_guard.registered_hotkeys.clear();
    }

    if let Ok(mut dispatch) = app.state::<SharedHotkeyDispatch>().lock() {
        dispatch.actions.clear();
        dispatch.held.clear();
    }

    Ok(())
}

/// Register the given hotkey config (map of action name -> combo string) with
/// the OS and populate the dispatch table the plugin handler reads from.
/// A combo that fails to parse or register is skipped so one bad user
/// binding cannot kill the rest; the failures are returned so callers can
/// surface them instead of silently leaving an action unbound.
fn apply_hotkey_config(app: &AppHandle, hotkeys_obj: &serde_json::Map<String, serde_json::Value>) -> Result<Vec<String>, String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

    clear_registered_hotkeys(app)?;

    let mut failures: Vec<String> = Vec::new();

    for (hotkey_name, hotkey_str) in hotkeys_obj.iter() {
        let Some(hotkey_value) = hotkey_str.as_str() else { continue };

        let (modifiers, code) = match parse_hotkey_string(hotkey_value) {
            Ok(parsed) => parsed,
            Err(e) => {
                eprintln!("Skipping hotkey '{}' for '{}': {}", hotkey_value, hotkey_name, e);
                failures.push(format!("{} ({}): {}", hotkey_name, hotkey_value, e));
                continue;
            }
        };

        let shortcut = Shortcut::new(Some(modifiers), code);
        if let Err(e) = app.global_shortcut().register(shortcut) {
            // Typically a conflict with another app's registration or a
            // duplicate combo within this config
            eprintln!("Failed to register hotkey '{}' for '{}': {}", hotkey_value, hotkey_name, e);
            failures.push(format!("{} ({}): {}", hotkey_name, hotkey_value, e));
            continue;
        }

        let action = if hotkey_name == "toggleDrawingMode" {
            HotkeyAction::ToggleToolbar
        } else {
            HotkeyAction::Tool(convert_hotkey_tool_name(hotkey_name))
        };

        if let Ok(mut dispatch) = app.state::<SharedHotkeyDispatch>().lock() {
            dispatch.actions.insert(shortcut.id(), action);
        }
        if let Ok(mut registry_guard) = app.state::<SharedHotkeyRegistry>().lock() {
            registry_guard.registered_hotkeys.push(hotkey_value.to_string());
        }
        println!("Registered hotkey '{}' for '{}'", hotkey_value, hotkey_name);
    }

    Ok(failures)
}

/// Feature #56, #57, #58, #62: Register global hotkeys for tools and toggle
/// Kept for the frontend contract: App.tsx re-invokes this with the full
/// settings object whenever hotkeys change. Errs when any binding could not
/// be registered so the UI can tell the user instead of silently unbinding
/// the only way to summon an invisible app.
#[tauri::command]
fn register_hotkeys(app: AppHandle, hotkey_config: serde_json::Value) -> Result<(), String> {
    let hotkeys_obj = hotkey_config["hotkeys"].as_object()
        .ok_or("Invalid hotkeys config: missing 'hotkeys' object")?;
    let failures = apply_hotkey_config(&app, hotkeys_obj)?;
    if failures.is_empty() {
        Ok(())
    } else {
        Err(format!("Some hotkeys could not be registered: {}", failures.join("; ")))
    }
}

/// Register hotkeys from persisted settings at startup, falling back to
/// defaults. Runs in the setup hook so hotkeys work before any webview mounts.
fn register_hotkeys_from_store(app: &AppHandle) {
    let stored = StoreBuilder::new(app, PathBuf::from("settings.json"))
        .build()
        .ok()
        .and_then(|store| store.get("hotkeys"));

    let hotkeys = stored.unwrap_or_else(|| get_default_settings()["hotkeys"].clone());

    match hotkeys.as_object() {
        Some(obj) => match apply_hotkey_config(app, obj) {
            Ok(failures) if !failures.is_empty() => {
                eprintln!("Some hotkeys failed to register at startup: {}", failures.join("; "));
            }
            Err(e) => eprintln!("Failed to register hotkeys at startup: {}", e),
            Ok(_) => {}
        },
        None => eprintln!("Stored hotkeys setting is not an object; no hotkeys registered"),
    }
}

/// Parse a hotkey string like "Ctrl+Shift+A" into (Modifiers, Code)
fn parse_hotkey_string(s: &str) -> Result<(Modifiers, Code), String> {

    let mut modifiers = Modifiers::empty();
    let mut key = None;

    for part in s.split('+') {
        let part = part.trim();
        match part.to_uppercase().as_str() {
            "CTRL" | "CONTROL" => modifiers |= Modifiers::CONTROL,
            "SHIFT" => modifiers |= Modifiers::SHIFT,
            "ALT" => modifiers |= Modifiers::ALT,
            "META" | "CMD" | "SUPER" | "WIN" => modifiers |= Modifiers::SUPER,
            _ => {
                // This is the key
                if key.is_some() {
                    return Err(format!("Multiple keys found in hotkey: '{}'", s));
                }
                key = Some(parse_key_code(part)?);
            }
        }
    }

    let code = key.ok_or(format!("No key found in hotkey: '{}'", s))?;

    Ok((modifiers, code))
}

/// Parse a key string (e.g., "A", "F1", "Space") into a Code
fn parse_key_code(s: &str) -> Result<tauri_plugin_global_shortcut::Code, String> {
    use tauri_plugin_global_shortcut::Code;

    let s_upper = s.to_uppercase();

    // Single character keys (A-Z, 0-9)
    if s_upper.len() == 1 {
        let c = s_upper.chars().next().unwrap();
        if c.is_ascii_digit() {
            return match c {
                '0' => Ok(Code::Digit0),
                '1' => Ok(Code::Digit1),
                '2' => Ok(Code::Digit2),
                '3' => Ok(Code::Digit3),
                '4' => Ok(Code::Digit4),
                '5' => Ok(Code::Digit5),
                '6' => Ok(Code::Digit6),
                '7' => Ok(Code::Digit7),
                '8' => Ok(Code::Digit8),
                '9' => Ok(Code::Digit9),
                _ => unreachable!(),
            };
        }
        if c.is_alphabetic() {
            return match c {
                'A' => Ok(Code::KeyA),
                'B' => Ok(Code::KeyB),
                'C' => Ok(Code::KeyC),
                'D' => Ok(Code::KeyD),
                'E' => Ok(Code::KeyE),
                'F' => Ok(Code::KeyF),
                'G' => Ok(Code::KeyG),
                'H' => Ok(Code::KeyH),
                'I' => Ok(Code::KeyI),
                'J' => Ok(Code::KeyJ),
                'K' => Ok(Code::KeyK),
                'L' => Ok(Code::KeyL),
                'M' => Ok(Code::KeyM),
                'N' => Ok(Code::KeyN),
                'O' => Ok(Code::KeyO),
                'P' => Ok(Code::KeyP),
                'Q' => Ok(Code::KeyQ),
                'R' => Ok(Code::KeyR),
                'S' => Ok(Code::KeyS),
                'T' => Ok(Code::KeyT),
                'U' => Ok(Code::KeyU),
                'V' => Ok(Code::KeyV),
                'W' => Ok(Code::KeyW),
                'X' => Ok(Code::KeyX),
                'Y' => Ok(Code::KeyY),
                'Z' => Ok(Code::KeyZ),
                _ => Err(format!("Unknown key: '{}'", s))
            };
        }
    }

    // Special keys
    match s_upper.as_str() {
        "SPACE" => Ok(Code::Space),
        "ENTER" | "RETURN" => Ok(Code::Enter),
        "TAB" => Ok(Code::Tab),
        "ESCAPE" | "ESC" => Ok(Code::Escape),
        "BACKSPACE" => Ok(Code::Backspace),
        "DELETE" | "DEL" => Ok(Code::Delete),
        "INSERT" => Ok(Code::Insert),
        "HOME" => Ok(Code::Home),
        "END" => Ok(Code::End),
        "PAGEUP" => Ok(Code::PageUp),
        "PAGEDOWN" => Ok(Code::PageDown),
        "LEFT" | "ARROWLEFT" => Ok(Code::ArrowLeft),
        "RIGHT" | "ARROWRIGHT" => Ok(Code::ArrowRight),
        "UP" | "ARROWUP" => Ok(Code::ArrowUp),
        "DOWN" | "ARROWDOWN" => Ok(Code::ArrowDown),
        "F1" => Ok(Code::F1),
        "F2" => Ok(Code::F2),
        "F3" => Ok(Code::F3),
        "F4" => Ok(Code::F4),
        "F5" => Ok(Code::F5),
        "F6" => Ok(Code::F6),
        "F7" => Ok(Code::F7),
        "F8" => Ok(Code::F8),
        "F9" => Ok(Code::F9),
        "F10" => Ok(Code::F10),
        "F11" => Ok(Code::F11),
        "F12" => Ok(Code::F12),
        _ => Err(format!("Unknown key: '{}'", s))
    }
}

/// Convert hotkey config key to ToolType value
/// Example: "freehandTool" -> "freehand", "textTool" -> "text"
fn convert_hotkey_tool_name(hotkey_key: &str) -> String {
    match hotkey_key {
        "arrowTool" => "arrow".to_string(),
        "lineTool" => "line".to_string(),
        "circleTool" => "circle".to_string(),
        "boxTool" => "box".to_string(),
        "diamondTool" => "diamond".to_string(),
        "freehandTool" => "freehand".to_string(),
        "highlighterTool" => "highlighter".to_string(),
        "textTool" => "text".to_string(),
        _ => hotkey_key.to_string(), // Return as-is if no match
    }
}

/// Feature #63: Get list of known system hotkeys for the current platform
/// Returns a map of hotkey strings to descriptions of what they do
fn get_system_hotkeys() -> Vec<(String, String)> {
    let platform = std::env::consts::OS;

    match platform {
        "macos" => vec![
            // macOS system shortcuts
            ("Cmd+Space".to_string(), "Spotlight Search".to_string()),
            ("Cmd+Tab".to_string(), "Application Switcher".to_string()),
            ("Cmd+Q".to_string(), "Quit Application".to_string()),
            ("Cmd+W".to_string(), "Close Window".to_string()),
            ("Cmd+C".to_string(), "Copy".to_string()),
            ("Cmd+V".to_string(), "Paste".to_string()),
            ("Cmd+X".to_string(), "Cut".to_string()),
            ("Cmd+Z".to_string(), "Undo".to_string()),
            ("Cmd+Shift+Z".to_string(), "Redo".to_string()),
            ("Cmd+A".to_string(), "Select All".to_string()),
            ("Cmd+S".to_string(), "Save".to_string()),
            ("Cmd+F".to_string(), "Find".to_string()),
            ("Cmd+P".to_string(), "Print".to_string()),
            ("Cmd+N".to_string(), "New Window/Document".to_string()),
            ("Cmd+H".to_string(), "Hide Application".to_string()),
            ("Cmd+Option+H".to_string(), "Hide Others".to_string()),
            ("Cmd+M".to_string(), "Minimize".to_string()),
            ("Cmd+Option+M".to_string(), "Minimize All".to_string()),
            ("Cmd+Option+Esc".to_string(), "Force Quit Applications".to_string()),
            ("Cmd+Shift+3".to_string(), "Screenshot (Full Screen)".to_string()),
            ("Cmd+Shift+4".to_string(), "Screenshot (Selection)".to_string()),
            ("Cmd+Shift+5".to_string(), "Screenshot (Screen Recording Tools)".to_string()),
            ("F11".to_string(), "Show Desktop".to_string()),
            ("F12".to_string(), "Dashboard (if enabled)".to_string()),
            ("Cmd+Option+D".to_string(), "Show/Hide Dock".to_string()),
        ],
        "windows" => vec![
            // Windows system shortcuts
            ("Ctrl+Esc".to_string(), "Open Start Menu".to_string()),
            ("Ctrl+Shift+Esc".to_string(), "Task Manager".to_string()),
            ("Alt+Tab".to_string(), "Application Switcher".to_string()),
            ("Alt+F4".to_string(), "Close Application".to_string()),
            ("Ctrl+C".to_string(), "Copy".to_string()),
            ("Ctrl+V".to_string(), "Paste".to_string()),
            ("Ctrl+X".to_string(), "Cut".to_string()),
            ("Ctrl+Z".to_string(), "Undo".to_string()),
            ("Ctrl+Y".to_string(), "Redo".to_string()),
            ("Ctrl+A".to_string(), "Select All".to_string()),
            ("Ctrl+S".to_string(), "Save".to_string()),
            ("Ctrl+F".to_string(), "Find".to_string()),
            ("Ctrl+P".to_string(), "Print".to_string()),
            ("Ctrl+N".to_string(), "New Window/Document".to_string()),
            ("Win+D".to_string(), "Show Desktop".to_string()),
            ("Win+L".to_string(), "Lock Computer".to_string()),
            ("Win+E".to_string(), "Open File Explorer".to_string()),
            ("Win+R".to_string(), "Run Dialog".to_string()),
            ("Win+Tab".to_string(), "Task View".to_string()),
            ("PrtScn".to_string(), "Screenshot (Full Screen)".to_string()),
            ("Alt+PrtScn".to_string(), "Screenshot (Active Window)".to_string()),
            ("Win+Shift+S".to_string(), "Screenshot (Selection)".to_string()),
            ("F11".to_string(), "Fullscreen (in browsers/apps)".to_string()),
        ],
        "linux" => vec![
            // Linux system shortcuts (common desktop environments)
            ("Alt+Tab".to_string(), "Application Switcher".to_string()),
            ("Alt+F4".to_string(), "Close Application".to_string()),
            ("Ctrl+Alt+T".to_string(), "Terminal (GNOME/KDE)".to_string()),
            ("Ctrl+Alt+L".to_string(), "Lock Screen (GNOME/KDE)".to_string()),
            ("Ctrl+Alt+D".to_string(), "Show Desktop (GNOME)".to_string()),
            ("Ctrl+Alt+ArrowLeft".to_string(), "Switch Workspace Left".to_string()),
            ("Ctrl+Alt+ArrowRight".to_string(), "Switch Workspace Right".to_string()),
            ("Super".to_string(), "Application Menu (GNOME/KDE)".to_string()),
            ("Super+D".to_string(), "Show Desktop".to_string()),
            ("Super+L".to_string(), "Lock Screen".to_string()),
            ("Print".to_string(), "Screenshot".to_string()),
            ("Ctrl+C".to_string(), "Copy".to_string()),
            ("Ctrl+V".to_string(), "Paste".to_string()),
            ("Ctrl+X".to_string(), "Cut".to_string()),
            ("Ctrl+Z".to_string(), "Undo".to_string()),
            ("Ctrl+Shift+Z".to_string(), "Redo".to_string()),
        ],
        _ => vec![],
    }
}

/// Feature #63: Check if a hotkey conflicts with known system shortcuts
/// Returns None if no conflict, or Some(description) if conflict exists
fn check_hotkey_conflict(hotkey_str: &str) -> Option<String> {
    let system_hotkeys = get_system_hotkeys();

    // Normalize the hotkey string for comparison
    let normalized = normalize_hotkey_string(hotkey_str);

    for (system_hotkey, description) in system_hotkeys.iter() {
        let system_normalized = normalize_hotkey_string(system_hotkey);
        if normalized == system_normalized {
            return Some(description.clone());
        }
    }

    None
}

/// Normalize a hotkey string for comparison
/// Converts "Ctrl+Shift+A" to "ctrl+shift+a" for case-insensitive comparison
fn normalize_hotkey_string(s: &str) -> String {
    s.to_lowercase()
        .replace("control", "ctrl")
        .replace("command", "cmd")
        .replace("super", "win")
        .replace("meta", "cmd")
        .replace(" ", "")
}

/// Feature #63: Check all configured hotkeys for conflicts
/// Returns a JSON object with conflict information for each hotkey
#[tauri::command]
fn check_hotkey_conflicts(hotkey_config: serde_json::Value) -> Result<serde_json::Value, String> {
    let mut conflicts = serde_json::Map::new();

    // Get the hotkeys object from config
    let hotkeys_obj = hotkey_config["hotkeys"].as_object()
        .ok_or("Invalid hotkeys config: missing 'hotkeys' object")?;

    // Only conflicting hotkeys go in the map — the frontend treats any
    // entry as a conflict to warn about
    for (hotkey_name, hotkey_value) in hotkeys_obj.iter() {
        if let Some(hotkey_str) = hotkey_value.as_str() {
            if let Some(conflict_desc) = check_hotkey_conflict(hotkey_str) {
                conflicts.insert(
                    hotkey_name.clone(),
                    serde_json::json!({
                        "conflict": true,
                        "hotkey": hotkey_str,
                        "system_function": conflict_desc,
                        "severity": "warning"
                    })
                );
            }
        }
    }

    Ok(serde_json::json!({
        "has_conflicts": !conflicts.is_empty(),
        "conflicts": conflicts
    }))
}

/// Position the toolbar window: stored position if it still lands on a
/// monitor, otherwise bottom-center of the cursor's monitor. Validation
/// matters — a stale stored position on a disconnected monitor would make
/// the toolbar summon invisibly.
fn position_toolbar(app: &AppHandle) {
    let Some(panel) = app.get_webview_window("mini-panel") else { return };

    let stored = StoreBuilder::new(app, PathBuf::from("settings.json"))
        .build()
        .ok()
        .and_then(|store| store.get("mini_panel_position"))
        .and_then(|pos| Some((pos["x"].as_i64()? as i32, pos["y"].as_i64()? as i32)));

    if let Some((x, y)) = stored {
        if let Ok(monitors) = panel.available_monitors() {
            let on_screen = monitors.iter().any(|m| {
                let p = m.position();
                let s = m.size();
                x >= p.x && x < p.x + s.width as i32 && y >= p.y && y < p.y + s.height as i32
            });
            if on_screen {
                let _ = panel.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
                return;
            }
        }
    }

    // Default: bottom-center of the monitor the cursor is on
    if let Ok(info) = get_cursor_monitor(app.clone()) {
        if let Some(m) = info["monitor"].as_object() {
            let mx = m["x"].as_i64().unwrap_or(0) as i32;
            let my = m["y"].as_i64().unwrap_or(0) as i32;
            let mw = m["width"].as_u64().unwrap_or(1920) as i32;
            let mh = m["height"].as_u64().unwrap_or(1080) as i32;
            if let Ok(size) = panel.outer_size() {
                let x = mx + (mw - size.width as i32) / 2;
                let y = my + mh - size.height as i32 - 80;
                let _ = panel.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
            }
        }
    }
}

/// Keep the toolbar one window level above the overlay so its buttons stay
/// clickable while drawing. Tauri's always-on-top puts both windows at
/// NSFloatingWindowLevel (3), where the overlay — shown later — covers the
/// toolbar; NSModalPanelWindowLevel (8) keeps the toolbar on top.
#[cfg(target_os = "macos")]
fn raise_toolbar_above_overlay(app: &AppHandle) {
    if let Some(panel) = app.get_webview_window("mini-panel") {
        let panel_for_closure = panel.clone();
        // NSWindow calls must happen on the main thread
        let _ = panel.run_on_main_thread(move || {
            if let Ok(ns_window) = panel_for_closure.ns_window() {
                unsafe {
                    use objc2::msg_send;
                    use objc2::runtime::AnyObject;
                    let ns = ns_window as *mut AnyObject;
                    let _: () = msg_send![ns, setLevel: 8isize];
                }
            }
        });
    }
}

/// Keep the toolbar above the overlay on Windows. Both windows are
/// HWND_TOPMOST, and the overlay — shown + focused last — ends up at the top of
/// the topmost band, full-screen and capturing the mouse, so its z-order
/// swallows clicks aimed at the tool buttons (the user then has to press Escape,
/// which wipes the drawings, before switching tools). Re-insert the toolbar at
/// the top of the topmost band so its buttons stay clickable mid-drawing.
/// SWP_NOACTIVATE keeps keyboard focus on the overlay (so Escape still works)
/// and on the app being demoed — mirroring the macOS NSModalPanelWindowLevel fix.
#[cfg(target_os = "windows")]
fn raise_toolbar_above_overlay(app: &AppHandle) {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    };
    if let Some(panel) = app.get_webview_window("mini-panel") {
        let panel_for_closure = panel.clone();
        // SetWindowPos is safest on the thread that owns the window
        let _ = panel.run_on_main_thread(move || {
            if let Ok(hwnd) = panel_for_closure.hwnd() {
                unsafe {
                    let _ = SetWindowPos(
                        hwnd,
                        Some(HWND_TOPMOST),
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                    );
                }
            }
        });
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn raise_toolbar_above_overlay(_app: &AppHandle) {}

/// Show the toolbar without activating the app: tao's set_visible(true) is
/// makeKeyAndOrderFront without activateIgnoringOtherApps, so the app the
/// user is demoing keeps keyboard focus and its menu bar.
fn show_toolbar(app: &AppHandle) -> Result<(), String> {
    let panel = app.get_webview_window("mini-panel")
        .ok_or("Mini panel window not found")?;
    if !panel.is_visible().unwrap_or(false) {
        position_toolbar(app);
    }
    panel.show().map_err(|e| e.to_string())?;
    // set_always_on_top resets the NSWindow level to floating, so the
    // toolbar's elevated level must be re-applied after it
    let _ = panel.set_always_on_top(true);
    raise_toolbar_above_overlay(app);
    Ok(())
}

/// Activate a drawing tool: ensure toolbar + overlay are up, capture the
/// mouse, and tell the overlay which tool to use. Called from the global
/// hotkey handler and from the toolbar's tool buttons (via the
/// activate_tool_hotkey command).
fn activate_tool(app: &AppHandle, tool: String) -> Result<(), String> {
    // Convert hotkey config key to ToolType value ("freehandTool" -> "freehand");
    // plain tool names pass through unchanged
    let tool_type = convert_hotkey_tool_name(&tool);

    // Drawing and the Settings window are mutually exclusive: hide Settings
    // before showing the overlay, otherwise the captured (always-on-top)
    // overlay would draw over it instead of letting it be used.
    if let Some(main) = app.get_webview_window("main") {
        if main.is_visible().unwrap_or(false) {
            let _ = main.hide();
        }
    }

    // Keep the toolbar visible alongside the overlay so the user can switch tools
    show_toolbar(app)?;

    // Unconditionally run the full show path: position on the cursor's
    // monitor, re-enable mouse capture, show, raise, focus. Focus is
    // intentional — the overlay must be key so Escape works before any click.
    show_overlay(app.clone())?;

    // show_overlay shows + focuses the overlay and re-asserts its floating
    // always-on-top level *last*, which can leave the overlay sitting at or
    // above the toolbar and swallowing clicks aimed at the tool buttons (the
    // user then has to press Escape before they can switch tools). Re-raise
    // the toolbar to the modal-panel level AFTER the overlay so it ends up
    // topmost and stays clickable mid-drawing.
    raise_toolbar_above_overlay(app);

    if let Ok(mut state_guard) = app.state::<SharedState>().try_lock() {
        state_guard.is_visible = true;
        state_guard.drawing_mode = true;
    }

    app.emit("tool-selected", tool_type.clone())
        .map_err(|e| format!("Failed to emit event: {}", e))?;
    app.emit("drawing-mode-changed", true)
        .map_err(|e| format!("Failed to emit event: {}", e))?;

    println!("Activated tool '{}' (from '{}'), overlay shown", tool_type, tool);

    Ok(())
}

/// Feature #18: Activate overlay and select a tool via hotkey
/// This command is called when a tool button is clicked in the toolbar
#[tauri::command]
fn activate_tool_hotkey(app: AppHandle, tool: String) -> Result<(), String> {
    activate_tool(&app, tool)
}

/// Toggle the annotation session: Idle -> toolbar shown (no focus steal),
/// anything visible -> everything hidden and activation returned to the
/// previously frontmost app. Wired to the toggle hotkey.
fn toggle_session(app: &AppHandle) -> Result<bool, String> {
    let panel = app.get_webview_window("mini-panel")
        .ok_or("Mini panel window not found")?;
    // Use the authoritative session flag for "is a drawing overlay active",
    // not a per-window is_visible() poll: freshly-created hidden overlay
    // windows don't reliably report invisible on macOS, which would make the
    // first toggle take the hide branch and the toolbar would never appear.
    let overlay_active = if let Ok(state_guard) = app.state::<SharedState>().try_lock() {
        state_guard.is_visible
    } else {
        false
    };
    let panel_visible = panel.is_visible().unwrap_or(false);

    if overlay_active || panel_visible {
        // -> Idle
        dismiss_overlay_internal(app, false)?;
        let _ = panel.hide();
        // Hand activation back to the previously frontmost app
        #[cfg(target_os = "macos")]
        let _ = app.hide();
        println!("Session toggled OFF (idle)");
        Ok(false)
    } else {
        // Idle -> ToolbarOnly
        show_toolbar(app)?;
        println!("Session toggled ON (toolbar shown)");
        Ok(true)
    }
}

/// Quit the application (toolbar power button)
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Dismiss the overlay (hide and clean up state)
/// Feature #20: Properly deactivates overlay and cleans up existing shapes.
/// When `return_focus` is true (Escape during drawing), activation is handed
/// back to the previously frontmost app and the toolbar is kept visible.
fn dismiss_overlay_internal(app: &AppHandle, return_focus: bool) -> Result<(), String> {
    // Update state to mark overlay as not visible
    let state = app.state::<SharedState>();
    if let Ok(mut state_guard) = state.try_lock() {
        state_guard.is_visible = false;
        // Feature #20: Also disable drawing mode when dismissing
        state_guard.drawing_mode = false;
    }

    // Hide every monitor's overlay and return them to click-through mode
    for overlay_window in overlay_windows(app) {
        overlay_window.hide().map_err(|e| e.to_string())?;
        overlay_window.set_ignore_cursor_events(true).map_err(|e| e.to_string())?;
    }

    // Feature #20: Emit event to clear drawing state and shapes
    app.emit("overlay-dismissed", ())
        .map_err(|e| format!("Failed to emit overlay-dismissed event: {}", e))?;

    // Feature #20: Clear all shapes
    app.emit("clear-all-shapes", ())
        .map_err(|e| format!("Failed to emit clear-all-shapes event: {}", e))?;

    // Feature #20: Emit drawing mode changed event to reset cursor
    app.emit("drawing-mode-changed", false)
        .map_err(|e| format!("Failed to emit drawing-mode-changed event: {}", e))?;

    // Drawing -> ToolbarOnly: NSApp hide returns activation to the previous
    // app (the one being demoed); re-show the toolbar afterwards since
    // app.hide() hides ALL our windows. show() does not re-activate us.
    #[cfg(target_os = "macos")]
    if return_focus {
        let panel_was_visible = app.get_webview_window("mini-panel")
            .and_then(|p| p.is_visible().ok())
            .unwrap_or(false);
        let _ = app.hide();
        if panel_was_visible {
            if let Some(panel) = app.get_webview_window("mini-panel") {
                let _ = panel.show();
            }
        }
    }

    println!("Overlay dismissed - shapes cleared, drawing state reset");

    Ok(())
}

/// Dismiss the overlay; called from the overlay's Escape handler
#[tauri::command]
fn dismiss_overlay(app: AppHandle) -> Result<(), String> {
    dismiss_overlay_internal(&app, true)
}

/// Feature #15: Ensure overlay stays on top after window focus changes
/// This handles cases where other applications might steal focus or z-index
#[tauri::command]
fn ensure_on_top(app: AppHandle) -> Result<(), String> {
    // Re-assert always-on-top for every visible overlay to maintain z-index
    for overlay_window in overlay_windows(&app) {
        if overlay_window.is_visible().unwrap_or(false) {
            let _ = overlay_window.set_always_on_top(true);
        }
    }

    // Re-asserting the overlays' always-on-top level can lift them back up to
    // the toolbar's level; keep the toolbar above so its buttons stay
    // clickable while drawing (this runs on a 5s timer + on focus changes).
    raise_toolbar_above_overlay(&app);

    Ok(())
}

/// Feature #19: Save mini panel position to persistent storage
/// Feature #50: Also saves which monitor the panel is on
/// Stores the off-screen position so it persists across app restarts
#[tauri::command]
fn save_mini_panel_position(app: AppHandle, x: i32, y: i32, monitor_id: Option<String>) -> Result<(), String> {
    let store_path = PathBuf::from("settings.json");
    let store = StoreBuilder::new(&app, store_path).build()
        .map_err(|e| format!("Failed to create store: {}", e))?;

    // If no monitor_id provided, detect which monitor contains this position
    let monitor_id_final = if let Some(mid) = monitor_id {
        mid
    } else {
        // Auto-detect monitor from position
        let primary_window = app.get_webview_window("main")
            .or_else(|| overlay_windows(&app).into_iter().next())
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

/// Show the main window (Settings window)
/// Used to open the Settings window from the Mini Panel
#[tauri::command]
fn show_main_window(app: AppHandle) -> Result<(), String> {
    // End any active drawing session first: the always-on-top overlay would
    // otherwise capture clicks (and draw) over the Settings window, making it
    // impossible to change settings. return_focus=false so this only hides the
    // overlay — it must not hand activation away from the window we're about
    // to focus, and it leaves the toolbar visible.
    let _ = dismiss_overlay_internal(&app, false);

    let main_window = app.get_webview_window("main")
        .ok_or("Main window not found")?;
    main_window.show().map_err(|e| e.to_string())?;
    main_window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

/// Hide the main window (Settings window)
/// Used to close the Settings window without closing the app
#[tauri::command]
fn hide_main_window(app: AppHandle) -> Result<(), String> {
    let main_window = app.get_webview_window("main")
        .ok_or("Main window not found")?;
    main_window.hide().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize shared state
    let overlay_state = SharedState::default();
    // Feature #65: Initialize hotkey registry
    let hotkey_registry = SharedHotkeyRegistry::default();
    // Dispatch table for global hotkey presses
    let hotkey_dispatch = SharedHotkeyDispatch::default();

    tauri::Builder::default()
        // Must be the first plugin registered: a second launch exits
        // immediately and this callback fires in the running instance
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Err(e) = show_toolbar(app) {
                eprintln!("Second instance launch: failed to show toolbar: {}", e);
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    let id = shortcut.id();
                    // Resolve the action in a tight lock scope: the window
                    // calls below must never run under the dispatch mutex
                    let action = {
                        let dispatch = app.state::<SharedHotkeyDispatch>();
                        let Ok(mut d) = dispatch.lock() else { return };
                        match event.state() {
                            ShortcutState::Released => {
                                d.held.remove(&id);
                                return;
                            }
                            ShortcutState::Pressed => {
                                if !d.held.insert(id) {
                                    // OS key-repeat while held: ignore
                                    return;
                                }
                                d.actions.get(&id).cloned()
                            }
                        }
                    };
                    match action {
                        Some(HotkeyAction::ToggleToolbar) => {
                            if let Err(e) = toggle_session(app) {
                                eprintln!("Toggle hotkey failed: {}", e);
                            }
                        }
                        Some(HotkeyAction::Tool(tool)) => {
                            if let Err(e) = activate_tool(app, tool) {
                                eprintln!("Tool hotkey failed: {}", e);
                            }
                        }
                        None => {}
                    }
                })
                .build(),
        )
        .manage(overlay_state)
        .manage(hotkey_registry)
        .manage(hotkey_dispatch)
        .setup(|app| {
            // Background utility: no Dock icon, no Cmd+Tab entry, and the
            // menu bar stays on the app being demoed
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // System Settings-style chrome: the settings window is transparent
            // with an NSVisualEffectView behind it; the webview paints the
            // sidebar translucent so the blur shows through there only
            #[cfg(target_os = "macos")]
            if let Some(main) = app.get_webview_window("main") {
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                if let Err(e) = apply_vibrancy(&main, NSVisualEffectMaterial::Sidebar, None, None) {
                    eprintln!("Failed to apply window vibrancy: {}", e);
                }
            }

            // Create one transparent overlay per monitor up front so drawing
            // works on every screen. Each is built click-through; show_overlay
            // arms them for input. Re-runs on every activation to track
            // monitors plugged in/out at runtime.
            sync_overlay_windows(app.handle());

            // Toolbar must outrank the overlay so it stays clickable
            // while drawing
            raise_toolbar_above_overlay(app.handle());

            // Hotkeys must work from launch, before any webview mounts
            register_hotkeys_from_store(app.handle());

            // Menu bar (status bar) icon: as a background Accessory app with
            // no Dock icon, the tray is the primary way to reach the app
            // without the global hotkey. Each item reuses the same command the
            // toolbar/hotkeys already call.
            {
                use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
                use tauri::tray::TrayIconBuilder;

                let h = app.handle();
                let settings_i = MenuItem::with_id(h, "tray_settings", "Settings…", true, None::<&str>)?;
                let toolbar_i = MenuItem::with_id(h, "tray_toolbar", "Show Toolbar", true, None::<&str>)?;
                let sep = PredefinedMenuItem::separator(h)?;
                let quit_i = MenuItem::with_id(h, "tray_quit", "Quit Annotatr", true, None::<&str>)?;
                let menu = Menu::with_items(h, &[&settings_i, &toolbar_i, &sep, &quit_i])?;

                let mut builder = TrayIconBuilder::with_id("main-tray")
                    .menu(&menu)
                    .tooltip("Annotatr")
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "tray_settings" => {
                            if let Err(e) = show_main_window(app.clone()) {
                                eprintln!("Tray: show settings failed: {}", e);
                            }
                        }
                        "tray_toolbar" => {
                            if let Err(e) = show_toolbar(app) {
                                eprintln!("Tray: show toolbar failed: {}", e);
                            }
                        }
                        "tray_quit" => quit_app(app.clone()),
                        _ => {}
                    });
                // Monochrome template glyph: a transparent-background PNG that
                // macOS tints to match the menu bar (light/dark), instead of the
                // full-color app icon which shows an out-of-place blue square.
                match tauri::image::Image::from_bytes(include_bytes!("../icons/menubar-template.png")) {
                    Ok(tray_icon) => {
                        builder = builder.icon(tray_icon).icon_as_template(true);
                    }
                    Err(e) => {
                        eprintln!("Tray: template icon failed ({e}); falling back to app icon");
                        if let Some(icon) = app.default_window_icon() {
                            builder = builder.icon(icon.clone());
                        }
                    }
                }
                builder.build(h)?;
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Settings window: the red close button hides instead of
            // destroying, so show_main_window keeps working and Tauri never
            // auto-exits when the last visible window closes
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            save_settings,
            load_settings,
            load_setting,
            reset_settings,
            show_overlay,
            get_current_monitor,
            get_monitor_info,
            get_cursor_monitor,
            set_drawing_mode,
            clear_all_shapes,
            register_hotkeys,
            check_hotkey_conflicts,
            activate_tool_hotkey,
            dismiss_overlay,
            ensure_on_top,
            save_mini_panel_position,
            show_main_window,
            hide_main_window,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
