import { createLogger, defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// An open tab calls the backends as soon as Vite is up, but the Spring services
// take ~10 s to start; say so in one line instead of a stack trace per request.
const logger = createLogger()
const logError = logger.error
logger.error = (msg, options) => {
  const err = options?.error
  if (err?.code === 'ECONNREFUSED' && msg.includes('http proxy error')) {
    const port = err.port ?? err.errors?.[0]?.port
    return logError(`${msg.split('\n')[0]} (nothing listening on :${port} yet)`, options)
  }
  logError(msg, options)
}

// One origin for the browser, three backends behind it (first match wins).
// Same-origin matters: the refresh cookie is SameSite=Strict and scoped to
// /api/auth. In production, the host's rewrites play this role.
export default defineConfig({
  plugins: [react()],
  customLogger: logger,
  server: {
    port: 5203,
    strictPort: true,
    proxy: {
      '^/api/(auth|me|claims|owner|admin|kakis)(/|\\?|$)': 'http://localhost:8082', // account-service
      '/api/catalog': 'http://localhost:8083', // catalog-service
      '/api': 'http://localhost:3001', // engine
    },
  },
})
