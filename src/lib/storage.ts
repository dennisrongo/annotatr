/**
 * Storage utility functions for Annotatr
 * Provides a convenient interface to Tauri's persistent storage API
 */

import { invoke } from '@tauri-apps/api/core';

export interface Settings {
  hotkeys: {
    toggleDrawingMode: string;
    arrowTool: string;
    circleTool: string;
    boxTool: string;
    freehandTool: string;
    highlighterTool: string;
    textTool: string;
  };
  colors: {
    arrow: string;
    circle: string;
    box: string;
    freehand: string;
    highlighter: string;
    text: string;
  };
  // Feature #106: Per-tool line thickness settings
  lineThickness: {
    arrow: number;
    circle: number;
    box: number;
    freehand: number;
    highlighter: number;
    text: number; // Not used for text but included for consistency
  };
  fontSize: number;
  fadeDuration: number;
  // Feature #126: Panel transparency (0.0 = fully transparent, 1.0 = fully opaque)
  panelTransparency: number;
}

export const DEFAULT_SETTINGS: Settings = {
  hotkeys: {
    toggleDrawingMode: 'Ctrl+Shift+D',
    arrowTool: 'Ctrl+Shift+A',
    circleTool: 'Ctrl+Shift+C',
    boxTool: 'Ctrl+Shift+B',
    freehandTool: 'Ctrl+Shift+F',
    highlighterTool: 'Ctrl+Shift+H',
    textTool: 'Ctrl+Shift+T',
  },
  colors: {
    arrow: '#FF0000',
    circle: '#FF0000',
    box: '#FF0000',
    freehand: '#FF0000',
    highlighter: '#FFFF00',
    text: '#FF0000',
  },
  // Feature #106: Per-tool line thickness defaults
  lineThickness: {
    arrow: 12,
    circle: 12,
    box: 12,
    freehand: 12,
    highlighter: 12,
    text: 12, // Not used for text but included for consistency
  },
  fontSize: 14,
  fadeDuration: 10,
  // Feature #126: Panel transparency default (0.95 = mostly opaque)
  panelTransparency: 0.95,
};

/**
 * Save a single setting to persistent storage
 * @param key - The setting key (supports dot notation like "hotkeys.arrowTool")
 * @param value - The value to save (will be JSON serialized)
 */
export async function saveSetting(key: string, value: unknown): Promise<void> {
  try {
    await invoke('save_settings', { key, value });
    console.log(`[Storage] Saved: ${key} =`, value);
  } catch (error) {
    console.error(`[Storage] Failed to save ${key}:`, error);
    throw error;
  }
}

/**
 * Save multiple settings at once
 * @param settings - Partial settings object to save
 */
export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  try {
    const settingsObj = settings as Record<string, unknown>;
    for (const [key, value] of Object.entries(settingsObj)) {
      await invoke('save_settings', { key, value });
    }
    console.log('[Storage] Saved settings:', settings);
  } catch (error) {
    console.error('[Storage] Failed to save settings:', error);
    throw error;
  }
}

/**
 * Load all settings from persistent storage
 * @returns Complete settings object with defaults applied for missing values
 */
export async function loadSettings(): Promise<Settings> {
  try {
    const stored = await invoke<Record<string, unknown>>('load_settings');
    console.log('[Storage] Loaded settings:', stored);

    // Merge with defaults to ensure all keys exist
    return {
      ...DEFAULT_SETTINGS,
      ...(stored as unknown as Settings),
    };
  } catch (error) {
    console.error('[Storage] Failed to load settings:', error);
    // Return defaults if storage is not accessible
    return DEFAULT_SETTINGS;
  }
}

/**
 * Load a single setting by key
 * @param key - The setting key to load
 * @param defaultValue - Default value if key doesn't exist
 * @returns The setting value or defaultValue
 */
export async function loadSetting<T>(
  key: string,
  defaultValue?: T
): Promise<T | null> {
  try {
    const value = await invoke<T>('load_setting', { key });
    console.log(`[Storage] Loaded: ${key} =`, value);

    // Return null if stored value is null and no default provided
    if (value === null && defaultValue === undefined) {
      return null;
    }

    // Return value or default
    return value ?? defaultValue ?? null;
  } catch (error) {
    console.error(`[Storage] Failed to load ${key}:`, error);
    return defaultValue ?? null;
  }
}

/**
 * Reset all settings to default values
 */
export async function resetSettings(): Promise<void> {
  try {
    await invoke('reset_settings');
    console.log('[Storage] Settings reset to defaults');
  } catch (error) {
    console.error('[Storage] Failed to reset settings:', error);
    throw error;
  }
}

/**
 * Test storage connectivity by writing and reading a test value
 * @returns true if storage is working, false otherwise
 */
export async function testStorageConnection(): Promise<boolean> {
  const TEST_KEY = 'storage_test_key';
  const TEST_VALUE = `test_${Date.now()}`;

  try {
    // Write test value
    await saveSetting(TEST_KEY, TEST_VALUE);

    // Read test value
    const readValue = await loadSetting<string>(TEST_KEY);

    // Verify
    const success = readValue === TEST_VALUE;
    console.log(`[Storage] Connectivity test: ${success ? 'PASSED' : 'FAILED'}`);

    // Cleanup test value
    await saveSetting(TEST_KEY, null);

    return success;
  } catch (error) {
    console.error('[Storage] Connectivity test FAILED:', error);
    return false;
  }
}

/**
 * Initialize storage with default values on first run
 * This ensures all required keys exist with valid defaults
 */
export async function initializeStorage(): Promise<void> {
  try {
    // Try to load existing settings
    const existing = await loadSettings();

    // Check if any keys are missing (first run scenario)
    const hasAllKeys = Object.keys(DEFAULT_SETTINGS).every(
      (key) => key in existing
    );

    if (!hasAllKeys) {
      console.log('[Storage] First run detected, initializing defaults');
      await saveSettings(DEFAULT_SETTINGS);
    }

    console.log('[Storage] Initialized successfully');
  } catch (error) {
    console.error('[Storage] Failed to initialize:', error);
    throw error;
  }
}

/**
 * Export settings to a JSON file
 * Creates a downloadable JSON file with current settings
 * Feature #121: Settings export functionality
 */
export async function exportSettings(): Promise<void> {
  try {
    // Load current settings
    const settings = await loadSettings();

    // Create JSON string with pretty formatting
    const json = JSON.stringify(settings, null, 2);

    // Create a blob with the JSON data
    const blob = new Blob([json], { type: 'application/json' });

    // Create a temporary URL for the blob
    const url = URL.createObjectURL(blob);

    // Create a temporary anchor element to trigger download
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `annotatr-settings-${new Date().toISOString().split('T')[0]}.json`;

    // Trigger download
    document.body.appendChild(anchor);
    anchor.click();

    // Cleanup
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    console.log('[Storage] Settings exported successfully');
  } catch (error) {
    console.error('[Storage] Failed to export settings:', error);
    throw error;
  }
}

/**
 * Import settings from a JSON file
 * Reads a JSON file and applies the settings
 * Feature #121: Settings import functionality
 */
export async function importSettings(file: File): Promise<Settings> {
  try {
    // Read file as text
    const text = await file.text();

    // Parse JSON
    const imported = JSON.parse(text);

    // Validate imported settings structure
    const validated = validateImportedSettings(imported);

    // Save all imported settings to storage
    await saveSettings(validated);

    console.log('[Storage] Settings imported successfully:', validated);

    return validated;
  } catch (error) {
    console.error('[Storage] Failed to import settings:', error);
    throw new Error(`Failed to import settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate imported settings structure
 * Ensures all required keys exist and values are valid
 * Feature #121: Settings validation for import
 */
function validateImportedSettings(imported: unknown): Settings {
  // Must be an object
  if (!imported || typeof imported !== 'object' || Array.isArray(imported)) {
    throw new Error('Invalid settings format: expected an object');
  }

  const settings = imported as Record<string, unknown>;

  // Validate hotkeys
  if (!settings.hotkeys || typeof settings.hotkeys !== 'object') {
    throw new Error('Invalid settings: missing or invalid hotkeys');
  }

  // Validate colors
  if (!settings.colors || typeof settings.colors !== 'object') {
    throw new Error('Invalid settings: missing or invalid colors');
  }

  // Feature #106: Validate line thickness (per-tool object)
  if (!settings.lineThickness || typeof settings.lineThickness !== 'object') {
    throw new Error('Invalid settings: missing or invalid lineThickness');
  }
  const thickness = settings.lineThickness as Record<string, unknown>;
  // Validate each tool's line thickness
  for (const tool of ['arrow', 'circle', 'box', 'freehand', 'highlighter', 'text']) {
    if (typeof thickness[tool] !== 'number' ||
        (thickness[tool] as number) < 1 || (thickness[tool] as number) > 50) {
      throw new Error(`Invalid settings: lineThickness.${tool} must be between 1 and 50`);
    }
  }

  // Validate font size
  if (typeof settings.fontSize !== 'number' ||
      settings.fontSize < 8 || settings.fontSize > 72) {
    throw new Error('Invalid settings: fontSize must be between 8 and 72');
  }

  // Validate fade duration
  if (typeof settings.fadeDuration !== 'number' ||
      settings.fadeDuration < 1 || settings.fadeDuration > 60) {
    throw new Error('Invalid settings: fadeDuration must be between 1 and 60');
  }

  // Feature #126: Validate panel transparency (0.0 to 1.0)
  if (settings.panelTransparency !== undefined) {
    if (typeof settings.panelTransparency !== 'number' ||
        settings.panelTransparency < 0.0 || settings.panelTransparency > 1.0) {
      throw new Error('Invalid settings: panelTransparency must be between 0.0 and 1.0');
    }
  }

  // Merge with defaults to ensure all keys exist
  return {
    ...DEFAULT_SETTINGS,
    ...(settings as unknown as Settings),
  };
}
