import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

function staffHistoryFallback() {
  const rewrite = (
    request: { url?: string },
    _response: unknown,
    next: () => void,
  ) => {
    if (/^\/staff(?:\/|$)/.test(request.url ?? '')) request.url = '/staff.html'
    next()
  }
  return {
    name: 'staff-history-fallback',
    configureServer(server: { middlewares: { use: (handler: typeof rewrite) => void } }) {
      server.middlewares.use(rewrite)
    },
    configurePreviewServer(server: { middlewares: { use: (handler: typeof rewrite) => void } }) {
      server.middlewares.use(rewrite)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [staffHistoryFallback(), react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        customer: new URL('./index.html', import.meta.url).pathname,
        staff: new URL('./staff.html', import.meta.url).pathname,
      },
    },
  },
})
