import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        game: fileURLToPath(new URL('./index.html', import.meta.url)),
        moveDemo: fileURLToPath(new URL('./scripts/move-demo.html', import.meta.url)),
      },
    },
  },
});
