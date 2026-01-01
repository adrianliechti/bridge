import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/openai': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/openai/, '')
      },
      '/contexts/local-docker': {
        target: 'http://localhost:2375',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/contexts\/local-docker/, '')
      },
      '/contexts/local-cluster': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/contexts\/local-cluster/, '')
      }
    },
  },
})
