import { MOVES } from './moves.js';
import { TYPE_COLORS } from './data/types.js';

// On-screen controls for touch devices.
// Left: a floating joystick — it appears where your thumb lands anywhere in the left half and follows
// the thumb when it slides past the edge. Right: the attack cluster (four moves around the ultimate)
// and, separate from it, the action buttons (Dodge, Mega). Team portraits switch Pokémon.
// Pointer Events with capture, so several fingers work at once and a finger sliding off a button still
// releases it (charged moves fire on release, the joystick lets go).
export const isTouchDevice = () => matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');

// Capture keeps a finger's events on its control even when it slides off; never let it block the action.
function capture(el, id) {
  try { el.setPointerCapture(id); } catch { /* pointer already gone */ }
}

const hpColor = r => (r > 0.5 ? '#46d36b' : r > 0.2 ? '#f4c430' : '#ec4b3c');
const JOY_R = 56; // how far the knob travels from the joystick centre (px)
const DEAD = 0.15; // a resting thumb doesn't drift

export class TouchControls {
  constructor(game, onPause) {
    this.game = game;
    this.root = document.getElementById('touch');
    this.root.innerHTML = `
      <button class="t-pause" aria-label="Pause">II</button>
      <div class="t-team"></div>
      <div class="t-zone"></div>
      <div class="t-joy"><div class="t-knob"></div><span class="t-joy-hint">MOVE</span></div>
      <div class="t-actions">
        <button class="t-act t-mega hidden"><b>MEGA</b><small>Evolve</small></button>
        <button class="t-act t-dodge"><b>DODGE</b><small></small><i></i></button>
      </div>
      <div class="t-pad">
        <button class="t-ult"><b>ULT</b><small>0%</small></button>
        ${[0, 1, 2, 3].map(i => `<button class="t-move" data-i="${i}"><span class="t-cd"></span><b></b><small></small><em>⚡</em></button>`).join('')}
      </div>`;
    this.zone = this.root.querySelector('.t-zone');
    this.joy = this.root.querySelector('.t-joy');
    this.knob = this.root.querySelector('.t-knob');
    this.moves = [...this.root.querySelectorAll('.t-move')];
    this.ult = this.root.querySelector('.t-ult');
    this.mega = this.root.querySelector('.t-mega');
    this.dodge = this.root.querySelector('.t-dodge');
    this.team = this.root.querySelector('.t-team');
    this.root.addEventListener('contextmenu', e => e.preventDefault());
    this.bindJoystick();
    this.moves.forEach((b, i) => this.hold(b, () => game.playerPress(i), () => game.playerRelease(i)));
    this.hold(this.ult, () => game.playerUltimate());
    this.hold(this.dodge, () => game.playerDodge());
    this.hold(this.mega, () => game.playerMega());
    this.hold(this.root.querySelector('.t-pause'), onPause);
  }

  hold(el, down, up) {
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      capture(el, e.pointerId);
      el.classList.add('down');
      navigator.vibrate?.(8); // a light tap you can feel, where supported
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

  // Floating joystick: the centre is wherever the thumb first touches; dragging past the edge pulls the
  // centre along, so the thumb never "runs out" of joystick and direction always follows the thumb.
  bindJoystick() {
    const input = this.game.input;
    let id = null, cx = 0, cy = 0;
    const place = () => {
      this.joy.style.left = `${cx}px`;
      this.joy.style.top = `${cy}px`;
    };
    const move = e => {
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > JOY_R) {
        cx += dx * (1 - JOY_R / len);
        cy += dy * (1 - JOY_R / len);
        dx = e.clientX - cx;
        dy = e.clientY - cy;
        place();
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const m = Math.min(1, Math.hypot(dx, dy) / JOY_R);
      input.touch = m < DEAD ? { x: 0, y: 0 } : { x: dx / JOY_R, y: dy / JOY_R };
    };
    const end = e => {
      if (e.pointerId !== id) return;
      id = null;
      this.knob.style.transform = '';
      this.joy.classList.remove('active');
      this.joy.style.left = this.joy.style.top = ''; // back to its resting spot as a hint
      input.touch = null;
    };
    this.zone.addEventListener('pointerdown', e => {
      if (id !== null) return;
      e.preventDefault();
      id = e.pointerId;
      capture(this.zone, id);
      cx = e.clientX;
      cy = e.clientY;
      this.joy.classList.add('active');
      place();
      move(e);
    });
    this.zone.addEventListener('pointermove', e => { if (e.pointerId === id) move(e); });
    this.zone.addEventListener('pointerup', end);
    this.zone.addEventListener('pointercancel', end);
    this.zone.addEventListener('lostpointercapture', end);
  }

  // Team buttons are rebuilt when the team changes (3 or 6 members).
  buildTeam() {
    const g = this.game;
    this.team.innerHTML = g.playerTeam.members.map((m, i) => `<button class="t-mate" data-i="${i}"><img alt=""><i><b></b></i><span></span></button>`).join('');
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
      const key = `${id}|${Math.ceil(cd * 10)}|${locked}|${p.charging?.id === id}`;
      if (b.dataset.k === key) return;
      b.dataset.k = key;
      const [c1, c2] = TYPE_COLORS[m.type];
      b.style.setProperty('--c', c1);
      b.style.setProperty('--c2', c2);
      b.style.setProperty('--cd', `${Math.min(100, (cd / m.cooldown) * 100)}%`);
      b.querySelector('b').textContent = cd > 0 ? cd.toFixed(cd < 1 ? 1 : 0) : '';
      b.querySelector('small').textContent = m.name;
      b.classList.toggle('cool', cd > 0);
      b.classList.toggle('off', locked);
      b.classList.toggle('charging', p.charging?.id === id);
      b.classList.toggle('chargeable', !!m.chargeable);
      b.classList.toggle('long', m.name.length > 10);
    });
    const ult = Math.floor(p.ult);
    this.ult.querySelector('small').textContent = ult >= 100 ? 'READY!' : `${ult}%`;
    this.ult.classList.toggle('ready', ult >= 100);
    this.ult.style.setProperty('--fill', `${ult}%`);
    const dcd = p.dodgeCD;
    this.dodge.querySelector('small').textContent = dcd > 0 ? `${dcd.toFixed(1)}s` : 'ready';
    this.dodge.style.setProperty('--cd', `${Math.max(0, Math.min(100, (dcd / 1.2) * 100))}%`);
    this.dodge.classList.toggle('cool', dcd > 0);
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
      b.querySelector('span').textContent = i === g.playerTeam.index ? '' : !m.alive ? '' : cd > 0 ? `${cd}` : '';
      b.classList.toggle('active', i === g.playerTeam.index);
      b.classList.toggle('fainted', !m.alive);
      b.classList.toggle('cool', cd > 0 && i !== g.playerTeam.index);
    });
  }
}
