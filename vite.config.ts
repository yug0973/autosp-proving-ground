import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Two pages: the autosp site at / and the 3D city, "The Annex", at /tour/.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        site: resolve(import.meta.dirname, 'index.html'),
        tour: resolve(import.meta.dirname, 'tour/index.html'),
      },
    },
  },
});
