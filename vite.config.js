import path from 'path'
import { fileURLToPath } from 'url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function logServerUrlPlugin() {
  return {
    name: 'log-server-url',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const addr = server.httpServer?.address()
        const port = typeof addr === 'object' && addr?.port
        const url = port ? `http://localhost:${port}/` : 'http://localhost:5173/'
        console.log('')
        console.log('  ➜  App running at: ' + url)
        console.log('')
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [logServerUrlPlugin(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});