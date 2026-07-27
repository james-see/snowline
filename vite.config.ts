import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    // Single shared three instance — addons (GLTFLoader) must not pull a second copy.
    dedupe: ['three'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['three', 'three/addons/loaders/GLTFLoader.js'],
  },
  server: {
    port: 5173,
    strictPort: true,
    // The capture harness pins the tree to a single snapshot; a hot update
    // mid-run destroys the page context or re-executes a half-written module.
    hmr: process.env.SNOWLINE_NO_HMR === '1' ? false : undefined,
    headers: {
      // Required for SharedArrayBuffer, used by the Rapier physics worker path.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('@dimforge/rapier3d-compat')) return 'rapier';
          return undefined;
        },
      },
    },
  },
  assetsInclude: ['**/*.hdr', '**/*.ktx2', '**/*.bin', '**/*.cube'],
  worker: { format: 'es' },
});
