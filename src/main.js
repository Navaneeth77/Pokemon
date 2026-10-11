import '@fontsource/pixelify-sans/500.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/luckiest-guy/400.css';
import './style.css';
import { loadSpecies } from './assets.js';
import { SPECIES } from './data/species.js';
import { WINGS } from './data/wings.js';
import { addFlapAnim } from './flap.js';
import { Game } from './game.js';
import { UI } from './ui.js';

async function main() {
  await Promise.all([
    document.fonts.load('700 16px "Pixelify Sans"'),
    document.fonts.load('400 16px "Luckiest Guy"'),
  ]);
  const sprites = await loadSpecies([...new Set(Object.values(SPECIES).map(s => s.sprite))]);
  for (const [id, cfg] of Object.entries(WINGS)) addFlapAnim(sprites[id], cfg);
  const ui = new UI();
  const game = new Game(document.getElementById('game'), sprites, ui);
  ui.bind(game);
  game.toSelect();
  game.run();
  if (import.meta.env.DEV) window.game = game;
}

main().catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre class="fatal">Failed to start: ${err.message}</pre>`);
});
