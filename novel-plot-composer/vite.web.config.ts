import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// レンダラーは Electron 非依存で書いてあるので、そのままブラウザでも動かせる。
// `npm run web` でブラウザ版（保存はダウンロード / 読み込みはファイル選択）を起動する。
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  resolve: {
    alias: { '@': resolve(__dirname, 'src/renderer/src') }
  },
  build: {
    outDir: resolve(__dirname, 'out/web'),
    emptyOutDir: true
  },
  plugins: [react()]
})
