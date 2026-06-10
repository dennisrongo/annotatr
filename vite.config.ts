import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "0.0.0.0",
    port: 35421,
    // tauri.conf.json devUrl hardcodes this port; failing loudly beats
    // three windows silently loading nothing
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    rollupOptions: {
      // All three Tauri windows need their HTML entry in dist/
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        overlay: fileURLToPath(new URL("./overlay.html", import.meta.url)),
        "mini-panel": fileURLToPath(new URL("./mini-panel.html", import.meta.url)),
      },
    },
  },
});
