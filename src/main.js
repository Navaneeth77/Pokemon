import '@fontsource/pixelify-sans/500.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/luckiest-guy/400.css';
import './style.css';
import { preloadImpactSprite } from './effects.js';
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
  const first = [...spritesFor([...DEFAULT_TEAM, ...OPPONENT_TEAM]), 'pikachu', 'eevee', 'bidoof']; // + title-screen Pokémon
  const [sprites] = await Promise.all([loadSpecies(first),preloadImpactSprite().catch(()=>{})]);
  prepareSprites(sprites, first);
  const ui = new UI();
  const game = new Game(document.getElementById('game'), sprites, ui);
  ui.bind(game);
  const flow = new Flow(game, ui);
  game.resize();
  flow.begin();
  game.run();
  if(import.meta.env.DEV && new URLSearchParams(location.search).has('profile')) {
    game.profile=[];
    setInterval(()=>{
      if(game.profile.length<120 || document.hidden)return;
      const samples=game.profile.splice(0), q=(i,p)=>samples.map(v=>v[i]).sort((a,b)=>a-b)[Math.min(samples.length-1,Math.floor(samples.length*p))];
      console.info('FRAME_PROFILE',JSON.stringify({state:game.state,n:samples.length,frameP95:q(0,.95),frameMax:q(0,1),updateP95:q(1,.95),renderP95:q(2,.95)}));
    },10000);
  }
  if (import.meta.env.DEV) window.game = game;
}

main().catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre class="fatal">Failed to start: ${err.message}</pre>`);
});
