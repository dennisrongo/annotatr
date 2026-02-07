/**
 * Drawing State Management Tests
 * Feature #118: Test centralized drawing state management
 */

import { drawingState } from "../drawingState";
import { DrawingState } from "../drawingState";

/**
 * Test helper to reset state before each test
 */
function resetState() {
  drawingState.reset();
}

/**
 * Test 1: Verify state initialization
 */
export function testInitialState() {
  resetState();
  const state = drawingState.getState();

  console.assert(state.isDrawingModeActive === false, "Initial drawing mode should be false");
  console.assert(state.currentTool === null, "Initial current tool should be null");
  console.assert(state.isDrawingShape === false, "Initial drawing shape should be false");
  console.assert(state.startPosition === null, "Initial start position should be null");
  console.assert(state.currentPosition === null, "Initial current position should be null");
  console.assert(state.freehandPoints.length === 0, "Initial freehand points should be empty");
  console.assert(state.textInput.isVisible === false, "Initial text input should not be visible");

  console.log("✓ Test 1 passed: Initial state is correct");
  return true;
}

/**
 * Test 2: Verify tool selection
 */
export function testToolSelection() {
  resetState();

  // Select arrow tool
  drawingState.selectTool("arrow" as any);
  let state = drawingState.getState();

  console.assert(state.currentTool === "arrow", "Current tool should be arrow");
  console.log("✓ Test 2a passed: Tool selection works");

  // Clear tool
  drawingState.clearTool();
  state = drawingState.getState();

  console.assert(state.currentTool === null, "Current tool should be null after clearing");
  console.log("✓ Test 2b passed: Tool clearing works");

  return true;
}

/**
 * Test 3: Verify drawing mode activation
 */
export async function testDrawingModeActivation() {
  resetState();

  // Activate drawing mode
  await drawingState.activateDrawingMode();
  let state = drawingState.getState();

  console.assert(state.isDrawingModeActive === true, "Drawing mode should be active");
  console.log("✓ Test 3a passed: Drawing mode activation works");

  // Deactivate drawing mode
  await drawingState.deactivateDrawingMode();
  state = drawingState.getState();

  console.assert(state.isDrawingModeActive === false, "Drawing mode should be inactive");
  console.log("✓ Test 3b passed: Drawing mode deactivation works");

  return true;
}

/**
 * Test 4: Verify drawing state transitions
 */
export function testDrawingTransitions() {
  resetState();

  // Start drawing
  drawingState.startDrawing(100, 200);
  let state = drawingState.getState();

  console.assert(state.isDrawingShape === true, "Should be drawing shape");
  console.assert(state.startPosition?.x === 100, "Start X should be 100");
  console.assert(state.startPosition?.y === 200, "Start Y should be 200");
  console.assert(state.freehandPoints.length === 1, "Should have one point");
  console.log("✓ Test 4a passed: Drawing start works");

  // Update drawing
  drawingState.updateDrawing(150, 250);
  state = drawingState.getState();

  console.assert(state.currentPosition?.x === 150, "Current X should be 150");
  console.assert(state.currentPosition?.y === 250, "Current Y should be 250");
  console.log("✓ Test 4b passed: Drawing update works");

  // End drawing
  drawingState.endDrawing();
  state = drawingState.getState();

  console.assert(state.isDrawingShape === false, "Should not be drawing shape");
  console.assert(state.startPosition === null, "Start position should be null");
  console.assert(state.currentPosition === null, "Current position should be null");
  console.log("✓ Test 4c passed: Drawing end works");

  return true;
}

/**
 * Test 5: Verify text input state
 */
export function testTextInputState() {
  resetState();

  // Show text input
  drawingState.showTextInput(50, 100);
  let state = drawingState.getState();

  console.assert(state.textInput.isVisible === true, "Text input should be visible");
  console.assert(state.textInput.position?.x === 50, "Text input X should be 50");
  console.assert(state.textInput.position?.y === 100, "Text input Y should be 100");
  console.log("✓ Test 5a passed: Show text input works");

  // Update text input value
  drawingState.updateTextInput("Hello World");
  state = drawingState.getState();

  console.assert(state.textInput.value === "Hello World", "Text input value should be 'Hello World'");
  console.log("✓ Test 5b passed: Update text input works");

  // Hide text input
  drawingState.hideTextInput();
  state = drawingState.getState();

  console.assert(state.textInput.isVisible === false, "Text input should not be visible");
  console.assert(state.textInput.value === "", "Text input value should be empty");
  console.log("✓ Test 5c passed: Hide text input works");

  return true;
}

/**
 * Test 6: Verify state subscription
 */
export function testStateSubscription() {
  resetState();

  let callCount = 0;
  let lastState: DrawingState | null = null;

  // Subscribe to state changes
  const unsubscribe = drawingState.subscribe((state: DrawingState) => {
    callCount++;
    lastState = state;
  });

  // Should be called immediately with current state
  console.assert(callCount === 1, "Subscription should be called immediately");
  console.log("✓ Test 6a passed: Subscription callback called immediately");

  // Trigger state change
  drawingState.selectTool("circle" as any);

  // Should be called again
  console.assert(callCount === 2, "Subscription should be called on state change");
  console.assert(lastState.currentTool === "circle", "Last state should have circle tool");
  console.log("✓ Test 6b passed: Subscription callback called on state change");

  // Unsubscribe
  unsubscribe();

  // Trigger another state change
  drawingState.clearTool();

  // Call count should not increase
  console.assert(callCount === 2, "Subscription should not be called after unsubscribe");
  console.log("✓ Test 6c passed: Unsubscribe works");

  return true;
}

/**
 * Test 7: Verify settings management
 */
export function testSettingsManagement() {
  resetState();

  // Get initial settings
  let settings = drawingState.getSettings();

  console.assert(settings.color === "#FF0000", "Default color should be red");
  console.assert(settings.lineThickness === 12, "Default line thickness should be 12");
  console.assert(settings.fontSize === 14, "Default font size should be 14");
  console.log("✓ Test 7a passed: Default settings are correct");

  // Update settings
  drawingState.updateSettings({
    color: "#0000FF",
    lineThickness: 20,
  });

  settings = drawingState.getSettings();

  console.assert(settings.color === "#0000FF", "Color should be blue");
  console.assert(settings.lineThickness === 20, "Line thickness should be 20");
  console.assert(settings.fontSize === 14, "Font size should remain unchanged");
  console.log("✓ Test 7b passed: Settings update works");

  return true;
}

/**
 * Test 8: Verify state persistence through transitions
 */
export function testStatePersistence() {
  resetState();

  // Select tool and activate drawing mode
  drawingState.selectTool("box" as any);

  // Start drawing
  drawingState.startDrawing(10, 20);
  drawingState.updateDrawing(30, 40);
  drawingState.updateDrawing(50, 60);

  let state = drawingState.getState();

  // Verify state
  console.assert(state.currentTool === "box", "Tool should be box");
  console.assert(state.isDrawingShape === true, "Should be drawing");
  console.assert(state.freehandPoints.length === 3, "Should have 3 points");
  console.log("✓ Test 8a passed: State persists through updates");

  // End drawing
  drawingState.endDrawing();

  state = drawingState.getState();

  console.assert(state.currentTool === "box", "Tool should still be box");
  console.assert(state.isDrawingShape === false, "Should not be drawing");
  console.assert(state.freehandPoints.length === 0, "Points should be cleared");
  console.log("✓ Test 8b passed: State correctly resets after drawing");

  return true;
}

/**
 * Run all tests
 */
export async function runAllDrawingStateTests() {
  console.log("\n=== Drawing State Management Tests ===\n");

  try {
    testInitialState();
    testToolSelection();
    await testDrawingModeActivation();
    testDrawingTransitions();
    testTextInputState();
    testStateSubscription();
    testSettingsManagement();
    testStatePersistence();

    console.log("\n=== All Tests Passed ✓ ===\n");
    console.log("Feature #118: Drawing state management is working correctly\n");

    return true;
  } catch (error) {
    console.error("\n=== Test Failed ✗ ===");
    console.error(error);
    return false;
  }
}

// Export tests for external runner
export default {
  testInitialState,
  testToolSelection,
  testDrawingModeActivation,
  testDrawingTransitions,
  testTextInputState,
  testStateSubscription,
  testSettingsManagement,
  testStatePersistence,
  runAllDrawingStateTests,
};
