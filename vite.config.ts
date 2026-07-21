import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/openai': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/openai/, ''),
      },
      '/contexts/local-docker': {
        target: 'http://localhost:2375',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/contexts\/local-docker/, ''),
      },
      '/contexts/local-cluster': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        // Terminal (pod exec) runs over websockets
        ws: true,
        rewrite: (path) => path.replace(/^\/contexts\/local-cluster/, ''),
      },
    },
  },
});
