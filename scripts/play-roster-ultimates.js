// Dev-only playback on the game's own canvas and HUD.
import { releaseSpriteSet } from '../src/assets.js';
import { ROSTER, SPECIES, spritesFor } from '../src/data/species.js';
import { MOVES } from '../src/moves.js';
import { setMuted } from '../src/audio.js';
import { music } from '../src/music.js';
import './ultimate-demo.css';

const SHOWCASE = [
  'greninja', 'lucario', 'gardevoir', 'cinderace', 'sceptile', 'dragapult', 'inteleon', 'decidueye',
  'florges', 'gyarados', 'rillaboom', 'tinkaton', 'aegislash', 'sylveon', 'lapras', 'blaziken',
  'metagross', 'umbreon', 'swampert', 'milotic', 'zoroark', 'alakazam', 'yveltal', 'suicune', 'latias',
  'celebi', 'deoxys', 'arceus', 'victini', 'keldeo', 'genesect', 'diancie', 'volcanion', 'groudon',
  'darkrai', 'regieleki', 'floetteEternal',
];
const STEP = 1 / 60;
const HOLD = 0.11;

export function playRosterUltimates(game, requestedSpeed, requestedSpecies) {
  const roster = [...new Set([...SHOWCASE.filter(id => ROSTER.includes(id)), ...ROSTER])];
  const representatives = new Map();
  for (const id of roster) {
    const ultimate = SPECIES[id].ultimate;
    if (!representatives.has(ultimate) || id === requestedSpecies) representatives.set(ultimate, id);
  }
  const queue = [...representatives.values()];
  const preload = new Map();
  const retained = new Set([...Object.keys(game.sprites), ...spritesFor(['snorlax'])]);
  const controls = document.createElement('aside');
  controls.className = 'ultimate-demo-controls';
  controls.setAttribute('aria-label', 'Ultimate demo');
  controls.innerHTML = `
    <output></output>
    <div>
      <button type="button" data-demo="prev" aria-label="Previous ultimate">←</button>
      <button type="button" data-demo="pause">Pause</button>
      <button type="button" data-demo="replay">Replay</button>
      <button type="button" data-demo="next" aria-label="Next ultimate">→</button>
      <span></span>
    </div>`;
  document.body.append(controls);
  const location = controls.querySelector('output');
  const pauseButton = controls.querySelector('[data-demo="pause"]');
  const replayButton = controls.querySelector('[data-demo="replay"]');
  const keys = controls.querySelector('span');
  const speed = Number(requestedSpeed);
  let rate = Number.isFinite(speed) && speed > 0 ? Math.min(speed, 24) : 1;
  const requestedTime = new URLSearchParams(window.location.search).get('at');
  let pauseAt = requestedTime === null ? Infinity : Number(requestedTime);
  let paused = false;
  let current = null;
  let pending = -1;
  let serial = 0;
  let nextAt = 0;
  let last = performance.now();
  let balance = 0;
  let complete = false;
  const played = new Set();
  const failed = new Set();

  setMuted(true);
  music.enabled = false;
  game.ai.update = () => {};
  game.ai.onThreat = () => {};
  game.input.vector = () => ({ x: 0, y: 0 });

  function updateControls() {
    pauseButton.textContent = paused ? 'Resume' : 'Pause';
    replayButton.textContent = 'Replay';
    keys.textContent = `${rate}×`;
  }

  function load(index) {
    const id = queue[index];
    if (!id) return;
    if (!preload.has(id)) {
      preload.set(id, game.ensureSprites([id, 'snorlax']).then(() => null, error => error));
    }
    return preload.get(id);
  }

  async function begin(index) {
    if (!queue[index]) return;
    const token = ++serial;
    pending = index;
    complete = false;
    balance = 0;
    const id = queue[index], species = SPECIES[id], move = MOVES[species.ultimate];
    location.textContent = `Loading ${index + 1}/${queue.length} · ${species.name}`;
    const error = await load(index);
    if (serial !== token) return;
    pending = -1;
    if (error) {
      failed.add(index);
      console.error('Could not load ultimate demo sprites', id, error);
      preload.delete(id);
      if (index + 1 < queue.length) return void begin(index + 1);
      return finish();
    }

    const previous = current?.id;
    game.startPractice([id]);
    Object.assign(game, { state: 'fighting', timers: [], effects: [], paused: false });
    game.hud.reset();
    Object.assign(game.player, { x: 180, y: 475, ult: 100, hidden: false, appear: 0, item: null });
    Object.assign(game.opponent, { x: 180, y: 275, hp: 50000, hidden: false, appear: 0, item: null });
    game.red.hidden = game.gold.hidden = true;

    if (previous && previous !== id) {
      const folders = new Set(spritesFor([id]));
      for (const folder of spritesFor([previous])) {
        if (retained.has(folder) || folders.has(folder)) continue;
        delete game.sprites[folder];
        releaseSpriteSet(folder);
      }
      preload.delete(previous);
    }
    for (let offset = 1; offset <= 3; offset++) load(index + offset);

    current = { index, id, elapsed: 0, actionSeen: false, done: false };
    location.textContent = `Ultimate ${index + 1}/${queue.length} · ${move.name}`;
    document.title = `${index + 1}/${queue.length} · ${move.name} · Chaos Arena`;
    game.useMove(game.player, species.ultimate, 0, true);
  }

  function finish() {
    complete = true;
    location.textContent = `${played.size}/${queue.length} ultimates played${failed.size ? ` · ${failed.size} failed` : ''}`;
    document.title = location.textContent + ' · Chaos Arena';
    game.ui.log(location.textContent);
    replayButton.textContent = 'Replay all ultimates';
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.max(0, Math.min(0.075, (now - last) / 1000));
    last = now;
    if (document.hidden) return;
    if (!current || pending >= 0 || paused || complete) {
      if (current) game.render();
      return;
    }
    if (current.done) {
      game.render();
      if (now >= nextAt) {
        if (current.index + 1 < queue.length) void begin(current.index + 1);
        else finish();
      }
      return;
    }

    balance += dt * rate;
    while (balance >= STEP && !current.done) {
      game.update(STEP);
      balance -= STEP;
      current.elapsed += STEP;
      if (!game.cinematic && game.player.action?.t >= pauseAt) {
        pauseAt = Infinity;
        paused = true;
        updateControls();
        document.title += ' · frame';
        break;
      }
      current.actionSeen ||= !!game.player.action;
      if (current.actionSeen && (game.player.action?.done || !game.player.action) && !game.cinematic
        && !game.effects.some(effect => effect.finishInDemo && !effect.dead)) {
        played.add(current.index);
        failed.delete(current.index);
        current.done = true;
      } else if (current.elapsed > 18) {
        failed.add(current.index);
        current.done = true;
        console.error('Ultimate demo timed out', current.id);
      }
    }
    if (current.done) nextAt = now + HOLD * 1000;
    game.render();
  }

  function togglePause() {
    paused = !paused;
    updateControls();
  }

  function replay() {
    const start = complete;
    if (start) {
      played.clear();
      failed.clear();
    }
    void begin(start ? 0 : pending >= 0 ? pending : current?.index ?? 0);
  }

  const step = offset => {
    const index = pending >= 0 ? pending : current?.index ?? 0;
    void begin(Math.max(0, Math.min(queue.length - 1, index + offset)));
  };
  controls.querySelector('[data-demo="prev"]').addEventListener('click', () => step(-1));
  controls.querySelector('[data-demo="next"]').addEventListener('click', () => step(1));
  pauseButton.addEventListener('click', togglePause);
  replayButton.addEventListener('click', replay);
  window.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    const actions = {
      p: togglePause,
      arrowleft: () => step(-1),
      arrowright: () => step(1),
      '-': () => { rate = Math.max(1, rate / 2); updateControls(); },
      '+': () => { rate = Math.min(24, rate * 2); updateControls(); },
      '=': () => { rate = Math.min(24, rate * 2); updateControls(); },
      escape: () => window.location.assign(window.location.pathname),
    };
    if (!actions[key]) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) actions[key]();
  }, { capture: true });

  updateControls();
  void begin(Math.max(0, queue.indexOf(requestedSpecies)));
  requestAnimationFrame(frame);
}
