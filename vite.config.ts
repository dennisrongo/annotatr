import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: false,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
