/**
 * Centralized Drawing State Management
 * Feature #118: Manage state for tracking drawing mode and active tool
 */

import { ToolType } from "../types/shapes";
import { invoke } from "@tauri-apps/api/core";

/**
 * Drawing state interface
 * Tracks all aspects of the drawing system
 */
export interface DrawingState {
  // Whether drawing mode is active (cursor capture enabled)
  isDrawingModeActive: boolean;

  // Currently selected tool (null if none selected)
  currentTool: ToolType | null;

  // Whether the user is currently in the middle of drawing a shape
  isDrawingShape: boolean;

  // Starting position of current shape (if drawing)
  startPosition: { x: number; y: number } | null;

  // Current position during drawing (if drawing)
  currentPosition: { x: number; y: number } | null;

  // Freehand/highligter points accumulated during drawing
  freehandPoints: Array<{ x: number; y: number }>;

  // Text input state
  textInput: {
    isVisible: boolean;
    position: { x: number; y: number } | null;
    value: string;
  };

  // Current drawing settings
  settings: {
    color: string;
    lineThickness: number;
    fontSize: number;
    fadeDuration: number;
  };
}

/**
 * Default drawing state
 */
const defaultState: DrawingState = {
  isDrawingModeActive: false,
  currentTool: null,
  isDrawingShape: false,
  startPosition: null,
  currentPosition: null,
  freehandPoints: [],
  textInput: {
    isVisible: false,
    position: null,
    value: "",
  },
  settings: {
    color: "#FF0000",
    lineThickness: 12,
    fontSize: 14,
    fadeDuration: 10,
  },
};

/**
 * Central drawing state store
 * Uses singleton pattern to ensure single source of truth
 */
class DrawingStateStore {
  private state: DrawingState;
  private listeners: Set<(state: DrawingState) => void>;

  constructor() {
    this.state = { ...defaultState };
    this.listeners = new Set();
  }

  /**
   * Get current state (immutable copy)
   */
  getState(): DrawingState {
    return { ...this.state };
  }

  /**
   * Update state and notify listeners
   */
  private setState(updates: Partial<DrawingState>): void {
    this.state = {
      ...this.state,
      ...updates,
    };
    this.notifyListeners();
  }

  /**
   * Subscribe to state changes
   * Returns unsubscribe function
   */
  subscribe(listener: (state: DrawingState) => void): () => void {
    this.listeners.add(listener);
    // Immediately call with current state
    listener(this.getState());

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    const currentState = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(currentState);
      } catch (error) {
        console.error("Error in state listener:", error);
      }
    });
  }

  /**
   * Activate drawing mode
   * Enables cursor capture and drawing on overlay
   */
  async activateDrawingMode(): Promise<void> {
    await invoke("set_drawing_mode", { enabled: true });
    this.setState({ isDrawingModeActive: true });
    console.log("Drawing mode activated");
  }

  /**
   * Deactivate drawing mode
   * Disables cursor capture and ends any active drawing
   */
  async deactivateDrawingMode(): Promise<void> {
    await invoke("set_drawing_mode", { enabled: false });
    this.setState({
      isDrawingModeActive: false,
      isDrawingShape: false,
      startPosition: null,
      currentPosition: null,
      freehandPoints: [],
    });
    console.log("Drawing mode deactivated");
  }

  /**
   * Toggle drawing mode on/off
   */
  async toggleDrawingMode(): Promise<boolean> {
    const newState = !this.state.isDrawingModeActive;
    if (newState) {
      await this.activateDrawingMode();
    } else {
      await this.deactivateDrawingMode();
    }
    return newState;
  }

  /**
   * Select a tool and activate drawing mode
   */
  async selectTool(tool: ToolType): Promise<void> {
    // Emit tool-selected event for overlay
    await invoke("activate_tool_hotkey", { tool });

    this.setState({ currentTool: tool });
    console.log(`Tool selected: ${tool}`);
  }

  /**
   * Clear tool selection (but keep drawing mode active if it was)
   */
  clearTool(): void {
    this.setState({ currentTool: null });
    console.log("Tool cleared");
  }

  /**
   * Start drawing a shape
   * Called when mouse goes down in drawing mode
   */
  startDrawing(x: number, y: number): void {
    this.setState({
      isDrawingShape: true,
      startPosition: { x, y },
      currentPosition: { x, y },
      freehandPoints: [{ x, y }],
    });
    console.log(`Started drawing at (${x}, ${y})`);
  }

  /**
   * Update drawing position
   * Called when mouse moves during drawing
   */
  updateDrawing(x: number, y: number): void {
    if (!this.state.isDrawingShape) return;

    const updates: Partial<DrawingState> = {
      currentPosition: { x, y },
    };

    // For freehand/highlighter, accumulate points
    if (
      this.state.currentTool === ToolType.FREEHAND ||
      this.state.currentTool === ToolType.HIGHLIGHTER
    ) {
      updates.freehandPoints = [...this.state.freehandPoints, { x, y }];
    }

    this.setState(updates);
  }

  /**
   * End drawing a shape
   * Called when mouse goes up after drawing
   */
  endDrawing(): void {
    this.setState({
      isDrawingShape: false,
      startPosition: null,
      currentPosition: null,
      freehandPoints: [],
    });
    console.log("Ended drawing");
  }

  /**
   * Cancel drawing without creating a shape
   */
  cancelDrawing(): void {
    this.setState({
      isDrawingShape: false,
      startPosition: null,
      currentPosition: null,
      freehandPoints: [],
    });
    console.log("Cancelled drawing");
  }

  /**
   * Show text input at position
   */
  showTextInput(x: number, y: number): void {
    this.setState({
      textInput: {
        isVisible: true,
        position: { x, y },
        value: "",
      },
    });
    console.log(`Showing text input at (${x}, ${y})`);
  }

  /**
   * Update text input value
   */
  updateTextInput(value: string): void {
    this.setState({
      textInput: {
        ...this.state.textInput,
        value,
      },
    });
  }

  /**
   * Hide text input
   */
  hideTextInput(): void {
    this.setState({
      textInput: {
        isVisible: false,
        position: null,
        value: "",
      },
    });
    console.log("Hid text input");
  }

  /**
   * Update drawing settings
   */
  updateSettings(settings: Partial<DrawingState["settings"]>): void {
    this.setState({
      settings: {
        ...this.state.settings,
        ...settings,
      },
    });
    console.log("Settings updated:", settings);
  }

  /**
   * Reset all state to defaults
   */
  reset(): void {
    this.state = { ...defaultState };
    this.notifyListeners();
    console.log("Drawing state reset to defaults");
  }

  /**
   * Get current tool
   */
  getCurrentTool(): ToolType | null {
    return this.state.currentTool;
  }

  /**
   * Check if drawing mode is active
   */
  isDrawingMode(): boolean {
    return this.state.isDrawingModeActive;
  }

  /**
   * Check if currently drawing a shape
   */
  isCurrentlyDrawing(): boolean {
    return this.state.isDrawingShape;
  }

  /**
   * Get current settings
   */
  getSettings() {
    return { ...this.state.settings };
  }

  /**
   * Get text input state
   */
  getTextInputState() {
    return { ...this.state.textInput };
  }
}

/**
 * Global singleton instance
 */
const drawingStateStore = new DrawingStateStore();

/**
 * Export the store instance
 */
export default drawingStateStore;

/**
 * Convenience hooks for React components
 */
export const drawingState = {
  /**
   * Get current state snapshot
   */
  getState: () => drawingStateStore.getState(),

  /**
   * Subscribe to state changes
   */
  subscribe: (listener: (state: DrawingState) => void) =>
    drawingStateStore.subscribe(listener),

  /**
   * Activate drawing mode
   */
  activateDrawingMode: () => drawingStateStore.activateDrawingMode(),

  /**
   * Deactivate drawing mode
   */
  deactivateDrawingMode: () => drawingStateStore.deactivateDrawingMode(),

  /**
   * Toggle drawing mode
   */
  toggleDrawingMode: () => drawingStateStore.toggleDrawingMode(),

  /**
   * Select a tool
   */
  selectTool: (tool: ToolType) => drawingStateStore.selectTool(tool),

  /**
   * Clear tool
   */
  clearTool: () => drawingStateStore.clearTool(),

  /**
   * Start drawing
   */
  startDrawing: (x: number, y: number) => drawingStateStore.startDrawing(x, y),

  /**
   * Update drawing
   */
  updateDrawing: (x: number, y: number) => drawingStateStore.updateDrawing(x, y),

  /**
   * End drawing
   */
  endDrawing: () => drawingStateStore.endDrawing(),

  /**
   * Cancel drawing
   */
  cancelDrawing: () => drawingStateStore.cancelDrawing(),

  /**
   * Show text input
   */
  showTextInput: (x: number, y: number) => drawingStateStore.showTextInput(x, y),

  /**
   * Update text input
   */
  updateTextInput: (value: string) => drawingStateStore.updateTextInput(value),

  /**
   * Hide text input
   */
  hideTextInput: () => drawingStateStore.hideTextInput(),

  /**
   * Update settings
   */
  updateSettings: (settings: Partial<DrawingState["settings"]>) =>
    drawingStateStore.updateSettings(settings),

  /**
   * Reset state
   */
  reset: () => drawingStateStore.reset(),

  /**
   * Get current tool
   */
  getCurrentTool: () => drawingStateStore.getCurrentTool(),

  /**
   * Check if drawing mode active
   */
  isDrawingMode: () => drawingStateStore.isDrawingMode(),

  /**
   * Check if currently drawing
   */
  isCurrentlyDrawing: () => drawingStateStore.isCurrentlyDrawing(),

  /**
   * Get settings
   */
  getSettings: () => drawingStateStore.getSettings(),

  /**
   * Get text input state
   */
  getTextInputState: () => drawingStateStore.getTextInputState(),
};
