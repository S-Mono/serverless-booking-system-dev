import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import viteCompression from 'vite-plugin-compression'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    viteCompression({ algorithm: 'gzip' }),
    viteCompression({ algorithm: 'brotliCompress', ext: '.br' }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
         // 1. firebase 関連を分離
          if (id.includes('firebase')) return 'vendor-firebase';
          // 2. xlsx 関連を分離（これが非常に大きい）
          if (id.includes('xlsx')) return 'vendor-xlsx';
          // 3. その他 node_modules のうち、vue などを分離
          if (id.includes('node_modules')) {
            if (id.includes('vue') || id.includes('pinia')) return 'vendor-core';
            return 'vendor-others';
          }
        }
      }
    },
    // 警告の閾値を少し上げる（必要に応じて）
    chunkSizeWarningLimit: 500, // 500KB に設定（デフォルトは 500KB）
  },
})
