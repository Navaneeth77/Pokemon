import { MOVES } from './moves.js';
import { TYPE_COLORS } from './data/types.js';

// On-screen controls for touch devices: joystick, four moves, ultimate, dodge, Mega, team switch and pause.
// Pointer Events with capture, so several fingers work at once and a finger sliding off a button
// still releases it (charged moves fire on release, the joystick re-centres).
export const isTouchDevice = () => matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');

// Capture keeps a finger's events on its control even when it slides off; never let it block the action.
function capture(el, id) {
  try { el.setPointerCapture(id); } catch { /* pointer already gone */ }
}

const hpColor = r => (r > 0.5 ? '#46d36b' : r > 0.2 ? '#f4c430' : '#ec4b3c');

export class TouchControls {
  constructor(game, onPause) {
    this.game = game;
    this.root = document.getElementById('touch');
    this.root.innerHTML = `
      <button class="t-pause" aria-label="Pause">II</button>
      <div class="t-team"></div>
      <div class="t-joy"><div class="t-knob"></div></div>
      <div class="t-pad">
        <button class="t-btn t-ult"><b>ULT</b><small>0%</small></button>
        <button class="t-btn t-mega hidden"><b>MEGA</b></button>
        <button class="t-btn t-dodge"><b>DODGE</b></button>
        ${[0, 1, 2, 3].map(i => `<button class="t-btn t-move" data-i="${i}"><b>${i + 1}</b><small></small><i></i></button>`).join('')}
      </div>`;
    this.joy = this.root.querySelector('.t-joy');
    this.knob = this.root.querySelector('.t-knob');
    this.moves = [...this.root.querySelectorAll('.t-move')];
    this.ult = this.root.querySelector('.t-ult');
    this.mega = this.root.querySelector('.t-mega');
    this.team = this.root.querySelector('.t-team');
    this.root.addEventListener('contextmenu', e => e.preventDefault());
    this.bindJoystick();
    this.moves.forEach((b, i) => this.hold(b, () => game.playerPress(i), () => game.playerRelease(i)));
    this.hold(this.ult, () => game.playerUltimate());
    this.hold(this.root.querySelector('.t-dodge'), () => game.playerDodge());
    this.hold(this.mega, () => game.playerMega());
    this.hold(this.root.querySelector('.t-pause'), onPause);
    this.last = '';
  }

  hold(el, down, up) {
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      capture(el, e.pointerId);
      el.classList.add('down');
      down();
    });
    const end = () => {
      if (!el.classList.contains('down')) return;
      el.classList.remove('down');
      up?.();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  }

  bindJoystick() {
    const input = this.game.input;
    let id = null;
    const move = e => {
      const r = this.joy.getBoundingClientRect(), R = r.width / 2;
      let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
      const len = Math.hypot(dx, dy), max = R * 0.8;
      if (len > max) {
        dx *= max / len;
        dy *= max / len;
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      // Small dead zone so a resting thumb doesn't drift; otherwise analogue speed.
      const m = Math.hypot(dx, dy) / max;
      input.touch = m < 0.18 ? { x: 0, y: 0 } : { x: dx / max, y: dy / max };
    };
    const end = e => {
      if (e.pointerId !== id) return;
      id = null;
      this.knob.style.transform = '';
      input.touch = null;
    };
    this.joy.addEventListener('pointerdown', e => {
      e.preventDefault();
      id = e.pointerId;
      capture(this.joy, id);
      move(e);
    });
    this.joy.addEventListener('pointermove', e => { if (e.pointerId === id) move(e); });
    this.joy.addEventListener('pointerup', end);
    this.joy.addEventListener('pointercancel', end);
    this.joy.addEventListener('lostpointercapture', end);
  }

  // Team buttons are rebuilt when the team changes (3 or 6 members).
  buildTeam() {
    const g = this.game;
    this.team.innerHTML = g.playerTeam.members.map((m, i) => `<button class="t-mate" data-i="${i}"><img alt=""><i><b></b></i></button>`).join('');
    this.mates = [...this.team.querySelectorAll('.t-mate')];
    this.mates.forEach((b, i) => b.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (g.state === 'fighting') g.pickSwitch(i);
    }));
    this.teamRef = g.playerTeam;
  }

  update() {
    const g = this.game, show = ['fighting', 'intro'].includes(g.state) && !g.paused;
    this.root.classList.toggle('hidden', !show);
    if (!show) return;
    if (this.teamRef !== g.playerTeam) this.buildTeam();
    const p = g.player;
    const locked = g.state !== 'fighting' || !p.alive || g.switching;
    p.species.moves.forEach((id, i) => {
      const b = this.moves[i], m = MOVES[id], cd = g.moveCD(p, id);
      const key = `${id}|${Math.ceil(cd * 4)}|${locked}|${p.charging?.id === id}`;
      if (b.dataset.k === key) return;
      b.dataset.k = key;
      b.style.setProperty('--c', TYPE_COLORS[m.type][0]);
      b.querySelector('small').textContent = m.name;
      b.querySelector('i').style.height = `${Math.min(100, (cd / m.cooldown) * 100)}%`;
      b.classList.toggle('cool', cd > 0);
      b.classList.toggle('off', locked);
      b.classList.toggle('charging', p.charging?.id === id);
      b.classList.toggle('chargeable', !!m.chargeable);
    });
    const ult = Math.floor(p.ult);
    this.ult.querySelector('small').textContent = ult >= 100 ? 'READY!' : `${ult}%`;
    this.ult.classList.toggle('ready', ult >= 100);
    this.ult.style.setProperty('--fill', `${ult}%`);
    this.mega.classList.toggle('hidden', !p.species.mega?.length || p.isMega || g.playerTeam.megaUsed || (g.story && !g.story.playerMega));
    const cd = Math.ceil(g.switchCD);
    g.playerTeam.members.forEach((m, i) => {
      const b = this.mates[i];
      if (!b) return;
      const key = `${m.portrait.src}|${Math.ceil(m.hp)}|${i === g.playerTeam.index}|${cd}`;
      if (b.dataset.k === key) return;
      b.dataset.k = key;
      b.querySelector('img').src = m.portrait.src;
      const r = m.hp / m.maxHp;
      b.querySelector('b').style.width = `${r * 100}%`;
      b.querySelector('b').style.background = hpColor(r);
      b.classList.toggle('active', i === g.playerTeam.index);
      b.classList.toggle('fainted', !m.alive);
      b.classList.toggle('cool', cd > 0 && i !== g.playerTeam.index);
    });
  }
}
