import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/wifi': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/api/system': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/api/ai': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/api/auth': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
})
