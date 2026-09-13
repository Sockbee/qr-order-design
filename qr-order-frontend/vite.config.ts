import tailwindcss from '@tailwindcss/vite'
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
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, '.', '')
  const apiProxyTarget = env.API_PROXY_TARGET?.trim().replace(/\/$/, '')
  const apiBaseUrl = env.VITE_API_BASE_URL?.trim()
  const mocksEnabled = env.VITE_ENABLE_MOCKS === 'true'

  if (!apiBaseUrl && mode !== 'test' && (command === 'build' || !mocksEnabled)) {
    throw new Error(
      command === 'build'
        ? 'VITE_API_BASE_URL is required for production builds.'
        : 'Set VITE_API_BASE_URL, or explicitly set VITE_ENABLE_MOCKS=true for local UI development.',
    )
  }

  return {
    plugins: [staffHistoryFallback(), react(), tailwindcss()],
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
