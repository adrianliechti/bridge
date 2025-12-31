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
      '/docker/': {
        target: 'http://localhost:2375',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/docker/, '')
      },
      '/contexts': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        rewrite: (path) => {
          return path.replace(/^\/contexts\/[^/]+/, '');
        },
        bypass: (req, res) => {
          if (req.method === 'GET' && req.url === '/contexts' && res) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify([
              { name: 'default' },
            ]));
            return false;
          }
          return null;
        },
      },
      '/openai': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/openai/, '')
      }
    },
  },
})
