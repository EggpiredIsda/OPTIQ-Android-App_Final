import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: './',
  assetsInclude: ['**/*.glb', '**/*.gltf'],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'esbuild',
    sourcemap: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
});
