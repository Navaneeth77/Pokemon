import { MOVES } from './moves.js';
import { TYPE_COLORS } from './data/types.js';
import { SPECIES, PLAYER_TEAM, OPPONENT_TEAM } from './data/species.js';
import { AnimatedSprite } from './sprite.js';
import { isMuted, setMuted } from './audio.js';

const $ = sel => document.querySelector(sel);
const hpColor = r => (r > 0.5 ? '#46d36b' : r > 0.2 ? '#f4c430' : '#ec4b3c');

export class UI {
  constructor() {
    this.moveEls = [];
    this.mates = [];
    this.menuCards = [];
    this.picks = [];
    this.logEl = $('#log');
    this.selectOverlay = $('#select-overlay');
    this.resultOverlay = $('#result-overlay');
    this.resultText = $('#result-text');
  }

  bind(game) {
    this.game = game;
    this.buildPicks(game);
    this.buildTeam(game);
    $('#start-btn').addEventListener('click', e => {
      e.currentTarget.blur();
      game.start();
    });
    for (const sel of ['#again-btn', '#restart-btn']) {
      $(sel).addEventListener('click', e => {
        e.currentTarget.blur();
        game.toSelect();
      });
    }
    this.megaBtn = $('#mega-btn');
    this.megaState = '';
    this.megaBtn.addEventListener('mousedown', e => e.preventDefault());
    this.megaBtn.addEventListener('click', () => game.playerMega());
    const mute = $('#mute-btn');
    mute.addEventListener('click', () => {
      setMuted(!isMuted());
      mute.textContent = isMuted() ? 'Sound: Off' : 'Sound: On';
      mute.blur();
    });
  }

  // Selection cards show each team member's own animated sprite.
  buildPicks(game) {
    PLAYER_TEAM.forEach((id, i) => {
      const s = SPECIES[id];
      const btn = document.createElement('button');
      btn.className = 'pick';
      btn.innerHTML = `<span class="lead-tag">LEAD</span><canvas width="96" height="96"></canvas>
        <span class="nm">${s.name}</span>
        <span class="tp">${s.types.map(t => `<i style="background:${TYPE_COLORS[t][1]}">${t.toUpperCase()}</i>`).join('')}</span>`;
      btn.addEventListener('click', () => this.selectLead(i));
      $('#picks').appendChild(btn);
      const sprite = new AnimatedSprite(game.sprites[s.sprite]);
      sprite.play(s.fly && sprite.has('Fly') ? 'Fly' : 'Idle', { force: true });
      this.picks.push({ btn, ctx: btn.querySelector('canvas').getContext('2d'), sprite, species: s });
    });
    $('#foe-team').innerHTML = OPPONENT_TEAM.map(id => {
      const s = SPECIES[id];
      return `<span class="foe-mon"><img src="/sprites/${s.sprite}/portrait.png" alt="">${s.name}</span>`;
    }).join('');
  }

  // Teammate cards appear twice: in the side panel and in the Q switch picker over the arena.
  buildTeam(game) {
    const card = (parent, i, key) => {
      const btn = document.createElement('button');
      btn.className = 'mate';
      btn.innerHTML = `${key ? `<span class="k">${i + 1}</span>` : ''}<img alt=""><span class="nm"></span><span class="bar"><i></i></span><span class="st"></span>`;
      btn.addEventListener('mousedown', e => e.preventDefault());
      btn.addEventListener('click', () => {
        if (game.state === 'fighting') game.pickSwitch(i);
      });
      parent.appendChild(btn);
      return { btn, img: btn.querySelector('img'), nm: btn.querySelector('.nm'), bar: btn.querySelector('.bar i'), st: btn.querySelector('.st'), last: '' };
    };
    game.playerTeam.members.forEach((m, i) => {
      this.mates.push(card($('#team'), i, false));
      this.menuCards.push(card($('#sm-list'), i, true));
    });
    this.switchLabel = $('#switch-cd');
    this.menuLabel = $('#sm-cd');
  }

  showSwitchMenu(open) {
    $('#switch-menu').classList.toggle('hidden', !open);
  }

  selectLead(i) {
    this.game.lead = i;
    this.picks.forEach((p, k) => p.btn.classList.toggle('sel', k === i));
    this.setActive(this.game.playerTeam.members[i]);
  }

  showSelect(lead) {
    this.selectLead(lead);
    this.selectOverlay.classList.remove('hidden');
    this.resultOverlay.classList.add('hidden');
  }

  onStart() {
    this.selectOverlay.classList.add('hidden');
    this.resultOverlay.classList.add('hidden');
    this.logEl.innerHTML = '';
  }

  // Rebuilds the four move buttons for the active Pokémon.
  setActive(mon) {
    const box = $('#moves');
    box.innerHTML = '';
    this.moveEls = mon.species.moves.map((id, i) => {
      const m = MOVES[id];
      const [c1, c2] = TYPE_COLORS[m.type];
      const btn = document.createElement('button');
      btn.className = 'move';
      btn.style.setProperty('--c1', c1);
      btn.style.setProperty('--c2', c2);
      btn.innerHTML = `<span class="key">${i + 1}</span>
        <span class="info"><span class="name">${m.name}</span><span class="meta">${m.tag}</span></span>
        <span class="type">${m.type.toUpperCase()}</span><span class="cd"></span><span class="cdt"></span>`;
      btn.addEventListener('mousedown', e => e.preventDefault());
      btn.addEventListener('click', () => this.game.playerMove(i));
      box.appendChild(btn);
      return { btn, id, cd: btn.querySelector('.cd'), cdt: btn.querySelector('.cdt'), last: '' };
    });
  }

  showResult(win) {
    this.resultText.innerHTML = win
      ? '<b class="win">Victory!</b>Gold is out of usable Pokémon.'
      : '<b class="lose">Defeat…</b>All of your Pokémon fainted.';
    this.resultOverlay.classList.remove('hidden');
  }

  log(text, side = '') {
    const el = document.createElement('div');
    el.className = `entry ${side}`;
    el.textContent = text;
    this.logEl.prepend(el);
    while (this.logEl.children.length > 7) this.logEl.lastChild.remove();
  }

  pressed(i, ok) {
    const el = this.moveEls[i]?.btn;
    if (!el) return;
    el.classList.remove('flash', 'denied');
    void el.offsetWidth;
    el.classList.add(ok ? 'flash' : 'denied');
  }

  drawPicks(dt) {
    for (const p of this.picks) {
      p.sprite.update(dt);
      const c = p.ctx, s = p.species;
      const scale = Math.min(2, 70 / (s.headZ + 10));
      c.clearRect(0, 0, 96, 96);
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.beginPath();
      c.ellipse(48, 86, s.shadow[0] * scale, s.shadow[1] * scale, 0, 0, Math.PI * 2);
      c.fill();
      p.sprite.draw(c, 48, 86 - (s.fly ? 12 * scale : 0), 0, { scale });
    }
  }

  update(game, dt) {
    if (game.state === 'select') {
      this.drawPicks(dt);
      return;
    }
    const p = game.player;
    const locked = game.state !== 'fighting' || p.frozen > 0 || !p.alive || game.switching;
    for (const m of this.moveEls) {
      const cd = p.cooldown(m.id);
      const key = `${locked ? 1 : 0}|${Math.ceil(cd * 10)}`;
      if (key === m.last) continue;
      m.last = key;
      m.cd.style.height = `${(cd / MOVES[m.id].cooldown) * 100}%`;
      m.cdt.textContent = cd > 0 ? `${cd.toFixed(1)}s` : '';
      m.btn.classList.toggle('cooling', cd > 0);
      m.btn.classList.toggle('locked', locked);
    }

    const used = game.playerTeam.megaUsed;
    const mega = !p.species.mega && !p.isMega ? 'hidden' : used ? 'used' : !locked && !game.cinematic ? 'ready' : 'locked';
    const megaKey = `${mega}|${p.species.id}`;
    if (megaKey !== this.megaState) {
      this.megaState = megaKey;
      this.megaBtn.className = `mega-btn ${mega}`;
      this.megaBtn.querySelector('.meta').textContent = p.isMega ? `${p.baseSpecies.name} has Mega Evolved`
        : used ? 'Already used this battle (one per team)' : `Once per battle · becomes ${SPECIES[p.species.mega].name}`;
    }

    const cd = Math.ceil(game.switchCD);
    const canSwitch = game.state === 'fighting' && !game.switching && cd <= 0;
    game.playerTeam.members.forEach((m, i) => {
      const active = i === game.playerTeam.index;
      const status = active ? 'ACTIVE' : !m.alive ? 'FAINTED' : cd > 0 ? `${cd}s` : canSwitch ? 'SWITCH' : '—';
      const key = `${m.portrait.src}|${Math.ceil(m.hp)}|${status}`;
      for (const el of [this.mates[i], this.menuCards[i]]) {
        if (key === el.last) continue;
        el.last = key;
        el.img.src = m.portrait.src;
        el.nm.textContent = m.species.name.replace('Mega ', 'M. ');
        const r = m.hp / m.maxHp;
        el.bar.style.width = `${r * 100}%`;
        el.bar.style.background = hpColor(r);
        el.st.textContent = status;
        el.btn.className = `mate ${active ? 'active' : !m.alive ? 'fainted' : status === 'SWITCH' ? 'ready' : 'cooling'}`;
      }
    });
    this.menuLabel.textContent = cd > 0 ? `ready in ${cd}s` : '';
    const label = cd > 0 ? `Switch ready in ${cd}s` : canSwitch ? 'Switch ready · Q' : 'Switching…';
    if (this.switchLabel.textContent !== label) {
      this.switchLabel.textContent = label;
      this.switchLabel.classList.toggle('ready', cd <= 0 && canSwitch);
    }
  }
}
