/**
 * Monitor utility functions for Annotatr
 * Provides multi-monitor detection and positioning functionality
 */

import { invoke } from '@tauri-apps/api/core';

export interface MonitorInfo {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale_factor: number;
}

export interface CursorMonitorInfo {
  cursor_x: number;
  cursor_y: number;
  monitor_id: string | null;
  monitor: MonitorInfo | null;
}

/**
 * Get information about all available monitors
 * Feature #8: Multi-monitor detection
 * @returns Array of monitor information
 */
export async function getMonitorInfo(): Promise<MonitorInfo[]> {
  try {
    const monitors = await invoke<MonitorInfo[]>('get_monitor_info');
    console.log('[Monitor] Detected monitors:', monitors);
    return monitors;
  } catch (error) {
    console.error('[Monitor] Failed to get monitor info:', error);
    throw error;
  }
}

/**
 * Get cursor position and determine which monitor it's on
 * Feature #8: Track cursor position across monitors
 * @returns Cursor position and monitor information
 */
export async function getCursorMonitor(): Promise<CursorMonitorInfo> {
  try {
    const info = await invoke<CursorMonitorInfo>('get_cursor_monitor');
    console.log('[Monitor] Cursor at', info.cursor_x, info.cursor_y, 'on monitor:', info.monitor_id);
    return info;
  } catch (error) {
    console.error('[Monitor] Failed to get cursor monitor:', error);
    throw error;
  }
}

/**
 * Position the overlay on a specific monitor
 * Feature #8: Position overlay on active monitor
 * @param monitorId - The monitor ID to position on
 * @param x - X position
 * @param y - Y position
 */
export async function setOverlayPosition(
  monitorId: string,
  x: number,
  y: number
): Promise<void> {
  try {
    await invoke('set_overlay_position', { monitorId, x, y });
    console.log(`[Monitor] Overlay positioned on ${monitorId} at (${x}, ${y})`);
  } catch (error) {
    console.error('[Monitor] Failed to set overlay position:', error);
    throw error;
  }
}

/**
 * Show overlay on the monitor where the cursor is currently located
 * Feature #8: Automatically position overlay on cursor's monitor
 */
export async function showOverlayOnCursorMonitor(): Promise<void> {
  try {
    // Get cursor position and monitor
    const cursorInfo = await getCursorMonitor();

    if (cursorInfo.monitor_id && cursorInfo.monitor) {
      // Position overlay on the correct monitor
      await setOverlayPosition(
        cursorInfo.monitor_id,
        cursorInfo.monitor.x,
        cursorInfo.monitor.y
      );

      // Show the overlay (which will use the position we just set)
      await invoke('show_overlay');

      console.log(
        `[Monitor] Overlay shown on monitor ${cursorInfo.monitor_id} ` +
        `at (${cursorInfo.monitor.x}, ${cursorInfo.monitor.y})`
      );
    } else {
      // Fallback: just show overlay
      await invoke('show_overlay');
      console.log('[Monitor] Overlay shown (fallback - could not detect monitor)');
    }
  } catch (error) {
    console.error('[Monitor] Failed to show overlay on cursor monitor:', error);
    throw error;
  }
}
