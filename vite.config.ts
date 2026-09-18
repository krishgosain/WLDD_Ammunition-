import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // shadcn components are written against the "@/" alias.
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // three.js is ~700kB. The grid must paint before it loads, so the
          // Reach Field's whole dependency tree stays in its own lazy chunk.
          if (/node_modules\/(three|@react-three)/.test(id)) return 'three';
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          if (/node_modules\/motion(-dom|-utils)?\//.test(id)) return 'motion';
          return undefined;
        },
      },
    },
  },
});
