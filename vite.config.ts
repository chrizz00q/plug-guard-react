
import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "")
  const backend = env.BACKEND_URL || "http://localhost"
  const backendPath = env.BACKEND_PATH || "/plugguard-api"

  const allowedHosts = (env.ALLOWED_HOSTS || "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean)

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 3000,
      host: true,
      allowedHosts: true,
      proxy: {
        "/api": {
          target: backend,
          changeOrigin: true,
          rewrite: (path) =>
            path.replace(/^\/api/, backendPath),
        },
      },
    },
  }
})
