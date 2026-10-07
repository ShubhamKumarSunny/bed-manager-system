import path from "path"
import { fileURLToPath } from "url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "")
  const backend = env.VITE_DEV_BACKEND_URL || "http://localhost:5001"

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      // Same-origin API in development, mirroring the production setup
      proxy: {
        "/api": { target: backend, changeOrigin: true },
        "/socket.io": { target: backend, changeOrigin: true, ws: true },
      },
    },
    // Keep debug logging out of the production bundle
    esbuild: mode === "production" ? { pure: ["console.log", "console.debug"] } : {},
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom"],
            state: ["@reduxjs/toolkit", "react-redux", "axios", "socket.io-client"],
            motion: ["framer-motion", "motion"],
          },
        },
      },
    },
  }
})
