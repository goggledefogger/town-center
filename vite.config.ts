import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // Allow access from home network (NFR-011)
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
