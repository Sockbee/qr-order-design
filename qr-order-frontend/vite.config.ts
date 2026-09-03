import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const LOCAL_API_PROXY_PATH = '/__gcp_api__'

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
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const apiProxyTarget = env.API_PROXY_TARGET?.trim().replace(/\/$/, '')

  return {
    plugins: [staffHistoryFallback(), react()],
    server: apiProxyTarget
      ? {
          proxy: {
            [LOCAL_API_PROXY_PATH]: {
              target: apiProxyTarget,
              changeOrigin: true,
              rewrite: (path) => path.replace(LOCAL_API_PROXY_PATH, ''),
              configure: (proxy) => {
                proxy.on('proxyReq', (proxyRequest) => {
                  // The browser talks to the same-origin Vite server. Omitting
                  // Origin on the server-to-server hop avoids Cloud Run's
                  // production-only CORS allowlist rejecting local development.
                  proxyRequest.removeHeader('origin')
                })
              },
            },
          },
        }
      : undefined,
    build: {
      rollupOptions: {
        input: {
          customer: new URL('./index.html', import.meta.url).pathname,
          staff: new URL('./staff.html', import.meta.url).pathname,
        },
      },
    },
  }
})
