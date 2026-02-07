# Drawing State Management

**Feature #118**: Centralized state management for tracking drawing mode and active tool.

## Overview

The drawing state management system provides a centralized, singleton store for managing all drawing-related state in the annotatr application. This ensures consistency across components and provides a single source of truth for the drawing system.

## Architecture

### State Store Class

The `DrawingStateStore` class manages all drawing state using a singleton pattern:

- **Location**: `src/lib/drawingState.ts`
- **Pattern**: Singleton with pub/sub for state changes
- **Thread Safety**: Uses TypeScript with async/await for Tauri command integration

### State Structure

```typescript
interface DrawingState {
  // Drawing mode status
  isDrawingModeActive: boolean;

  // Current tool selection
  currentTool: ToolType | null;

  // Active shape drawing
  isDrawingShape: boolean;
  startPosition: { x: number; y: number } | null;
  currentPosition: { x: number; y: number } | null;
  freehandPoints: Array<{ x: number; y: number }>;

  // Text input state
  textInput: {
    isVisible: boolean;
    position: { x: number; y: number } | null;
    value: string;
  };

  // Drawing settings
  settings: {
    color: string;
    lineThickness: number;
    fontSize: number;
    fadeDuration: number;
  };
}
```

## API Reference

### State Access

```typescript
// Get current state snapshot
const state = drawingState.getState();

// Get specific values
const tool = drawingState.getCurrentTool();
const isActive = drawingState.isDrawingMode();
const isDrawing = drawingState.isCurrentlyDrawing();
const settings = drawingState.getSettings();
const textState = drawingState.getTextInputState();
```

### Drawing Mode Control

```typescript
// Activate drawing mode
await drawingState.activateDrawingMode();

// Deactivate drawing mode
await drawingState.deactivateDrawingMode();

// Toggle drawing mode on/off
const newState = await drawingState.toggleDrawingMode();
```

### Tool Selection

```typescript
// Select a tool (also activates drawing mode)
await drawingState.selectTool(ToolType.ARROW);

// Clear tool selection
drawingState.clearTool();
```

### Drawing Operations

```typescript
// Start drawing a shape
drawingState.startDrawing(x, y);

// Update drawing position
drawingState.updateDrawing(x, y);

// End drawing (complete shape)
drawingState.endDrawing();

// Cancel drawing (discard shape)
drawingState.cancelDrawing();
```

### Text Input

```typescript
// Show text input at position
drawingState.showTextInput(x, y);

// Update text input value
drawingState.updateTextInput("Hello World");

// Hide text input
drawingState.hideTextInput();
```

### Settings

```typescript
// Update drawing settings
drawingState.updateSettings({
  color: "#FF0000",
  lineThickness: 12,
  fontSize: 14,
});

// Reset all state to defaults
drawingState.reset();
```

### State Subscription

```typescript
// Subscribe to state changes
const unsubscribe = drawingState.subscribe((state) => {
  console.log("State changed:", state);
  // Update UI or react to changes
});

// Unsubscribe when done
unsubscribe();
```

## State Transitions

### 1. Tool Activation Flow

```
User selects tool
  → drawingState.selectTool(tool)
  → Emit "tool-selected" event
  → Emit "drawing-mode-changed" event
  → Update currentTool
  → Notify all subscribers
```

### 2. Drawing Mode Flow

```
User activates drawing mode
  → drawingState.activateDrawingMode()
  → Invoke Tauri command: set_drawing_mode
  → Update isDrawingModeActive
  → Notify all subscribers
```

### 3. Shape Drawing Flow

```
User presses mouse down
  → drawingState.startDrawing(x, y)
  → Set isDrawingShape = true
  → Record startPosition
  → Initialize freehandPoints

User drags mouse
  → drawingState.updateDrawing(x, y)
  → Update currentPosition
  → Accumulate freehandPoints (for freehand/highlighter)
  → Notify subscribers

User releases mouse
  → drawingState.endDrawing()
  → Set isDrawingShape = false
  → Clear temporary drawing state
  → Notify subscribers
```

### 4. Text Input Flow

```
User clicks with text tool
  → drawingState.showTextInput(x, y)
  → Set textInput.isVisible = true
  → Set textInput.position

User types text
  → drawingState.updateTextInput(value)
  → Update textInput.value

User submits (Enter) or cancels (Escape)
  → drawingState.hideTextInput()
  → Reset textInput state
```

## Integration with Components

### Overlay Component

The Overlay component uses the centralized state for:

1. **Drawing mode status**: Check `isDrawingModeActive` to determine cursor style
2. **Current tool**: Display visual indicator for active tool
3. **Drawing operations**: Call `startDrawing()`, `updateDrawing()`, `endDrawing()`
4. **Text input**: Use text input state for inline text editing

Example integration:

```typescript
import { drawingState } from "../lib/drawingState";

// Subscribe to state changes
useEffect(() => {
  const unsubscribe = drawingState.subscribe((state) => {
    setIsDrawingMode(state.isDrawingModeActive);
    setCurrentTool(state.currentTool);
    // Update UI as needed
  });

  return unsubscribe;
}, []);

// Handle mouse events
const handleMouseDown = (e) => {
  if (!drawingState.isDrawingMode()) return;
  drawingState.startDrawing(e.clientX, e.clientY);
};

const handleMouseMove = (e) => {
  if (!drawingState.isCurrentlyDrawing()) return;
  drawingState.updateDrawing(e.clientX, e.clientY);
};

const handleMouseUp = () => {
  if (drawingState.isCurrentlyDrawing()) {
    drawingState.endDrawing();
  }
};
```

### Mini Panel Component

The MiniPanel component uses the centralized state for:

1. **Tool selection**: Call `selectTool()` when user clicks tool button
2. **Tool display**: Show selected tool from `getCurrentTool()`

Example integration:

```typescript
import { drawingState } from "../lib/drawingState";

// Subscribe to state changes
useEffect(() => {
  const unsubscribe = drawingState.subscribe((state) => {
    setSelectedTool(state.currentTool);
  });

  return unsubscribe;
}, []);

// Handle tool selection
const selectTool = async (tool: ToolType) => {
  await drawingState.selectTool(tool);
};
```

## Benefits of Centralized State

1. **Single Source of Truth**: All components access the same state
2. **Consistency**: No conflicting state between components
3. **Predictability**: State transitions are explicit and traceable
4. **Testability**: State management logic is isolated and testable
5. **Debugging**: State changes flow through a single point
6. **Maintainability**: Easier to add new features with centralized state

## Testing

The drawing state management system includes comprehensive tests:

- **Location**: `src/lib/__tests__/drawingState.test.ts`
- **Coverage**:
  - Initial state verification
  - Tool selection
  - Drawing mode activation
  - Drawing state transitions
  - Text input state
  - State subscription
  - Settings management
  - State persistence

Run tests with:

```typescript
import { runAllDrawingStateTests } from "./lib/__tests__/drawingState.test";

runAllDrawingStateTests();
```

## Migration Notes

### Current Implementation

The current implementation has drawing state分散 across:

- `Overlay.tsx`: Local drawing state (drawingState, isDrawingMode, currentTool)
- `MiniPanel.tsx`: Local selectedTool state
- Rust backend: OverlayState (is_visible, current_monitor, drawing_mode)

### Migration Path

To fully migrate to centralized state:

1. **Phase 1** (Feature #118 - Current):
   - Create centralized state store ✓
   - Document API and usage ✓
   - Add tests ✓

2. **Phase 2** (Future):
   - Refactor Overlay to use centralized state
   - Refactor MiniPanel to use centralized state
   - Remove duplicate local state

3. **Phase 3** (Future):
   - Integrate with Rust backend state
   - Add state persistence
   - Add state history/undo

## Future Enhancements

Potential improvements to the state management system:

1. **State History**: Track past states for undo/redo functionality
2. **State Persistence**: Save drawing state to local storage
3. **State Validation**: Ensure state transitions are valid
4. **State Middleware**: Add logging, analytics, or other middleware
5. **Time Travel Debugging**: Replay state changes for debugging
6. **Optimistic Updates**: Update UI immediately, sync with backend asynchronously

## Related Features

- Feature #13: Drawing mode activation
- Feature #14: Click-through prevention during drawing mode
- Feature #16: Cursor changes when entering drawing mode
- Feature #17: Visual indicator showing active drawing tool
- Feature #18: Overlay activation via hotkey or mini panel

## See Also

- [Tauri State Management](https://tauri.app/v2/guides/state-management/)
- [React State Management](https://react.dev/learn/managing-state)
- [State Management Patterns](https://patternbrowser.org/patterns/stateManagement)
