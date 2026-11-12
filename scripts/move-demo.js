import '@fontsource/pixelify-sans/500.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/luckiest-guy/400.css';
import { loadSpecies } from '../src/assets.js';
import { BOUNDS, WORLD_H, WORLD_W } from '../src/arena.js';
import { setMuted } from '../src/audio.js';
import { movePool } from '../src/data/movepool.js';
import { DEFAULT_TEAM, OPPONENT_TEAM, ROSTER, SPECIES, spritesFor } from '../src/data/species.js';
import { TYPE_COLORS } from '../src/data/types.js';
import { Game, prepareSprites } from '../src/game.js';
import { MOVE_PRESENTATIONS } from '../src/move-presentation.js';
import { MOVES } from '../src/moves.js';
import { music } from '../src/music.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#game'), stage = $('#stage'), picker = $('#moves'), play = $('#play'), result = $('#result');
const examples = new Map([
  ['leafStorm', 'sceptile'], ['extremeSpeed', 'dragonite'], ['shadowBall', 'gengar'], ['energyBall', 'sceptile'],
  ['darkPulse', 'umbreon'], ['dragonPulse', 'dragonite'], ['waterPulse', 'blastoise'], ['dragonClaw', 'dragonite'],
  ['dragonDance', 'dragonite'], ['rainDance', 'blastoise'], ['stealthRock', 'garchomp'], ['pinMissile', 'jolteon'],
]);
const clashExamples = new Map([
  ['beam', { move: 'darkPulse', user: 'umbreon', foe: 'blastoise', reply: 'waterPulse', distance: 220, delay: 0.07 }],
  ['beam-win', { move: 'iceBeam', user: 'mamoswine', foe: 'metagross', reply: 'flashCannon', distance: 220 }],
  ['shots', { move: 'shadowBall', user: 'gengar', foe: 'gengar', reply: 'shadowBall', distance: 220 }],
  ['elements', { move: 'waterGun', user: 'blastoise', foe: 'charizard', reply: 'ember', distance: 220 }],
  ['block', { move: 'flamethrower', user: 'charizard', foe: 'alakazam', reply: 'shadowBall', distance: 140, delay: 0.15 }],
  ['spin', { move: 'rapidSpin', user: 'starmie', foe: 'alakazam', reply: 'shadowBall', distance: 180, spinAt: 110 }],
]);
const users = new Map();
for (const id of ROSTER) {
  for (const move of movePool(SPECIES[id])) {
    if (!users.has(move)) users.set(move, id);
  }
}
// These two regular variants have animations but no current roster loadout.
users.set('magnetBomb', 'magnezone');
users.set('geomancyAtk', 'xerneas');
const catalog = Object.values(MOVES).filter(move => move.presentation).sort((a, b) => a.name.localeCompare(b.name));
const buttons = new Map();
let pendingSpin = null;
let selected = 'leafStorm', game, pending = false, request = 0, elapsed = 0, cast = false, strafe = 1, lastResult = '';
const STEP = 1 / 60;

function speciesForMove(id) {
  const example = examples.get(id);
  return example && movePool(SPECIES[example]).includes(id) ? example : users.get(id);
}

for (const id of examples.keys()) {
  const move = MOVES[id];
  const button = document.createElement('button');
  const portrait = document.createElement('img');
  const text = document.createElement('span');
  const name = document.createElement('strong');
  const label = document.createElement('small');
  button.type = 'button';
  button.style.setProperty('--move-color', TYPE_COLORS[move.type][0]);
  portrait.src = `/sprites/${SPECIES[speciesForMove(id)].sprite}/portrait.png`;
  portrait.alt = '';
  name.textContent = move.name;
  label.textContent = MOVE_PRESENTATIONS[move.presentation].short;
  text.append(name, label);
  button.append(portrait, text);
  button.addEventListener('click', () => {
    $('#search').value = '';
    selectFromCatalog(id);
  });
  buttons.set(id, button);
  $('#examples').append(button);
}

function filter() {
  const query = $('#search').value.trim().toLowerCase();
  const groups = new Map();
  for (const move of catalog) {
    const style = MOVE_PRESENTATIONS[move.presentation].short;
    if (!`${move.name} ${move.type} ${move.cat} ${style}`.toLowerCase().includes(query)) continue;
    if (!groups.has(style)) {
      const group = document.createElement('optgroup');
      group.label = style;
      groups.set(style, group);
    }
    groups.get(style).append(new Option(move.name, move.id));
  }
  const count = [...groups.values()].reduce((total, group) => total + group.children.length, 0);
  $('#move-count').textContent = `${count} moves`;
  picker.replaceChildren(...groups.values());
  picker.disabled = !groups.size;
  if (!groups.size) picker.add(new Option('No matching moves'));
  if (picker.querySelector(`option[value="${selected}"]`)) picker.value = selected;
  else if (groups.size) {
    const hint = new Option('Choose a matching move…', '', true, true);
    hint.disabled = true;
    picker.prepend(hint);
    picker.value = '';
  }
}

function selectFromCatalog(id) {
  if (clashExamples.has($('#target').value)) $('#target').value = 'still';
  select(id, true);
}

function select(id, showArena = false) {
  selected = id;
  const move = MOVES[id], style = MOVE_PRESENTATIONS[move.presentation];
  $('#move-name').textContent = move.name;
  $('#move-style').textContent = style.short;
  $('#move-style').style.setProperty('--style-color', style.color);
  const clash = clashExamples.get($('#target').value);
  $('#description').textContent = clash ? `vs. ${SPECIES[clash.foe].name} using ${MOVES[clash.reply].name}` : move.tag ?? '';
  for (const [moveId, button] of buttons) button.setAttribute('aria-pressed', String(id === moveId));
  filter();
  if (showArena && matchMedia('(max-width: 740px)').matches) stage.scrollIntoView({ block: 'nearest' });
  void replay();
}

function previewDistance(move, mode) {
  if (mode === 'interrupt') return 43;
  const profile = move.targeting;
  if (profile?.kind === 'melee') return 42;
  if (profile?.kind === 'dash') return Math.min(130, profile.range - 12);
  if (profile?.kind === 'area') return Math.max(34, profile.range * 0.74);
  if (profile?.kind === 'stream') return Math.round(profile.range * 0.7);
  return Math.min(210, Math.round((profile?.range ?? 240) * 0.83));
}

async function replay() {
  if (!game) return;
  const token = ++request, id = selected, move = MOVES[id];
  const mode = $('#target').value, clash = clashExamples.get(mode);
  const species = clash?.user ?? speciesForMove(id);
  const foe = clash?.foe ?? 'snorlax';
  pendingSpin = null;
  pending = true;
  cast = false;
  play.disabled = true;
  result.value = `Preparing ${SPECIES[species].name}…`;
  try {
    await game.ensureSprites([species, foe]);
    if (token !== request) return;
    const focus = document.activeElement;
    game.startPractice([species], foe);
    focus?.focus({ preventScroll: true });
    Object.assign(game, { showcase: null, state: 'fighting', timers: [], effects: [] });
    game.hud.reset();
    for (const mon of [game.player, game.opponent]) Object.assign(mon, { hidden: false, appear: 0, item: null });
    game.red.hidden = game.gold.hidden = true;
    Object.assign(game.player, { x: 180, y: 488 });
    Object.assign(game.opponent, { x: 180, y: 488 - (clash?.distance ?? previewDistance(move, mode)) });
    elapsed = 0;
    strafe = 1;
    lastResult = `${SPECIES[species].name} used ${move.name}`;
    if (move.copy) game.lastUsed[game.opponent.side] = 'shadowBall';
    if (id === 'snore' || id === 'sleepTalk') game.player.status.sleep = 3;
    if (clash) {
      cast = clash.spinAt ? true : game.useMove(game.player, id, 0, true);
      pendingSpin = clash.spinAt ?? null;
      lastResult = `${move.name} vs. ${MOVES[clash.reply].name}`;
      const reply = () => game.useMove(game.opponent, clash.reply, 0, true);
      if (clash.delay) game.later(clash.delay, reply);
      else reply();
    } else {
      cast = id === 'sleepTalk'
        ? game.useMove(game.player, id, 0, true, 'tackle')
        : game.useMove(game.player, id);
    }
    result.value = cast ? lastResult : `${move.name} needs its battle condition.`;
    if (cast && mode === 'interrupt') game.later(0.18, () => game.useMove(game.opponent, 'tackle'));
  } catch (error) {
    if (token === request) result.value = `Could not load ${move.name}. Replay to retry.`;
    console.error(error);
  } finally {
    if (token === request) {
      pending = false;
      play.disabled = false;
    }
  }
}

$('#search').addEventListener('input', filter);
picker.addEventListener('change', () => { if (picker.value) selectFromCatalog(picker.value); });
play.addEventListener('click', replay);
$('#target').addEventListener('change', () => {
  select(clashExamples.get($('#target').value)?.move ?? selected);
});
$('#sound').addEventListener('change', e => setMuted(!e.target.checked));
setMuted(true);
music.enabled = false;

async function start() {
  const ids = spritesFor([...DEFAULT_TEAM, ...OPPONENT_TEAM, 'snorlax']);
  const [sprites] = await Promise.all([
    loadSpecies(ids),
    document.fonts.load('500 15px "Pixelify Sans"'),
    document.fonts.load('700 16px "Pixelify Sans"'),
    document.fonts.load('400 24px "Luckiest Guy"'),
  ]);
  prepareSprites(sprites, ids);
  const noop = () => {};
  const ui = new Proxy({ format: 1 }, { get: (target, key) => target[key] ?? noop });
  game = new Game(canvas, sprites, ui);
  game.on('clash', ({ label }) => {
    if (clashExamples.has($('#target').value)) result.value = `${lastResult} · ${label}`;
  });
  stage.style.removeProperty('height');
  stage.style.removeProperty('width');
  game.ai.update = game.ai.onThreat = noop;
  game.input.vector = () => ({ x: 0, y: 0 });
  game.resize = () => {
    const { clientWidth: width, clientHeight: height } = stage;
    if (!width || !height) return;
    const scale = Math.min(width / WORLD_W, height / WORLD_H);
    const k = Math.min(2, Math.max(1, scale * devicePixelRatio));
    game.k = k;
    game.view = { w: WORLD_W, h: WORLD_H, ox: 0, oy: 0 };
    canvas.width = Math.ceil(WORLD_W * k);
    canvas.height = Math.ceil(WORLD_H * k);
  };
  new ResizeObserver(() => game.resize()).observe(stage);
  game.resize();
  const requestedClash = new URLSearchParams(location.search).get('clash');
  if (clashExamples.has(requestedClash)) $('#target').value = requestedClash;
  select(clashExamples.get($('#target').value)?.move ?? selected);

  const slow = $('#slow'), loop = $('#loop'), search = $('#search'), target = $('#target');
  let previous = performance.now(), accumulated = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - previous) / 1000);
    previous = now;
    if (pending || !cast) { game.render(); return; }
    accumulated += dt * (slow.checked ? 0.45 : 1);
    while (accumulated >= STEP) {
      accumulated -= STEP;
      elapsed += STEP;
      if (target.value === 'strafe') {
        const foe = game.opponent;
        if (foe.x > BOUNDS.maxX - 35) strafe = -1;
        if (foe.x < BOUNDS.minX + 35) strafe = 1;
        foe.input.x = strafe;
      }
      if (pendingSpin && game.effects.some(e => e.isProjectile && !e.dead && e.user === game.opponent
        && game.player.distTo(e) < pendingSpin)) {
        game.useMove(game.player, selected, 0, true);
        pendingSpin = null;
      }
      game.update(STEP);
      if (elapsed >= 4.5 && loop.checked && document.activeElement !== search && document.activeElement !== picker) {
        void replay();
        break;
      }
    }
    if (elapsed >= 2 && result.value === lastResult) {
      const damage = Math.round(game.opponent.maxHp - game.opponent.hp);
      if (damage > 0) result.value = `${lastResult} · ${damage} damage`;
      else if (target.value === 'interrupt' && selected === 'dragonDance' && !game.player.stages.atk) result.value = 'Dragon Dance was interrupted.';
    }
    game.render();
  }
  requestAnimationFrame(frame);
}

filter();
start().catch(error => {
  result.value = 'Could not start the demo. Reload to retry.';
  console.error(error);
});
