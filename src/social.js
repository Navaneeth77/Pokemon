// Social: watching live battles, friends (by friend code) with room invites, and quick chat in online
// battles. Friend codes come from the match server; the friend list itself lives in this browser.
import { SPECIES } from './data/species.js';
import { safeName } from './names.js';

const FRIENDS_KEY = 'msb.friends';
export const EMOTES = ['Good luck!', 'Nice move!', 'Wow!', 'Oops!', 'So close!', 'Well played!', 'Thanks!', 'Rematch?'];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const portrait = id => (SPECIES[id] ? `/sprites/${SPECIES[id].sprite}/portrait.png` : '');

export class Social {
  constructor(flow) {
    this.flow = flow;
    this.status = new Map();
  }

  get friends() {
    try { return JSON.parse(localStorage.getItem(FRIENDS_KEY)) ?? []; } catch { return []; }
  }

  set friends(list) {
    try { localStorage.setItem(FRIENDS_KEY, JSON.stringify(list.slice(0, 50))); } catch { /* storage blocked */ }
  }

  panel(title, html, wire) {
    document.querySelector('.social-overlay')?.remove();
    const el = document.createElement('div');
    el.className = 'social-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', title);
    el.innerHTML = `<section><header><h2>${title}</h2><button class="kit-x" data-close aria-label="Close">×</button></header>${html}</section>`;
    el.querySelector('[data-close]').onclick = () => el.remove();
    el.addEventListener('click', e => e.target === el && el.remove());
    el.addEventListener('keydown', e => e.key === 'Escape' && el.remove());
    document.body.appendChild(el);
    wire?.(el);
    return el;
  }

  toast(html, actions = []) {
    document.querySelector('.social-toast')?.remove();
    const el = document.createElement('div');
    el.className = 'social-toast';
    el.innerHTML = `<span>${html}</span>${actions.map((a, i) => `<button data-i="${i}">${a[0]}</button>`).join('')}`;
    el.querySelectorAll('button').forEach(b => (b.onclick = () => { el.remove(); actions[+b.dataset.i][1](); }));
    document.body.appendChild(el);
    setTimeout(() => el.remove(), actions.length ? 15000 : 3500);
  }

  // ── Live battles ──
  async openLive() {
    const el = this.panel('WATCH LIVE', '<p class="social-note">Finding battles…</p>');
    let list = [];
    try { list = await this.flow.mm.liveList(); } catch { /* offline */ }
    if (!el.isConnected) return;
    const row = b => `<li><span class="lv-mons"><img src="${portrait(b.A.lead)}" alt=""><i>VS</i><img src="${portrait(b.B.lead)}" alt=""></span>
      <span class="lv-who"><b>${esc(safeName(b.A.name))} vs ${esc(safeName(b.B.name))}</b><small>${b.draft ? 'Draft' : `${b.format}v${b.format}`} · ${b.ranked ? 'Ranked' : 'Casual'} · ${Math.floor(b.time / 60)}:${String(b.time % 60).padStart(2, '0')}${b.watching ? ` · ${b.watching} watching` : ''}</small></span>
      <button class="px-btn small" data-watch="${esc(b.id)}">WATCH</button></li>`;
    el.querySelector('.social-note').remove();
    el.querySelector('section').insertAdjacentHTML('beforeend', list.length ? `<ul class="social-list">${list.map(row).join('')}</ul>` : '<p class="social-note">No battles are on right now. Check back soon!</p>');
    el.querySelectorAll('[data-watch]').forEach(b => (b.onclick = () => { el.remove(); this.flow.mm.watch(b.dataset.watch); }));
  }

  // ── Friends ──
  async openFriends() {
    const el = this.panel('FRIENDS', '<p class="social-note">Connecting…</p>');
    try { await this.flow.mm.connect(); } catch { /* shown below */ }
    if (!el.isConnected) return;
    this.friendsEl = el;
    this.renderFriends();
    this.refresh();
  }

  refresh() {
    const codes = this.friends.map(f => f.code);
    if (codes.length) this.flow.mm.send({ t: 'friends', codes });
  }

  renderFriends() {
    const el = this.friendsEl;
    if (!el?.isConnected) return;
    const code = this.flow.mm.friendCode, list = this.friends;
    const row = f => {
      const s = this.status.get(f.code);
      return `<li><span class="lv-who"><b>${esc(s?.name ?? f.name ?? 'Friend')} <code>${esc(f.code)}</code></b><small class="${s ? 'on' : ''}">${s ? esc(s.where) : 'Offline'}</small></span>
        ${s?.match ? `<button class="px-btn small" data-watch="${esc(s.match)}">WATCH</button>` : ''}${s ? `<button class="px-btn small" data-invite="${esc(f.code)}">INVITE</button>` : ''}
        <button class="px-btn small" data-remove="${esc(f.code)}" aria-label="Remove friend">×</button></li>`;
    };
    el.querySelector('section').innerHTML = `<header><h2>FRIENDS</h2><button class="kit-x" data-close aria-label="Close">×</button></header>
      <p class="social-code">Your friend code: <b>${code ? esc(code) : '—'}</b>${code ? '' : ' <small>(the match server is offline)</small>'}</p>
      <form class="social-add"><input maxlength="6" placeholder="Friend code" aria-label="Friend code" autocomplete="off"><button class="px-btn small" type="submit">ADD</button></form>
      ${list.length ? `<ul class="social-list">${list.map(row).join('')}</ul>` : '<p class="social-note">Add a friend with their 6-character code, then watch their battles or invite them to a room.</p>'}`;
    el.querySelector('[data-close]').onclick = () => el.remove();
    el.querySelector('.social-add').onsubmit = e => {
      e.preventDefault();
      const v = e.target.querySelector('input').value.trim().toUpperCase();
      if (!/^[0-9A-F]{6}$/.test(v) || v === code || list.some(f => f.code === v)) return;
      this.friends = [...list, { code: v }];
      this.renderFriends();
      this.refresh();
    };
    el.querySelectorAll('[data-remove]').forEach(b => (b.onclick = () => { this.friends = list.filter(f => f.code !== b.dataset.remove); this.renderFriends(); }));
    el.querySelectorAll('[data-watch]').forEach(b => (b.onclick = () => { el.remove(); this.flow.mm.watch(b.dataset.watch); }));
    el.querySelectorAll('[data-invite]').forEach(b => (b.onclick = () => this.invite(b.dataset.invite)));
  }

  // Invite: opens a friend room (if one isn't open) and sends its code to the friend.
  async invite(code) {
    const room = () => this.flow.online.room?.code ?? this.flow.online.code;
    if (!room()) {
      this.friendsEl?.remove();
      this.flow.showOnline('home', '', 'title');
      await this.flow.createRoom();
    }
    for (let i = 0; i < 40 && !room(); i++) await new Promise(r => setTimeout(r, 250));
    if (!room()) return this.toast('Could not open a room for the invite.');
    await this.flow.mm.connect().catch(() => {});
    this.flow.mm.send({ t: 'invite', code, room: room() });
  }

  onMessage(m) {
    if (m.t === 'friends') {
      this.status = new Map(m.list.map(f => [f.code, f]));
      // Remember names so offline friends still show them.
      this.friends = this.friends.map(f => ({ ...f, name: this.status.get(f.code)?.name ?? f.name }));
      this.renderFriends();
    } else if (m.t === 'invite') {
      this.toast(`<b>${esc(safeName(m.from))}</b> invites you to a Friend Room`, [['JOIN', () => this.flow.joinRoom(m.room)], ['LATER', () => {}]]);
    } else if (m.t === 'invited') {
      this.toast(m.ok ? 'Invite sent! Waiting for your friend to join.' : 'Your friend is not online right now.');
    }
  }

  // ── Quick chat in online battles (matchmaking or a friend room) ──
  showChat(on) {
    let btn = document.querySelector('#chat-btn');
    if (!btn) {
      btn = document.createElement('div');
      btn.id = 'chat-btn';
      btn.innerHTML = `<button class="mini-btn" aria-expanded="false">💬 Quick chat</button><div class="chat-list hidden">${EMOTES.map((t, i) => `<button data-n="${i}">${t}</button>`).join('')}</div>`;
      const list = btn.querySelector('.chat-list'), toggle = btn.querySelector('button');
      toggle.onclick = () => { list.classList.toggle('hidden'); toggle.setAttribute('aria-expanded', String(!list.classList.contains('hidden'))); };
      list.querySelectorAll('[data-n]').forEach(b => (b.onclick = () => { list.classList.add('hidden'); this.sendEmote(+b.dataset.n); }));
      document.querySelector('#log')?.before(btn);
    }
    btn.classList.toggle('hidden', !on);
  }

  sendEmote(n) {
    const f = this.flow, now = performance.now();
    if (now - (this.emoteAt ?? 0) < 1500) return;
    this.emoteAt = now;
    if (f.mm.inBattle && f.mm.match && !f.mm.match.spectator) f.mm.send({ t: 'emote', id: f.mm.match.id, n });
    else if (f.online.inBattle) {
      f.online.send({ t: 'emote', n });
      f.game.showEmote('player', n);
    }
  }
}
