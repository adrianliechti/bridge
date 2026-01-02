import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: [
      { find: 'openai', replacement: path.resolve(__dirname, 'src/lib/openai-browser.ts') },
      { find: 'openai-original', replacement: path.dirname(require.resolve('openai')) },
    ],
  },
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
