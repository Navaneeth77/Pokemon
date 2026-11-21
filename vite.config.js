import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { assetVersions } from './scripts/asset-versions.js';

export default defineConfig(({ command }) => ({
  // Production builds version every public/ asset URL by content (src/asset-url.js). Dev skips hashing the
  // 175 MB of sprites, which would also force iCloud to download every offloaded file.
  define: {
    __ASSET_VERSIONS__: command === 'build' ? JSON.stringify(assetVersions(fileURLToPath(new URL('./public', import.meta.url)))) : 'undefined',
  },
  // Keep class names through minification: the effect budget (game.js DECORATIVE_EFFECTS) identifies purely
  // decorative effects by constructor name, which a minified build would otherwise rename.
  esbuild: { keepNames: true },
  build: {
    rollupOptions: {
      input: {
        game: fileURLToPath(new URL('./index.html', import.meta.url)),
        moveDemo: fileURLToPath(new URL('./scripts/move-demo.html', import.meta.url)),
      },
    },
  },
}));
