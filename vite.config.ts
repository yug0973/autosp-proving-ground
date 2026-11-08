import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Two pages: the exhibition "One Fix" at / and the 3D city, "The Annex", at /tour/.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        exhibition: resolve(import.meta.dirname, 'index.html'),
        tour: resolve(import.meta.dirname, 'tour/index.html'),
      },
    },
  },
});
