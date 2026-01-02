import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Custom plugin to redirect 'openai' imports to our browser-safe wrapper
// but only for files outside our wrapper itself
function openaiAliasPlugin(): Plugin {
  const wrapperPath = path.resolve(__dirname, 'src/lib/openai-browser.ts');
  return {
    name: 'openai-browser-alias',
    enforce: 'pre',
    resolveId(source, importer) {
      // Only alias bare 'openai' imports, not from our wrapper file
      if (source === 'openai' && importer && !importer.includes('openai-browser')) {
        return wrapperPath;
      }
      return null;
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    openaiAliasPlugin(),
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
  optimizeDeps: {
    // Exclude openai from pre-bundling so our alias plugin can intercept it
    exclude: ['openai'],
  },
})
