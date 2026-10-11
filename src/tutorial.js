import { drawBust } from './trainers.js';
import { SWITCH_COOLDOWN } from './game.js';
import { sfx } from './audio.js';
import { MOVES } from './moves.js';

// Interactive tutorial over a practice battle (see Game.startPractice): a dialogue box explains one
// mechanic per step, and each step has a small live objective that ticks off when the player does it.
const touch = () => document.body.classList.contains('touch');
const k = (...keys) => keys.map(x => `<kbd>${x}</kbd>`).join(' ');
const MOVE_SEQ = [['W', 'up', 0, -1], ['A', 'left', -1, 0], ['S', 'down', 0, 1], ['D', 'right', 1, 0]];
const ARROW = { up: '▲', down: '▼', left: '◀', right: '▶' };

function steps(name) {
  return [
    {
      title: 'WELCOME', text: `Welcome to Pokémon: Chaos Arena, ${name}! You'll command a team of Pokémon in real-time battles. Let's warm up against a practice Snorlax — it won't fight back.`,
    },
    {
      title: 'MOVEMENT', goal: 'Move around the arena',
      text: touch() ? 'Drag the joystick on the left to move. Your Pokémon turns to face the foe while it stands still.'
        : 'Use W A S D or the arrow keys to move. Your Pokémon turns to face the foe while it stands still.',
      keys: touch() ? '🕹️ joystick' : `${k('W', 'A', 'S', 'D')} or ${k('↑', '←', '↓', '→')}`,
      start: t => {
        t.sub = 0;
        t.from = { x: t.game.player.x, y: t.game.player.y };
      },
      check: t => {
        const p = t.game.player, [, , dx, dy] = MOVE_SEQ[t.sub] ?? MOVE_SEQ[0];
        if ((p.x - t.from.x) * dx + (p.y - t.from.y) * dy > 28) {
          t.sub++;
          t.from = { x: p.x, y: p.y };
          sfx.shard();
        }
        return t.sub >= MOVE_SEQ.length;
      },
      hint: t => {
        const [key, word, dx, dy] = MOVE_SEQ[t.sub];
        return touch() ? { key: '🕹️', label: `Push the joystick ${word}`, el: '.t-joy' } : { key, label: `to move ${word}`, mon: true, dx, dy };
      },
    },
    {
      title: 'ATTACKING', goal: 'Hit the practice Snorlax',
      text: touch() ? 'Tap the four move buttons to attack. Moves marked ⚡ can be held to charge for more power — release to fire.'
        : 'Press 1–4 (or click the move buttons on the right) to attack. Moves marked ⚡ HOLD can be held to charge, then released for more power.',
      keys: touch() ? '① ② ③ ④ buttons' : `${k('1')} ${k('2')} ${k('3')} ${k('4')}`,
      start: t => { t.hp0 = t.game.opponent.hp; },
      check: t => t.game.opponent.hp < t.hp0,
      hint: t => ({ key: '1', label: `to use ${MOVES[t.game.player.species.moves[0]].name}`, el: touch() ? '.t-move[data-i="0"]' : '#moves .move' }),
    },
    {
      title: 'ULTIMATE', goal: 'Unleash the ultimate',
      text: `The gold meter under your HP bar fills as you deal and take damage, dodge attacks and finish combos. At 100% press ${touch() ? 'the ULT button' : 'R or 5'} for a cinematic ultimate that can't be dodged. I've filled it for you — try it!`,
      keys: touch() ? 'ULT button' : `${k('R')} or ${k('5')}`,
      start: t => { t.game.player.ult = 100; },
      check: t => t.game.cinematic?.kind === 'ult' || !!t.game.player.action?.move.ultimate,
      hint: () => ({ key: 'R', label: 'to unleash your ultimate', el: touch() ? '.t-ult' : '#ult-btn' }),
    },
    {
      title: 'DODGING', goal: 'Perform a dodge',
      text: `Press ${touch() ? 'DODGE' : 'Space'} to dash in the direction you're moving (or away from the foe when standing still). You're invulnerable for a split second, then it recharges for 1.6s.`,
      keys: touch() ? 'DODGE button' : `${k('Space')} + direction`,
      check: t => t.game.player.dodgeT > 0,
      hint: () => (touch() ? { key: 'DODGE', label: 'Tap to dodge', el: '.t-dodge' } : { key: 'SPACE', label: 'to dodge', mon: true, dx: 0, dy: -1 }),
    },
    {
      title: 'SWITCHING', goal: 'Switch to another Pokémon',
      text: touch() ? `Tap a team button above the controls to swap Pokémon. Manual switches share a ${SWITCH_COOLDOWN}s cooldown; when one faints, the next comes in for free. HP is kept between switches.`
        : `Press Q to open the switch menu, then a number key (or click a teammate in the panel). Manual switches share a ${SWITCH_COOLDOWN}s cooldown; a fainted Pokémon is replaced for free. HP is kept between switches.`,
      keys: touch() ? 'team buttons' : `${k('Q')} then ${k('1')}–${k('3')}`,
      start: t => { t.game.switchCD = 0; t.index0 = t.game.playerTeam.index; },
      check: t => t.game.playerTeam.index !== t.index0,
      hint: t => {
        if (touch()) return { key: '👆', label: 'Tap a teammate to switch', el: '.t-mate:not(.active)' };
        if (t.game.switchMenu) return { key: '2', label: 'to pick a teammate', el: '#sm-list .mate:nth-child(2)' };
        return { key: 'Q', label: 'to open the switch menu', mon: true, dx: 0, dy: -1 };
      },
    },
    {
      title: 'ADVANCED COMBAT', goal: 'Launch Snorlax into the air',
      text: 'Heavy moves knock foes back and launchers send them airborne — follow up for an AIR COMBO (up to 3 hits). Chain quick → heavy moves for combo bonuses. Attacks that meet react by element: fire melts ice, water douses fire, electric supercharges water!',
      keys: 'try Earthquake, Iron Tail, Volt Tackle or Extreme Speed',
      check: t => !!t.game.opponent.air,
      hint: t => {
        const moves = t.game.player.species.moves, i = moves.findIndex(id => MOVES[id].launch);
        if (i < 0) return null;
        return { key: String(i + 1), label: `to launch with ${MOVES[moves[i]].name}`, el: touch() ? `.t-move[data-i="${i}"]` : `#moves .move:nth-child(${i + 1})` };
      },
    },
    { title: 'TRAINER READY', text: `Great work, ${name}! Next, pick your battle format, arena and team. Good luck in the Chaos Arena!`, final: true },
  ];
}

export class Tutorial {
  constructor(game, onDone) {
    this.game = game;
    this.onDone = onDone;
    this.box = document.getElementById('tutorial');
    this.coach = document.createElement('div');
    this.coach.className = 'coach hidden';
    document.body.appendChild(this.coach);
    this.onKey = this.onKey.bind(this);
  }

  begin(name, look) {
    this.name = name;
    this.look = look;
    this.steps = steps(name);
    this.i = 0;
    this.active = true;
    this.box.classList.remove('hidden');
    window.addEventListener('keydown', this.onKey, true);
    this.show();
    const loop = () => {
      if (!this.active) return;
      requestAnimationFrame(loop);
      this.tick();
    };
    requestAnimationFrame(loop);
  }

  show() {
    const s = this.steps[this.i], n = this.steps.length;
    this.typed = 0;
    this.done = !s.check;
    s.start?.(this);
    const dots = this.steps.map((_, j) => `<i class="${j < this.i ? 'past' : j === this.i ? 'now' : ''}"></i>`).join('');
    this.box.innerHTML = `
      <div class="tut-head"><span>STEP ${this.i + 1}/${n} · ${s.title}</span><span class="dots">${dots}</span></div>
      <div class="tut-body"><canvas class="tut-face" width="24" height="24"></canvas>
        <div><p class="tut-text"></p>${s.keys ? `<div class="tut-keys">${s.keys}</div>` : ''}
        ${s.goal ? `<div class="tut-goal">TRY IT: ${s.goal} <b></b></div>` : ''}</div></div>
      <div class="tut-btns">
        <button class="px-btn" data-a="back" ${this.i === 0 ? 'disabled' : ''}>◀ BACK</button>
        <button class="px-btn" data-a="skip">SKIP TUTORIAL</button>
        <button class="px-btn primary" data-a="next">${s.final ? 'START BATTLE ▶' : 'NEXT ▶'}</button>
      </div>`;
    const face = this.box.querySelector('.tut-face').getContext('2d');
    face.drawImage(drawBust(this.look), 0, 0);
    this.text = this.box.querySelector('.tut-text');
    this.box.querySelector('.tut-text').addEventListener('click', () => { this.typed = Infinity; });
    for (const b of this.box.querySelectorAll('button')) {
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('click', () => this.act(b.dataset.a));
    }
  }

  act(a) {
    sfx.sendOut();
    if (a === 'back' && this.i > 0) {
      this.i--;
      this.show();
    } else if (a === 'next') {
      if (this.i === this.steps.length - 1) this.finish(false);
      else {
        this.i++;
        this.show();
      }
    } else if (a === 'skip') this.finish(true);
  }

  // Enter = next, Backspace = back; the rest of the keys keep driving the practice battle.
  onKey(e) {
    if (!this.active || e.target.tagName === 'INPUT') return;
    if (e.code === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (this.typed < this.steps[this.i].text.length) this.typed = Infinity;
      else this.act('next');
    } else if (e.code === 'Backspace') {
      e.preventDefault();
      this.act('back');
    }
  }

  // Keeps the dialogue over the arena (the main view) and the coach prompt on its target.
  // Layout: where the prompt sits relative to the point (above / below / leftOf / rightOf) and which way its arrow points.
  place() {
    const g = this.game, r = g.canvas.getBoundingClientRect(), v = g.view, sc = r.width / v.w;
    // Wide screens: in the open scenery left of the arena. Otherwise: across the top of the arena,
    // clear of both Pokémon (the practice target stands lower down).
    const side = v.ox * sc - 24;
    if (side >= 300) {
      const w = Math.min(420, side);
      Object.assign(this.box.style, { left: `${r.left + v.ox * sc - w - 12}px`, width: `${w}px`, top: `${r.top + (v.oy + 140) * sc}px` });
    } else {
      Object.assign(this.box.style, { left: `${r.left + (v.ox + 10) * sc}px`, width: `${340 * sc}px`, top: `${r.top + (v.oy + 60) * sc}px` });
    }
    const s = this.steps[this.i], h = !this.done && s.hint?.(this);
    if (!h) {
      this.coach.classList.add('hidden');
      return;
    }
    const target = h.el && document.querySelector(h.el);
    let x, y, layout, glyph;
    if (target && target.offsetParent !== null) {
      const b = target.getBoundingClientRect();
      if (b.left > window.innerWidth * 0.6) [x, y, layout, glyph] = [b.left - 6, b.top + b.height / 2, 'leftOf', ARROW.right];
      else if (b.top > window.innerHeight * 0.5) [x, y, layout, glyph] = [b.left + b.width / 2, b.top - 6, 'above', ARROW.down];
      else [x, y, layout, glyph] = [b.left + b.width / 2, b.bottom + 6, 'below', ARROW.up];
    } else {
      const p = g.player, pos = g.toScreen(p.x, p.y - p.bodyZ / 2), off = 26 * pos.scale, dx = h.dx ?? 0, dy = h.dy ?? 0;
      if (MOVE_SEQ.some(m => m[0] === h.key)) {
        // Movement: an arrow beside the Pokémon pointing the way to go.
        x = pos.x + dx * off;
        y = pos.y + dy * off;
        layout = dx > 0 ? 'rightOf' : dx < 0 ? 'leftOf' : dy > 0 ? 'below' : 'above';
        glyph = ARROW[dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up'];
      } else {
        const head = g.toScreen(p.x, p.y - p.headZ - 6);
        [x, y, layout, glyph] = [head.x, head.y, 'above', ARROW.down];
      }
    }
    const word = touch() || !/^[A-Z0-9]+$/.test(h.key) ? '' : 'PRESS ';
    const html = `<span class="coach-bubble">${word}<kbd>${h.key}</kbd> ${h.label}</span><span class="coach-arrow">${glyph}</span>`;
    if (this.coach.dataset.html !== html) {
      this.coach.innerHTML = html;
      this.coach.dataset.html = html;
    }
    this.coach.className = `coach ${layout}`;
    Object.assign(this.coach.style, { left: `${x}px`, top: `${y}px` });
  }

  tick() {
    this.place();
    const s = this.steps[this.i];
    // Classic letter-by-letter text; click or Enter shows it all at once.
    const shown = Math.min(s.text.length, Math.floor(this.typed));
    if (this.text.textContent.length !== shown) this.text.textContent = s.text.slice(0, shown);
    if (this.typed < s.text.length) this.typed += 1.2;
    if (!this.done && s.check?.(this)) {
      this.done = true;
      const goal = this.box.querySelector('.tut-goal');
      goal?.classList.add('ok');
      if (goal) goal.querySelector('b').textContent = '✓ DONE!';
      sfx.megaBurst();
    }
  }

  finish(skipped) {
    this.active = false;
    this.box.classList.add('hidden');
    this.coach.classList.add('hidden');
    window.removeEventListener('keydown', this.onKey, true);
    this.onDone(skipped);
  }
}
