import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// One origin for the browser, three backends behind it (first match wins).
// Same-origin matters: the refresh cookie is SameSite=Strict and scoped to
// /api/auth. In production, the host's rewrites play this role.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5203,
    strictPort: true,
    proxy: {
      '^/api/(auth|me|claims|owner|admin)(/|\\?|$)': 'http://localhost:8082', // account-service
      '/api/catalog': 'http://localhost:8083', // catalog-service
      '/api': 'http://localhost:3001', // engine
    },
  },
})
