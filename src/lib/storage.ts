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
  lineThickness: number;
  fontSize: number;
  fadeDuration: number;
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
  lineThickness: 12,
  fontSize: 14,
  fadeDuration: 10,
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
      ...(stored as Settings),
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
