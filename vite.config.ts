import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "0.0.0.0",
    port: 35421,
    strictPort: false,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
