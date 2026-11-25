import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

const sharedProxy = {
  '/api': {
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
    configure: (proxy: any) => {
      proxy.on('error', (_err: any, _req: any, _res: any) => {});
    }
  },
  '/ws': {
    target: 'ws://127.0.0.1:8000',
    ws: true,
    configure: (proxy: any) => {
      proxy.on('error', (_err: any, _req: any, _res: any) => {});
    }
  }
}

const attachLegacySystemCatchPlugin = () => ({
  name: 'boncore-legacy-system-catch',
  enforce: 'post' as const,
  apply: 'build' as const,
  transformIndexHtml(html: string) {
    return html.replace(
      /System\.import\(document\.getElementById\('vite-legacy-entry'\)\.getAttribute\('data-src'\)\)/g,
      "System.import(document.getElementById('vite-legacy-entry').getAttribute('data-src')).catch(function(err){if(window.__boncoreShowBootError){window.__boncoreShowBootError(err&&(err.stack||err.message)||String(err));}})"
    );
  },
});

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['ie 11', 'ios >= 9', 'safari >= 9'],
      additionalLegacyPolyfills: ['whatwg-fetch'],
      modernPolyfills: true,
    }),
    attachLegacySystemCatchPlugin(),
  ],
  build: {
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1000,
    terserOptions: {
      ecma: 5,
      compress: {
        arrows: false,
      },
      format: {
        ecma: 5,
      },
    } as any,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-icons': ['lucide-react']
        }
      }
    }
  },
  server: {
    port: 80,
    host: true,
    allowedHosts: true,
    proxy: sharedProxy,
  },
  preview: {
    port: 80,
    host: true,
    allowedHosts: true,
    proxy: sharedProxy,
  }
})
