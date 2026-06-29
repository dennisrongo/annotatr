import { useState, useEffect, useRef, useId } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { loadSettings, saveSettings, DEFAULT_SETTINGS, exportSettings, importSettings, resetSettings, ToolbarSize } from "./lib/storage";
import { ArrowHeadStyle, ShapeStyle } from "./types/shapes";
import { UpdateBanner, UpdateCheckRow } from "./components/UpdateBanner";

/**
 * Platform flags for the Settings window chrome.
 * - IS_MAC drives genuinely macOS-only UI (the ⌘ keycap label).
 * - HAS_NATIVE_GLASS is true wherever a native window backdrop (macOS
 *   NSVisualEffectView, Windows Mica/Acrylic) is applied in Rust. The window
 *   is transparent and the sidebar paints translucent over that backdrop, so
 *   both platforms share the same "glass" styling; Linux (no backdrop) keeps
 *   the opaque fallback.
 */
const PLATFORM = (typeof navigator !== "undefined" ? navigator.platform : "").toUpperCase();
const IS_MAC = PLATFORM.includes("MAC");
// navigator.platform reports "Win32" on Windows (legacy/deprecated but still
// the only per-window signal available before any Tauri API loads).
const HAS_NATIVE_GLASS = IS_MAC || PLATFORM.startsWith("WIN");

/**
 * Preset color palette for drawing tools
 */
const PRESET_COLORS = [
  "#FF3B30", // Red
  "#FF9500", // Orange
  "#FFD60A", // Yellow
  "#34C759", // Green
  "#00C7BE", // Teal
  "#0A84FF", // Blue
  "#BF5AF2", // Purple
  "#FF2D55", // Pink
  "#FFFFFF", // White
  "#000000", // Black
];

type TabId = "general" | "shortcuts" | "colors" | "advanced" | "about";

type Appearance = "auto" | "light" | "dark";

/** System Settings-style colored tile behind each sidebar glyph */
const TAB_TINT: Record<TabId, string> = {
  general: "#0a84ff",
  shortcuts: "#5e5ce6",
  colors: "#ff375f",
  advanced: "#8e8e93",
  about: "#34c759",
};

/** Human-readable names for hotkey actions */
const HOTKEY_LABELS: Record<string, string> = {
  toggleDrawingMode: "Toggle Toolbar",
  arrowTool: "Arrow",
  lineTool: "Line",
  circleTool: "Circle",
  boxTool: "Box",
  diamondTool: "Diamond",
  freehandTool: "Freehand",
  highlighterTool: "Highlighter",
  textTool: "Text",
};

/** macOS-style symbols for modifier/special keys */
const KEY_SYMBOLS: Record<string, string> = {
  Cmd: "⌘",
  Ctrl: "⌃",
  Shift: "⇧",
  Alt: "⌥",
  Win: "⊞",
  Space: "Space",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Escape: "⎋",
  Enter: "↩",
  Backspace: "⌫",
  Delete: "⌦",
  Tab: "⇥",
};

/** Render a "Ctrl+Shift+A" combo as individual keycaps */
function Keycaps({ combo }: { combo: string }) {
  return (
    <span className="st-keys">
      {combo.split("+").map((key, i) => (
        <kbd key={i} className="st-key">{KEY_SYMBOLS[key] ?? key}</kbd>
      ))}
    </span>
  );
}

/** Range slider with an accent-filled track */
function Slider({
  min, max, step, value, onChange, disabled = false,
}: {
  min: number; max: number; step: number; value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className="st-slider"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(parseInt(e.target.value, 10))}
      style={{
        background: `linear-gradient(to right, var(--accent) ${pct}%, var(--track) ${pct}%)`,
        ...(disabled ? { opacity: 0.4, cursor: "not-allowed" } : null),
      }}
    />
  );
}

/** The Annotatr app icon (mirrors app-icon.svg / the bundled icon.icns).
    IDs are namespaced per instance so multiple renders don't collide. */
function AppIcon({ size = 56 }: { size?: number }) {
  const u = useId().replace(/[:]/g, "");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      aria-hidden="true"
      style={{ display: "block", flex: "none", pointerEvents: "none" }}
    >
      <defs>
        <linearGradient id={`${u}face`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3aa0ff" />
          <stop offset="0.5" stopColor="#0a84ff" />
          <stop offset="1" stopColor="#0060df" />
        </linearGradient>
        <linearGradient id={`${u}sheen`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.30" />
          <stop offset="0.42" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${u}pen`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e7ecf3" />
        </linearGradient>
        <linearGradient id={`${u}red`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff6a60" />
          <stop offset="1" stopColor="#ff3b30" />
        </linearGradient>
        <filter id={`${u}ds`} x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="16" stdDeviation="22" floodColor="#002a66" floodOpacity="0.35" />
        </filter>
        <clipPath id={`${u}clip`}>
          <rect x="104" y="104" width="816" height="816" rx="188" ry="188" />
        </clipPath>
      </defs>
      <rect x="104" y="104" width="816" height="816" rx="188" ry="188" fill={`url(#${u}face)`} />
      <g clipPath={`url(#${u}clip)`}>
        <rect x="104" y="104" width="816" height="816" fill={`url(#${u}sheen)`} />
        <circle cx="700" cy="338" r="84" fill="none" stroke="#ffffff" strokeOpacity="0.15" strokeWidth="22" />
        <path d="M286 706 q70 -34 150 -10" fill="none" stroke="#ffffff" strokeOpacity="0.13" strokeWidth="22" strokeLinecap="round" />
      </g>
      <path d="M300 730 C 410 716, 520 708, 668 612" fill="none" stroke={`url(#${u}red)`} strokeWidth="42" strokeLinecap="round" />
      <g filter={`url(#${u}ds)`} transform="rotate(-39 512 470)">
        <rect x="450" y="206" width="126" height="408" rx="42" fill={`url(#${u}pen)`} />
        <rect x="450" y="206" width="126" height="62" rx="42" fill="#cdd6e2" opacity="0.5" />
        <rect x="450" y="562" width="126" height="30" fill="#0a84ff" opacity="0.9" />
        <path d="M450 592 h126 l-45 88 a26 26 0 0 1 -36 0 z" fill="#1d1d1f" />
        <path d="M489 658 h48 l-12 22 a14 14 0 0 1 -24 0 z" fill="#ff3b30" />
      </g>
    </svg>
  );
}

/** Sidebar nav icons (16x16, stroke = currentColor) */
const ICONS: Record<TabId, React.ReactNode> = {
  general: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.3 2.2l2.5 2.5L5.5 13 2.5 13.5 3 10.5z" />
      <path d="M9.5 4l2.5 2.5" />
    </svg>
  ),
  shortcuts: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="1.75" y="4" width="12.5" height="8" rx="1.5" />
      <path d="M4.25 7h.01M7 7h.01M9.75 7h.01M12 7h.01M4.75 9.75h6.5" />
    </svg>
  ),
  colors: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M8 1.8S3.25 7.2 3.25 10.1a4.75 4.75 0 0 0 9.5 0C12.75 7.2 8 1.8 8 1.8z" />
    </svg>
  ),
  advanced: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 5h2.2M7.8 5H14M2 11h6.2M11.8 11H14" />
      <circle cx="6" cy="5" r="1.8" />
      <circle cx="10" cy="11" r="1.8" />
    </svg>
  ),
  about: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v3.5M8 5.1h.01" />
    </svg>
  ),
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "general", label: "Drawing" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "colors", label: "Colors" },
  { id: "advanced", label: "Advanced" },
  { id: "about", label: "About" },
];

function App() {
  // Active tab state
  const [activeTab, setActiveTab] = useState<TabId>("general");

  // Appearance: follow the system or force a look. The data-theme attribute
  // drives the webview palette; setTheme syncs the native NSVisualEffectView.
  const [appearance, setAppearance] = useState<Appearance>(() => {
    try { return (localStorage.getItem("annotatr-appearance") as Appearance) || "auto"; }
    catch { return "auto"; }
  });
  const [systemDark, setSystemDark] = useState<boolean>(() => {
    try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return true; }
  });
  const effectiveTheme = appearance === "auto" ? (systemDark ? "dark" : "light") : appearance;

  const applyNativeTheme = (a: Appearance) => {
    getCurrentWindow().setTheme(a === "auto" ? null : a).catch(() => { /* no perm / non-mac */ });
  };
  useEffect(() => { applyNativeTheme(appearance); }, []);
  useEffect(() => {
    let mq: MediaQueryList;
    try { mq = window.matchMedia("(prefers-color-scheme: dark)"); } catch { return; }
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const changeAppearance = (a: Appearance) => {
    setAppearance(a);
    try { localStorage.setItem("annotatr-appearance", a); } catch { /* ignore */ }
    applyNativeTheme(a);
  };

  // Settings state
  const [lineThickness, setLineThickness] = useState(DEFAULT_SETTINGS.lineThickness.arrow);
  const [fontSize, setFontSize] = useState(DEFAULT_SETTINGS.fontSize);
  const [fadeDuration, setFadeDuration] = useState(DEFAULT_SETTINGS.fadeDuration);
  const [persistShapes, setPersistShapes] = useState(DEFAULT_SETTINGS.persistShapes);
  const [panelTransparency, setPanelTransparency] = useState(DEFAULT_SETTINGS.panelTransparency);
  const [toolbarSize, setToolbarSize] = useState<ToolbarSize>(DEFAULT_SETTINGS.toolbarSize);
  const [arrowHeadStyle, setArrowHeadStyle] = useState<ArrowHeadStyle>(DEFAULT_SETTINGS.arrowHeadStyle);
  const [shapeStyle, setShapeStyle] = useState<ShapeStyle>(DEFAULT_SETTINGS.shapeStyle);

  // Hotkey state
  const [hotkeys, setHotkeys] = useState<Record<string, string>>(DEFAULT_SETTINGS.hotkeys);
  const [editingHotkey, setEditingHotkey] = useState<string | null>(null);
  const [capturedHotkey, setCapturedHotkey] = useState<string>("");
  const [hotkeyConflicts, setHotkeyConflicts] = useState<Record<string, any>>({});

  // Color state
  const [currentColorForTool, setCurrentColorForTool] = useState<Record<string, string>>(DEFAULT_SETTINGS.colors);
  const [editingColorForTool, setEditingColorForTool] = useState<string | null>(null);
  const settingsColorInputRef = useRef<HTMLInputElement>(null);

  // App version (from tauri.conf.json) for the About tab
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch((error) => console.error("Failed to get app version:", error));
  }, []);

  /** Open the author's website in the default browser */
  const handleOpenWebsite = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await openExternal("https://dennisrongo.com");
    } catch (error) {
      console.error("Failed to open website:", error);
    }
  };

  // Load settings on mount
  useEffect(() => {
    const loadAllSettings = async () => {
      try {
        const settings = await loadSettings();

        // Load line thickness (use arrow tool thickness as default)
        const thickness = typeof settings.lineThickness === 'number'
          ? settings.lineThickness
          : settings.lineThickness.arrow;
        setLineThickness(thickness);

        setFontSize(settings.fontSize);
        setFadeDuration(settings.fadeDuration);
        setPersistShapes(settings.persistShapes);
        setPanelTransparency(settings.panelTransparency);
        setToolbarSize(settings.toolbarSize);
        setArrowHeadStyle(settings.arrowHeadStyle);
        setShapeStyle(settings.shapeStyle);
        setHotkeys(settings.hotkeys);
        setCurrentColorForTool(settings.colors);

        // Check for hotkey conflicts
        const conflictsResult = await invoke<Record<string, any>>("check_hotkey_conflicts", {
          hotkeyConfig: settings,
        });
        if (conflictsResult.has_conflicts) {
          setHotkeyConflicts(conflictsResult.conflicts);
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      }
    };
    loadAllSettings();
  }, []);

  // Keep tool colors in sync with the toolbar. The toolbar's color swatch
  // saves to the same per-tool keys, and every save emits "settings_updated"
  // from Rust — so reloading colors here mirrors a toolbar change live into
  // this window (the reverse direction already works: the toolbar listens for
  // the same event). Reloading is idempotent when this window is the source.
  useEffect(() => {
    const unlisten = listen("settings_updated", () => {
      loadSettings()
        .then((settings) => setCurrentColorForTool(settings.colors))
        .catch((error) => console.error("Failed to refresh colors:", error));
    });
    return () => {
      unlisten.then((fn) => fn()).catch(console.error);
    };
  }, []);

  /**
   * Handle line thickness change
   */
  const handleLineThicknessChange = async (value: number) => {
    setLineThickness(value);
    try {
      const thicknessObj = {
        arrow: value,
        line: value,
        circle: value,
        box: value,
        diamond: value,
        freehand: value,
        highlighter: value,
        text: value,
      };
      await saveSettings({ lineThickness: thicknessObj as any });
    } catch (error) {
      console.error("Failed to save line thickness:", error);
    }
  };

  /**
   * Handle font size change
   */
  const handleFontSizeChange = async (value: number) => {
    setFontSize(value);
    try {
      await saveSettings({ fontSize: value });
    } catch (error) {
      console.error("Failed to save font size:", error);
    }
  };

  /**
   * Handle fade duration change
   */
  const handleFadeDurationChange = async (value: number) => {
    setFadeDuration(value);
    try {
      await saveSettings({ fadeDuration: value });
    } catch (error) {
      console.error("Failed to save fade duration:", error);
    }
  };

  /**
   * Toggle whether drawings auto-fade or stay on screen until cleared.
   */
  const handlePersistShapesChange = async (persist: boolean) => {
    setPersistShapes(persist);
    try {
      await saveSettings({ persistShapes: persist });
    } catch (error) {
      console.error("Failed to save persist-shapes setting:", error);
    }
  };

  /**
   * Handle panel transparency change
   */
  const handlePanelTransparencyChange = async (value: number) => {
    setPanelTransparency(value);
    try {
      await saveSettings({ panelTransparency: value });
    } catch (error) {
      console.error("Failed to save panel transparency:", error);
    }
  };

  /**
   * Handle toolbar size change. Saving emits "settings_updated", which the
   * toolbar window listens for — it rescales and resizes itself to match.
   */
  const handleToolbarSizeChange = async (size: ToolbarSize) => {
    setToolbarSize(size);
    try {
      await saveSettings({ toolbarSize: size });
    } catch (error) {
      console.error("Failed to save toolbar size:", error);
    }
  };

  /**
   * Handle arrow head style change
   */
  const handleArrowHeadStyleChange = async (style: ArrowHeadStyle) => {
    setArrowHeadStyle(style);
    try {
      await saveSettings({ arrowHeadStyle: style });
    } catch (error) {
      console.error("Failed to save arrow head style:", error);
    }
  };

  /**
   * Handle shape style change (classic vs sketchy/Excalidraw-like)
   */
  const handleShapeStyleChange = async (style: ShapeStyle) => {
    setShapeStyle(style);
    try {
      await saveSettings({ shapeStyle: style });
    } catch (error) {
      console.error("Failed to save shape style:", error);
    }
  };

  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  const hotkeyCaptureRef = useRef<HTMLDivElement>(null);

  // autoFocus is unreliable on a div — focus the capture box explicitly so
  // keystrokes register right after clicking Edit
  useEffect(() => {
    if (editingHotkey) {
      hotkeyCaptureRef.current?.focus();
    }
  }, [editingHotkey]);

  /**
   * Start editing a hotkey
   */
  const startEditingHotkey = (hotkeyName: string) => {
    setEditingHotkey(hotkeyName);
    setCapturedHotkey("");
    setHotkeyError(null);
  };

  /**
   * Cancel hotkey editing
   */
  const cancelEditingHotkey = () => {
    setEditingHotkey(null);
    setCapturedHotkey("");
  };

  /**
   * Handle keyboard input during hotkey capture
   */
  const handleHotkeyCapture = (e: React.KeyboardEvent) => {
    if (!editingHotkey) return;

    e.preventDefault();

    const keys: string[] = [];

    // Capture modifier keys
    if (e.ctrlKey) keys.push("Ctrl");
    if (e.shiftKey) keys.push("Shift");
    if (e.altKey) keys.push("Alt");
    if (e.metaKey || e.key === "Meta") keys.push(IS_MAC ? "Cmd" : "Win");

    // Capture the main key — but only keys the backend hotkey parser
    // supports (A-Z, 0-9, F1-F12 and the named keys below). Accepting
    // anything else would save a binding that can never register.
    const SUPPORTED_NAMED_KEYS = [
      "Space", "Enter", "Tab", "Escape", "Backspace", "Delete", "Insert",
      "Home", "End", "PageUp", "PageDown",
      "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
      "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
    ];
    const mainKey = e.key === " " ? "Space" : e.key;
    if (!["Control", "Shift", "Alt", "Meta"].includes(mainKey)) {
      if (mainKey.length === 1 && /[a-zA-Z0-9]/.test(mainKey)) {
        keys.push(mainKey.toUpperCase());
      } else if (SUPPORTED_NAMED_KEYS.includes(mainKey)) {
        keys.push(mainKey);
      }
    }

    // Format as hotkey string
    if (keys.length >= 2) {
      const hotkeyString = keys.join("+");
      setCapturedHotkey(hotkeyString);
    }
  };

  /**
   * Save the edited hotkey
   */
  const saveHotkey = async () => {
    if (!editingHotkey || !capturedHotkey) return;

    const updatedHotkeys = {
      ...hotkeys,
      [editingHotkey]: capturedHotkey,
    };

    try {
      // Register FIRST: if the combo can't be registered (unparseable,
      // duplicate, taken by another app), nothing is persisted and the
      // previous bindings come back. Persisting a dead toggle binding would
      // leave the app unreachable (no Dock icon, windows start hidden).
      const settings = { ...(await loadSettings()), hotkeys: updatedHotkeys };
      await invoke("register_hotkeys", { hotkeyConfig: settings });

      setHotkeys(updatedHotkeys);
      setHotkeyError(null);
      await saveSettings({ hotkeys: updatedHotkeys as any });

      // Check for conflicts
      const conflictsResult = await invoke<Record<string, any>>("check_hotkey_conflicts", {
        hotkeyConfig: settings,
      });

      if (conflictsResult.has_conflicts) {
        setHotkeyConflicts(conflictsResult.conflicts);
      } else {
        setHotkeyConflicts({});
      }

      cancelEditingHotkey();
    } catch (error) {
      console.error("Failed to save hotkey:", error);
      setHotkeyError(String(error));
      // Restore the previous working bindings
      try {
        const previous = await loadSettings();
        await invoke("register_hotkeys", { hotkeyConfig: previous });
      } catch (restoreError) {
        console.error("Failed to restore previous hotkeys:", restoreError);
      }
      cancelEditingHotkey();
    }
  };

  /**
   * Handle tool color selection from preset
   */
  const handleSettingsColorSelect = async (tool: string, color: string) => {
    try {
      const updatedColors = {
        ...currentColorForTool,
        [tool]: color,
      };
      setCurrentColorForTool(updatedColors);

      await saveSettings({ colors: updatedColors as any });
      setEditingColorForTool(null);
    } catch (error) {
      console.error("Failed to save color:", error);
    }
  };

  /**
   * Open custom color picker for a tool
   */
  const openSettingsColorPicker = (tool: string) => {
    setEditingColorForTool(tool);
    settingsColorInputRef.current?.click();
  };

  /**
   * Handle custom color input change
   */
  const handleSettingsCustomColorChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;

    // Validate hex color format
    const hexColorRegex = /^#([0-9A-F]{3}){1,2}$/i;
    if (!hexColorRegex.test(color)) {
      console.warn("Invalid hex color format:", color);
      return;
    }

    if (editingColorForTool) {
      await handleSettingsColorSelect(editingColorForTool, color);
    }
  };

  /**
   * Reset all settings to defaults
   */
  const handleResetSettings = async () => {
    try {
      const confirmed = window.confirm(
        "Are you sure you want to reset all settings to their default values? This action cannot be undone."
      );

      if (!confirmed) return;

      await resetSettings();

      // Reload settings
      const reloadedSettings = await loadSettings();
      const thickness = typeof reloadedSettings.lineThickness === 'number'
        ? reloadedSettings.lineThickness
        : reloadedSettings.lineThickness.arrow;

      setLineThickness(thickness);
      setFontSize(reloadedSettings.fontSize);
      setFadeDuration(reloadedSettings.fadeDuration);
      setPersistShapes(reloadedSettings.persistShapes);
      setPanelTransparency(reloadedSettings.panelTransparency);
      setToolbarSize(reloadedSettings.toolbarSize);
      setArrowHeadStyle(reloadedSettings.arrowHeadStyle);
      setShapeStyle(reloadedSettings.shapeStyle);
      setHotkeys(reloadedSettings.hotkeys);
      setCurrentColorForTool(reloadedSettings.colors);
      setHotkeyConflicts({});

      // Re-register hotkeys
      await invoke("register_hotkeys", { hotkeyConfig: reloadedSettings });

      alert("Settings have been reset to defaults!");
    } catch (error) {
      console.error("Failed to reset settings:", error);
      alert("Failed to reset settings. Please try again.");
    }
  };

  /**
   * Export settings to JSON file
   */
  const handleExportSettings = async () => {
    try {
      await exportSettings();
      alert("Settings exported successfully!");
    } catch (error) {
      console.error("Failed to export settings:", error);
      alert("Failed to export settings. Please try again.");
    }
  };

  /**
   * Import settings from JSON file
   */
  const handleImportSettings = async () => {
    try {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json";

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
          const imported = await importSettings(file);

          // Update state with imported settings
          const thickness = typeof imported.lineThickness === 'number'
            ? imported.lineThickness
            : imported.lineThickness.arrow;

          setLineThickness(thickness);
          setFontSize(imported.fontSize);
          setFadeDuration(imported.fadeDuration);
          setPersistShapes(imported.persistShapes);
          setPanelTransparency(imported.panelTransparency);
          setToolbarSize(imported.toolbarSize);
          setArrowHeadStyle(imported.arrowHeadStyle);
          setShapeStyle(imported.shapeStyle);
          setHotkeys(imported.hotkeys);
          setCurrentColorForTool(imported.colors);

          // Re-register hotkeys
          await invoke("register_hotkeys", { hotkeyConfig: imported });

          alert("Settings imported successfully!");
        } catch (error) {
          console.error("Failed to import settings:", error);
          alert("Failed to import settings. Please check the file format.");
        }
      };

      input.click();
    } catch (error) {
      console.error("Failed to import settings:", error);
      alert("Failed to import settings. Please try again.");
    }
  };

  const conflictEntries = Object.entries(hotkeyConflicts).filter(([, info]: [string, any]) => info.conflict);

  return (
    <div className={`st-app${HAS_NATIVE_GLASS ? " glass mac" : ""}`} data-theme={effectiveTheme}>
      <style>{CSS}</style>

      {/* With the overlay title bar the window has no chrome to grab, so the
          top strip (and the sidebar background below) doubles as one. Rendered
          on every platform with a native backdrop (macOS + Windows); the
          drag-region attribute makes it move the frameless window. */}
      {HAS_NATIVE_GLASS && <div className="st-drag-strip" data-tauri-drag-region />}

      {/* Sidebar navigation (background drags the window, like System Settings) */}
      <aside className="st-sidebar" data-tauri-drag-region>
        <div className="st-brand" data-tauri-drag-region>
          <AppIcon size={22} />
          <span className="st-brand-name">Annotatr</span>
        </div>

        <nav className="st-nav">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`st-nav-item${activeTab === tab.id ? " active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="st-nav-tile" style={{ background: TAB_TINT[tab.id] }}>{ICONS[tab.id]}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="st-sidebar-foot">Changes save automatically</div>
      </aside>

      {/* Content pane */}
      <main className="st-content">
        <UpdateBanner />
        {/* Drawing (General) */}
        {activeTab === "general" && (
          <div className="st-page" key="general">
            <h1 className="st-page-title">Drawing</h1>

            <div className="st-group-title">Appearance</div>
            <div className="st-card">
              <div className="st-row">
                <div>
                  <div className="st-row-label">Theme</div>
                  <div className="st-row-sub">Match the system, or force a light or dark look</div>
                </div>
                <div className="st-seg">
                  <button type="button" className={appearance === "auto" ? "active" : ""} onClick={() => changeAppearance("auto")}>Auto</button>
                  <button type="button" className={appearance === "light" ? "active" : ""} onClick={() => changeAppearance("light")}>Light</button>
                  <button type="button" className={appearance === "dark" ? "active" : ""} onClick={() => changeAppearance("dark")}>Dark</button>
                </div>
              </div>

              <div className="st-row">
                <div>
                  <div className="st-row-label">Shape style</div>
                  <div className="st-row-sub">Clean strokes or a hand-drawn, Excalidraw-like look</div>
                </div>
                <div className="st-seg">
                  <button
                    type="button"
                    className={shapeStyle === ShapeStyle.CLASSIC ? "active" : ""}
                    onClick={() => handleShapeStyleChange(ShapeStyle.CLASSIC)}
                  >
                    Classic
                  </button>
                  <button
                    type="button"
                    className={shapeStyle === ShapeStyle.SKETCHY ? "active" : ""}
                    onClick={() => handleShapeStyleChange(ShapeStyle.SKETCHY)}
                  >
                    Sketchy
                  </button>
                </div>
              </div>
            </div>

            <div className="st-group-title">Strokes &amp; text</div>
            <div className="st-card">
              <div className="st-row">
                <div>
                  <div className="st-row-label">Line thickness</div>
                  <div className="st-row-sub">Stroke width for all tools</div>
                </div>
                <div className="st-slider-wrap">
                  <span
                    className="st-dot-preview"
                    style={{
                      width: Math.min(lineThickness, 26),
                      height: Math.min(lineThickness, 26),
                      backgroundColor: currentColorForTool.arrow || "#FF3B30",
                    }}
                  />
                  <Slider min={1} max={50} step={1} value={lineThickness} onChange={handleLineThicknessChange} />
                  <span className="st-value">{lineThickness}px</span>
                </div>
              </div>

              <div className="st-row">
                <div>
                  <div className="st-row-label">Font size</div>
                  <div className="st-row-sub">Text tool annotations</div>
                </div>
                <div className="st-slider-wrap">
                  <Slider min={8} max={72} step={1} value={fontSize} onChange={handleFontSizeChange} />
                  <span className="st-value">{fontSize}pt</span>
                </div>
              </div>
            </div>

            <div className="st-group-title">On-screen behavior</div>
            <div className="st-card">
              <div className="st-row">
                <div>
                  <div className="st-row-label">Drawings</div>
                  <div className="st-row-sub">Fade out automatically, or stay until you clear them</div>
                </div>
                <div className="st-seg">
                  <button
                    type="button"
                    className={!persistShapes ? "active" : ""}
                    onClick={() => handlePersistShapesChange(false)}
                  >
                    Auto-fade
                  </button>
                  <button
                    type="button"
                    className={persistShapes ? "active" : ""}
                    onClick={() => handlePersistShapesChange(true)}
                  >
                    Keep on screen
                  </button>
                </div>
              </div>

              <div className="st-row">
                <div>
                  <div className="st-row-label">Fade duration</div>
                  <div className="st-row-sub">
                    {persistShapes ? "Disabled while drawings are kept on screen" : "How long shapes stay on screen"}
                  </div>
                </div>
                <div className="st-slider-wrap">
                  <Slider min={1} max={60} step={1} value={fadeDuration} onChange={handleFadeDurationChange} disabled={persistShapes} />
                  <span className="st-value">{fadeDuration}s</span>
                </div>
              </div>

              <div className="st-row">
                <div>
                  <div className="st-row-label">Toolbar size</div>
                  <div className="st-row-sub">Scale of the floating tool strip</div>
                </div>
                <div className="st-seg">
                  <button
                    type="button"
                    className={toolbarSize === "small" ? "active" : ""}
                    onClick={() => handleToolbarSizeChange("small")}
                  >
                    Small
                  </button>
                  <button
                    type="button"
                    className={toolbarSize === "medium" ? "active" : ""}
                    onClick={() => handleToolbarSizeChange("medium")}
                  >
                    Medium
                  </button>
                  <button
                    type="button"
                    className={toolbarSize === "large" ? "active" : ""}
                    onClick={() => handleToolbarSizeChange("large")}
                  >
                    Large
                  </button>
                </div>
              </div>

              <div className="st-row">
                <div>
                  <div className="st-row-label">Toolbar opacity</div>
                  <div className="st-row-sub">The whole floating strip — background and icons</div>
                </div>
                <div className="st-slider-wrap">
                  <span className="st-strip-preview" title="Toolbar preview">
                    <span
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 3,
                        // Mirrors the toolbar: opacity fades the whole strip —
                        // background and icons (dots here) — together
                        opacity: panelTransparency,
                        backgroundColor: "rgba(28, 28, 30, 0.94)",
                      }}
                    >
                      <span className="st-strip-preview-dot" />
                      <span className="st-strip-preview-dot" />
                      <span className="st-strip-preview-dot" />
                    </span>
                  </span>
                  <Slider
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(panelTransparency * 100)}
                    onChange={(v) => handlePanelTransparencyChange(v / 100)}
                  />
                  <span className="st-value">{Math.round(panelTransparency * 100)}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Shortcuts */}
        {activeTab === "shortcuts" && (
          <div className="st-page" key="shortcuts">
            <h1 className="st-page-title">Shortcuts</h1>

            {hotkeyError && (
              <div className="st-callout error">
                <strong>Hotkey not saved.</strong> {hotkeyError} Your previous binding is still active.
              </div>
            )}

            {conflictEntries.length > 0 && (
              <div className="st-callout warn">
                <strong>Possible system conflicts:</strong>{" "}
                {conflictEntries.map(([name, info]: [string, any], i) => (
                  <span key={name}>
                    {i > 0 && ", "}
                    {HOTKEY_LABELS[name] ?? name} ({info.hotkey}) is used for “{info.system_function}”
                  </span>
                ))}
              </div>
            )}

            <div className="st-card">
              {Object.entries(hotkeys).map(([hotkeyName, hotkeyValue]: [string, string]) => (
                <div key={hotkeyName} className="st-row">
                  <div className="st-row-label">{HOTKEY_LABELS[hotkeyName] ?? hotkeyName}</div>

                  {editingHotkey === hotkeyName ? (
                    <div
                      ref={hotkeyCaptureRef}
                      className="st-capture-wrap"
                      tabIndex={0}
                      onKeyDown={handleHotkeyCapture}
                    >
                      {capturedHotkey ? (
                        <span className="st-capture captured"><Keycaps combo={capturedHotkey} /></span>
                      ) : (
                        <span className="st-capture">Press keys…</span>
                      )}
                      <button
                        type="button"
                        className="st-btn st-btn-icon confirm"
                        onClick={saveHotkey}
                        disabled={!capturedHotkey}
                        title="Save"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        className="st-btn st-btn-icon"
                        onClick={cancelEditingHotkey}
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="st-hotkey-display">
                      <Keycaps combo={hotkeyValue} />
                      <button
                        type="button"
                        className="st-btn"
                        onClick={() => startEditingHotkey(hotkeyName)}
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <p className="st-hint">Click Edit, then press the new key combination.</p>
          </div>
        )}

        {/* Colors */}
        {activeTab === "colors" && (
          <div className="st-page" key="colors">
            <h1 className="st-page-title">Tool Colors</h1>

            <div className="st-card">
              {Object.entries(currentColorForTool).map(([tool, color]: [string, string]) => (
                <div key={tool} className="st-row">
                  <div className="st-color-name">
                    <span className="st-tip" style={{ backgroundColor: color }} />
                    <span style={{ textTransform: "capitalize" }}>{tool}</span>
                  </div>

                  <div className="st-swatches">
                    {PRESET_COLORS.slice(0, 7).map((presetColor) => (
                      <button
                        key={presetColor}
                        type="button"
                        className={`st-swatch${color.toUpperCase() === presetColor.toUpperCase() ? " selected" : ""}`}
                        style={{ backgroundColor: presetColor }}
                        onClick={() => handleSettingsColorSelect(tool, presetColor)}
                        title={presetColor}
                      />
                    ))}
                    <button
                      type="button"
                      className="st-swatch st-swatch-custom"
                      onClick={() => openSettingsColorPicker(tool)}
                      title="Custom color"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Advanced */}
        {activeTab === "advanced" && (
          <div className="st-page" key="advanced">
            <h1 className="st-page-title">Advanced</h1>

            <div className="st-card">
              <div className="st-row">
                <div>
                  <div className="st-row-label">Arrow head</div>
                  <div className="st-row-sub">Style of the arrow tool tip</div>
                </div>
                <div className="st-seg">
                  {Object.values(ArrowHeadStyle).map((style) => (
                    <button
                      key={style}
                      type="button"
                      className={arrowHeadStyle === style ? "active" : ""}
                      onClick={() => handleArrowHeadStyleChange(style)}
                    >
                      {style === ArrowHeadStyle.FILLED && "Filled"}
                      {style === ArrowHeadStyle.OPEN && "Open"}
                      {style === ArrowHeadStyle.DOUBLE_HEADED && "Double"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="st-row">
                <div>
                  <div className="st-row-label">Settings file</div>
                  <div className="st-row-sub">Back up or move your configuration</div>
                </div>
                <div className="st-btn-group">
                  <button type="button" className="st-btn" onClick={handleExportSettings}>Export…</button>
                  <button type="button" className="st-btn" onClick={handleImportSettings}>Import…</button>
                </div>
              </div>

              <div className="st-row">
                <div>
                  <div className="st-row-label">Reset</div>
                  <div className="st-row-sub">Restore every setting to its default</div>
                </div>
                <button type="button" className="st-btn st-btn-danger" onClick={handleResetSettings}>
                  Reset to Defaults
                </button>
              </div>
            </div>
          </div>
        )}

        {/* About */}
        {activeTab === "about" && (
          <div className="st-page" key="about">
            <h1 className="st-page-title">About</h1>

            <div className="st-card">
              <div className="st-about-hero">
                <AppIcon size={56} />
                <div>
                  <div className="st-about-name">Annotatr</div>
                  <div className="st-about-tagline">Screen annotation for recordings</div>
                </div>
              </div>

              <div className="st-row">
                <div className="st-row-label">Version</div>
                <span className="st-value">{appVersion || "—"}</span>
              </div>

              <UpdateCheckRow />

              <div className="st-row">
                <div>
                  <div className="st-row-label">Created by</div>
                  <div className="st-row-sub">Dennis Rongo</div>
                </div>
                <a className="st-link" href="https://dennisrongo.com" onClick={handleOpenWebsite}>
                  dennisrongo.com
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4.5 2.5h5v5M9.5 2.5L2.5 9.5" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Hidden color input */}
      <input
        ref={settingsColorInputRef}
        type="color"
        onChange={handleSettingsCustomColorChange}
        className="st-hidden-input"
        value={currentColorForTool[editingColorForTool || "arrow"] || "#FF3B30"}
      />
    </div>
  );
}

const CSS = `
:root { --mono: ui-monospace, "SF Mono", Menlo, monospace; }

/* Light is the System Settings default; dark mirrors macOS dark mode. The
   data-theme attribute is set from the Appearance control (Auto/Light/Dark). */
.st-app[data-theme="light"] {
  --bg-sidebar: #e9e9ec;
  --sidebar-tint: rgba(244, 244, 247, 0.62);
  --bg-content: #f5f5f7;
  --card: #ffffff;
  --hairline: rgba(0, 0, 0, 0.10);
  --hairline-faint: rgba(60, 60, 67, 0.13);
  --text: #1d1d1f;
  --text-dim: rgba(60, 60, 67, 0.6);
  --text-faint: rgba(60, 60, 67, 0.42);
  --accent: #007aff;
  --blue: #007aff;
  --danger: #ff3b30;
  --hover: rgba(0, 0, 0, 0.05);
  --track: rgba(120, 120, 128, 0.22);
  --value-bg: rgba(0, 0, 0, 0.05);
  --seg-bg: rgba(118, 118, 128, 0.12);
  --seg-thumb: #ffffff;
  --btn-bg: #ffffff;
  --btn-border: rgba(0, 0, 0, 0.13);
  --btn-hover: #f0f0f2;
  --key-bg: #ffffff;
  --key-border: rgba(0, 0, 0, 0.14);
  --key-shadow: rgba(0, 0, 0, 0.14);
  --scroll: rgba(0, 0, 0, 0.2);
}

.st-app[data-theme="dark"] {
  --bg-sidebar: #1c1c1e;
  --sidebar-tint: rgba(30, 30, 32, 0.55);
  --bg-content: #1e1e1e;
  --card: #2c2c2e;
  --hairline: rgba(255, 255, 255, 0.1);
  --hairline-faint: rgba(255, 255, 255, 0.07);
  --text: #f5f5f7;
  --text-dim: rgba(235, 235, 245, 0.6);
  --text-faint: rgba(235, 235, 245, 0.32);
  --accent: #0a84ff;
  --blue: #0a84ff;
  --danger: #ff453a;
  --hover: rgba(255, 255, 255, 0.06);
  --track: rgba(120, 120, 128, 0.34);
  --value-bg: rgba(255, 255, 255, 0.08);
  --seg-bg: rgba(120, 120, 128, 0.24);
  --seg-thumb: #636366;
  --btn-bg: #3a3a3c;
  --btn-border: rgba(255, 255, 255, 0.12);
  --btn-hover: #48484a;
  --key-bg: #2c2c2e;
  --key-border: rgba(255, 255, 255, 0.14);
  --key-shadow: rgba(0, 0, 0, 0.5);
  --scroll: rgba(255, 255, 255, 0.16);
}

html, body, #root {
  height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
  min-width: 0;
  min-height: 0;
  display: block;
  background: transparent;
  overflow: hidden;
}

*, *::before, *::after { box-sizing: border-box; }

.st-app {
  display: flex;
  height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
  font-size: 13px;
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  user-select: none;
  cursor: default;
}

.st-app:not(.mac) { background: var(--bg-content); }

/* Invisible grab strip across the top (overlay title bar has no chrome) */
.st-drag-strip {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 38px;
  z-index: 40;
}

/* ---- Sidebar ---- */
.st-sidebar {
  width: 168px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--hairline);
  padding: 14px 10px 12px;
}

/* macOS: translucent over the window's NSVisualEffectView, and pushed
   down to clear the inset traffic lights */
.mac .st-sidebar {
  background: var(--sidebar-tint);
  padding-top: 46px;
}

.st-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 8px 14px;
}

.st-brand-dot {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  background: linear-gradient(160deg, #0a84ff, #0060df);
  box-shadow: 0 1px 3px rgba(10, 132, 255, 0.5), inset 0 0.5px 0 rgba(255, 255, 255, 0.4);
}

.st-brand-name {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.st-nav { display: flex; flex-direction: column; gap: 2px; }

.st-nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-dim);
  font: inherit;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.st-nav-item svg { flex: none; opacity: 1; }
.st-nav-item:hover { background: var(--hover); color: var(--text); }
.st-nav-item.active { background: var(--accent); color: #fff; }
.st-nav-item.active svg { opacity: 1; }

/* System Settings-style colored glyph tile */
.st-nav-tile {
  width: 22px;
  height: 22px;
  flex: none;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.st-nav-tile svg { width: 14px; height: 14px; opacity: 1; }
.st-nav-item.active .st-nav-tile { background: rgba(255, 255, 255, 0.25) !important; }

/* Grouped section headers */
.st-group-title {
  margin: 18px 4px 7px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.st-page > .st-group-title:first-of-type { margin-top: 0; }

.st-sidebar-foot {
  margin-top: auto;
  padding: 8px 10px 0;
  font-size: 11px;
  color: var(--text-faint);
}

/* ---- Content ---- */
.st-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 22px 26px;
  background: var(--bg-content);
}

/* Native-feeling keyboard focus ring */
.st-app button:focus-visible,
.st-capture-wrap:focus-visible {
  outline: 2px solid rgba(10, 132, 255, 0.65);
  outline-offset: 1px;
}

.st-content::-webkit-scrollbar { width: 8px; }
.st-content::-webkit-scrollbar-thumb { background: var(--scroll); border-radius: 4px; }
.st-content::-webkit-scrollbar-track { background: transparent; }

.st-page { animation: st-in 0.18s ease-out; }

@keyframes st-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.st-page-title {
  margin: 2px 0 14px;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.2px;
  color: var(--text);
}

/* ---- Cards & rows ---- */
.st-card {
  background: var(--card);
  border: 1px solid var(--hairline);
  border-radius: 10px;
  overflow: hidden;
}

.st-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  min-height: 52px;
}

.st-row + .st-row { border-top: 1px solid var(--hairline-faint); }

.st-row-label { font-weight: 500; }
.st-row-sub { margin-top: 2px; font-size: 11px; color: var(--text-dim); }

.st-hint { margin: 12px 2px 0; font-size: 11px; color: var(--text-faint); }

/* ---- Sliders ---- */
.st-slider-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  max-width: 280px;
  justify-content: flex-end;
}

.st-slider {
  -webkit-appearance: none;
  appearance: none;
  flex: 1;
  min-width: 110px;
  height: 4px;
  padding: 0;
  border: none;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.st-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  border: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5), 0 0 0 0.5px rgba(0, 0, 0, 0.15);
  transition: transform 0.1s;
}

.st-slider::-webkit-slider-thumb:active { transform: scale(1.12); }

.st-value {
  font-family: var(--mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  background: var(--value-bg);
  border-radius: 5px;
  padding: 3px 6px;
  min-width: 42px;
  text-align: center;
  color: var(--text);
  flex: none;
}

.st-dot-preview {
  flex: none;
  border-radius: 50%;
  transition: width 0.1s, height 0.1s;
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.4);
}

/* Toolbar-opacity preview: colorful "screen content" behind the strip color */
.st-strip-preview {
  position: relative;
  flex: none;
  width: 38px;
  height: 22px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: linear-gradient(135deg, #ff453a 0%, #ffd60a 35%, #34c759 65%, #0a84ff 100%);
}

.st-strip-preview-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
}

/* ---- Keycaps & hotkeys ---- */
.st-keys { display: inline-flex; gap: 4px; }

.st-key {
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1;
  padding: 4px 6px;
  min-width: 22px;
  text-align: center;
  color: var(--text);
  background: var(--key-bg);
  border: 1px solid var(--key-border);
  border-radius: 5px;
  box-shadow: 0 1px 0 var(--key-shadow);
}

.st-hotkey-display, .st-capture-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.st-capture-wrap { outline: none; }

.st-capture {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-dim);
  padding: 5px 10px;
  border: 1px dashed color-mix(in srgb, var(--accent) 55%, transparent);
  border-radius: 6px;
  min-width: 96px;
  text-align: center;
  animation: st-pulse 1.2s ease-in-out infinite;
}

.st-capture.captured {
  border-style: solid;
  border-color: rgba(48, 209, 88, 0.6);
  animation: none;
}

@keyframes st-pulse {
  50% { border-color: color-mix(in srgb, var(--accent) 20%, transparent); }
}

/* ---- Buttons ---- */
.st-btn {
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
  background: var(--btn-bg);
  border: 1px solid var(--btn-border);
  border-radius: 6px;
  padding: 5px 11px;
  cursor: pointer;
  transition: background 0.12s;
  box-shadow: 0 0.5px 1px rgba(0, 0, 0, 0.05);
}

.st-btn:hover { background: var(--btn-hover); }
.st-btn:active { filter: brightness(0.96); }
.st-btn:disabled { opacity: 0.4; cursor: default; }

.st-btn-icon {
  width: 26px;
  height: 26px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.st-btn-icon.confirm:not(:disabled) {
  background: rgba(48, 209, 88, 0.18);
  border-color: rgba(48, 209, 88, 0.4);
  color: #30d158;
}

.st-btn-danger {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 40%, transparent);
  background: color-mix(in srgb, var(--danger) 9%, var(--btn-bg));
}

.st-btn-danger:hover { background: color-mix(in srgb, var(--danger) 16%, var(--btn-bg)); }

.st-btn-group { display: flex; gap: 8px; }

/* ---- Updater ---- */
.st-update-banner { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 14px; padding: 9px 13px; border-radius: 9px; background: color-mix(in srgb, var(--accent) 12%, var(--card)); border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent); color: var(--text); font-size: 12px; font-weight: 500; animation: st-in 0.2s ease; }
.st-update-banner.err { background: color-mix(in srgb, var(--danger) 12%, var(--card)); border-color: color-mix(in srgb, var(--danger) 45%, transparent); }
.st-update-btn { appearance: none; border: none; background: var(--accent); color: #fff; font-family: inherit; font-size: 12px; font-weight: 600; padding: 6px 13px; border-radius: 7px; cursor: pointer; flex: none; transition: filter 0.15s; }
.st-update-btn:hover:not(:disabled) { filter: brightness(1.07); }
.st-update-btn:disabled { opacity: 0.55; cursor: progress; }

/* ---- Callouts ---- */
.st-callout {
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.45;
  margin-bottom: 14px;
}

.st-callout.warn {
  background: rgba(255, 214, 10, 0.07);
  border: 1px solid rgba(255, 214, 10, 0.25);
  color: #f2d35e;
}

.st-callout.error {
  background: rgba(255, 69, 58, 0.08);
  border: 1px solid rgba(255, 69, 58, 0.3);
  color: #ff9489;
}

/* ---- Colors tab ---- */
.st-color-name {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
}

.st-tip {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background-image: linear-gradient(145deg, rgba(255, 255, 255, 0.25), rgba(0, 0, 0, 0.15));
  background-blend-mode: overlay;
}

.st-swatches { display: flex; gap: 6px; align-items: center; }

.st-swatch {
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.18);
  cursor: pointer;
  transition: transform 0.1s;
}

.st-swatch:hover { transform: scale(1.15); }

.st-swatch.selected {
  box-shadow: 0 0 0 2px var(--bg-content), 0 0 0 4px rgba(255, 255, 255, 0.85);
}

.st-swatch-custom {
  background: conic-gradient(#ff453a, #ffd60a, #34c759, #0a84ff, #bf5af2, #ff453a);
}

/* ---- Segmented control ---- */
.st-seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--seg-bg);
  border: none;
  border-radius: 8px;
}

.st-seg button {
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
  background: transparent;
  border: none;
  border-radius: 6px;
  padding: 4px 12px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.st-seg button:hover:not(.active) { background: color-mix(in srgb, var(--text) 8%, transparent); }

.st-seg button.active {
  background: var(--seg-thumb);
  color: var(--text);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18), 0 0 0 0.5px rgba(0, 0, 0, 0.04);
}

.st-hidden-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

/* ---- About tab ---- */
.st-about-hero {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 14px;
  border-bottom: 1px solid var(--hairline-faint);
}

.st-about-mark {
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 9px;
  background: linear-gradient(160deg, #0a84ff, #0060df);
  box-shadow: 0 2px 8px rgba(10, 132, 255, 0.45), inset 0 0.5px 0 rgba(255, 255, 255, 0.4);
}

.st-about-name {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.2px;
}

.st-about-tagline {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-dim);
}

.st-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 500;
  color: var(--accent);
  text-decoration: none;
  cursor: pointer;
}

.st-link:hover { text-decoration: underline; }
.st-link svg { opacity: 0.7; }
`;

export default App;
