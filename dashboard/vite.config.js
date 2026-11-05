import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 开发/预览都把 /api 代理到后端 3000，避免 CORS
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3002,
    proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true } }
  },
  preview: {
    port: 3002,
    proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true } }
  }
})
