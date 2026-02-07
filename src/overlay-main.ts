// Overlay window entry point
// This is the main script for the transparent overlay window
const canvas = document.getElementById('canvas') as HTMLCanvasElement;

if (canvas) {
  const ctx = canvas.getContext('2d');
  let isDrawing = false;
  let startX = 0;
  let startY = 0;
  let currentTool: 'arrow' | 'circle' | 'box' | 'freehand' = 'arrow';

  // Feature #7: Mouse capture for drawing
  // Set canvas size to window size
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Mouse event handlers for drawing (Feature #7)
  canvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;
    console.log('Drawing started at:', startX, startY, 'with tool:', currentTool);
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;

    if (ctx) {
      // Clear and redraw for preview
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw preview based on tool
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 3;
      ctx.beginPath();

      if (currentTool === 'box') {
        ctx.strokeRect(startX, startY, e.clientX - startX, e.clientY - startY);
      } else if (currentTool === 'circle') {
        const radiusX = Math.abs(e.clientX - startX) / 2;
        const radiusY = Math.abs(e.clientY - startY) / 2;
        const centerX = startX + (e.clientX - startX) / 2;
        const centerY = startY + (e.clientY - startY) / 2;
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (currentTool === 'arrow') {
        // Draw arrow line
        ctx.moveTo(startX, startY);
        ctx.lineTo(e.clientX, e.clientY);
        ctx.stroke();
      } else if (currentTool === 'freehand') {
        ctx.lineTo(e.clientX, e.clientY);
        ctx.stroke();
      }
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    if (isDrawing) {
      isDrawing = false;
      console.log('Drawing ended at:', e.clientX, e.clientY);

      // Feature #9: Track which monitor this shape belongs to
      // The overlay is positioned per-monitor, so shapes are automatically confined
      const shapeData = {
        tool: currentTool,
        startX,
        startY,
        endX: e.clientX,
        endY: e.clientY,
        timestamp: Date.now()
      };
      console.log('Shape created on current monitor:', shapeData);
    }
  });

  // Listen for tool changes from main window
  window.addEventListener('message', (event) => {
    if (event.data.tool) {
      currentTool = event.data.tool;
      console.log('Tool changed to:', currentTool);
    }
  });

  // Feature #10: Handle Escape key to dismiss overlay
  window.addEventListener('keydown', async (event) => {
    if (event.key === 'Escape') {
      console.log('Escape key pressed - dismissing overlay');
      event.preventDefault();

      try {
        // @ts-expect-error - Tauri API is available at runtime
        const { invoke } = await import('@tauri-apps/api/core');

        // Call dismiss_overlay command
        await invoke('dismiss_overlay');

        // Clear any active drawing state
        isDrawing = false;
        startX = 0;
        startY = 0;

        // Clear the canvas
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        console.log('Overlay dismissed successfully');
      } catch (error) {
        console.error('Failed to dismiss overlay:', error);
      }
    }
  });

  // Feature #10: Listen for toggle events from hotkeys
  window.addEventListener('tauri://toggle-overlay', async () => {
    console.log('Toggle overlay event received');

    try {
      // @ts-expect-error - Tauri API is available at runtime
      const { invoke } = await import('@tauri-apps/api/core');

      // Call toggle_overlay command
      await invoke('toggle_overlay');

      // Clear any active drawing state
      isDrawing = false;
      startX = 0;
      startY = 0;

      // Clear the canvas
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    } catch (error) {
      console.error('Failed to toggle overlay:', error);
    }
  });

  console.log('Overlay window initialized with mouse capture and Escape key support');
} else {
  console.error('Canvas element not found');
}
