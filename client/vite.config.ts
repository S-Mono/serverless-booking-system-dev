import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import viteCompression from 'vite-plugin-compression'

// https://vite.dev/config/
export default defineConfig(async ({ command }) => {
  // Vue DevTools は開発サーバー(vite dev)でのみ使用する。
  // 本番ビルドで読み込むと Node 25+ で localStorage の警告が出るため、動的に読み込む。
  const devPlugins = command === 'serve'
    ? [(await import('vite-plugin-vue-devtools')).default()]
    : []

  return {
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.0.0')
  },
  plugins: [
    vue(),
    ...devPlugins,
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
        manualChunks(id: string) {
         // 1. firebase 関連を分離
          if (id.includes('firebase')) return 'vendor-firebase';
          // 2. Excel 出力関連を分離（これが非常に大きい）
          if (id.includes('exceljs')) return 'vendor-exceljs';
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
  }
})
