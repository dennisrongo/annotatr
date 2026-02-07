// Overlay window entry point
// This is the main script for the transparent overlay window
const canvas = document.getElementById('canvas') as HTMLCanvasElement;

if (canvas) {
  // Set canvas size to window size
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  console.log('Overlay window initialized');
} else {
  console.error('Canvas element not found');
}
