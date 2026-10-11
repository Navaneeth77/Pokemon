import '@fontsource/pixelify-sans/500.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/luckiest-guy/400.css';
import './style.css';
import { loadSpecies } from './assets.js';
import { DEFAULT_TEAM, OPPONENT_TEAM, spritesFor } from './data/species.js';
import { Game, prepareSprites } from './game.js';
import { UI } from './ui.js';
import { Flow } from './flow.js';

async function main() {
  await Promise.all([
    document.fonts.load('700 16px "Pixelify Sans"'),
    document.fonts.load('400 16px "Luckiest Guy"'),
  ]);
  // Only the default team and the opponent's are loaded up front; other picks load when a battle starts.
  const first = [...spritesFor([...DEFAULT_TEAM, ...OPPONENT_TEAM]), 'eevee', 'bidoof']; // + title-screen Pokémon
  const sprites = await loadSpecies(first);
  prepareSprites(sprites, first);
  const ui = new UI();
  const game = new Game(document.getElementById('game'), sprites, ui);
  ui.bind(game);
  const flow = new Flow(game, ui);
  game.resize();
  flow.begin();
  game.run();
  if (import.meta.env.DEV) window.game = game;
}

main().catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre class="fatal">Failed to start: ${err.message}</pre>`);
});
