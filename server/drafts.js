import { randomInt, randomBytes } from 'node:crypto';
import { Draft } from '../src/draft-rules.js';
import { ROSTER, SPECIES } from '../src/data/species.js';
import { randomKit } from '../src/data/items.js';

// A computer drafter takes the stronger of its options, now and then the second best, so it isn't predictable.
const strength = id => { const s = SPECIES[id]; return s.hp / 1000 + s.atk + (s.spa ?? s.atk) + s.def + (s.spdef ?? s.def) + s.speed / 100; };
const botPick = list => { const best = [...list].sort((a, b) => strength(b) - strength(a)); return best[best.length > 1 && Math.random() < 0.3 ? 1 : 0]; };
export class DraftRooms {
  // `kits` checks the held items / Tera types a player brings for whatever they end up drafting. With no
  // opponent after `botAfter` ms, `makeBot(entry)` brings in a computer drafter (its trainer, then its battle).
  constructor(send, start, capacity, kits = () => ({}), { makeBot = null, botAfter = 0 } = {}) { Object.assign(this, { send, start, capacity, kits, makeBot, botAfter, waiting: [], rooms: new Map() }); }
  handle(p, m) {
    if (m.t === 'draft-queue') {
      if (p.state !== 'idle') return true;
      if (!['snake', 'trade'].includes(m.mode) || ![3, 6].includes(m.format) || (m.mode === 'trade' && m.format !== 6)) return true;
      const ranked = m.ranked === true, roster = m.roster === 'all' ? 'all' : 'regular';
      p.draftKits = m.kits && typeof m.kits === 'object' ? m.kits : null;
      const other = this.waiting.find(e => e.mode === m.mode && e.format === m.format && e.ranked === ranked && e.roster === roster && e.p !== p);
      if (other && !this.capacity()) { this.send(p, { t: 'error', message: 'Server at capacity. Please retry shortly.' }); return true; }
      p.state = 'draft';
      if (!other) { this.waiting.push({ p, mode: m.mode, format: m.format, ranked, roster, at: Date.now() }); this.send(p, { t: 'draft-waiting' }); return true; }
      this.waiting.splice(this.waiting.indexOf(other), 1);
      this.open([other.p, p], m.mode, m.format, ranked, roster);
      return true;
    }
    if (!m.t.startsWith('draft-')) return false;
    if (m.t === 'draft-cancel') { this.leave(p); return true; }
    const room = this.rooms.get(m.id), side = room?.players.indexOf(p);
    if (side == null || side < 0) return true;
    if (m.t === 'draft-pick') room.draft.choose(side, m.species);
    if (m.t === 'draft-confirm') room.draft.confirm(side);
    this.broadcast(room); this.complete(room); return true;
  }
  open(players, mode, format, ranked, roster) {
    const pool = ROSTER.filter(id => roster === 'all' || SPECIES[id].class === 'regular');
    for (let i = pool.length - 1; i > 0; i--) { const j = randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const room = { ranked, roster, id: randomBytes(6).toString('hex'), players, draft: new Draft(mode, format, pool.slice(0, mode === 'trade' ? 12 : format * 4)) };
    this.rooms.set(room.id, room); this.broadcast(room);
    return room;
  }
  // The computer drafter's move, a second or so after it becomes its turn: pick, or confirm the team.
  botTurn(r) {
    clearTimeout(r.botTimer);
    const s = r.players.findIndex(p => p.bot), d = r.draft;
    if (s < 0 || !this.rooms.has(r.id)) return;
    const due = d.phase === 'picking' ? (d.mode === 'snake' ? d.turn === s : d.choices[s] === null) : d.phase === 'confirm' && !d.confirmed[s];
    if (!due) return;
    r.botTimer = setTimeout(() => {
      if (!this.rooms.has(r.id)) return;
      if (d.phase === 'picking') d.choose(s, botPick(d.mode === 'snake' ? d.pool.slice(0, 12) : d.pair(s)));
      else if (d.phase === 'confirm') d.confirm(s);
      this.broadcast(r); this.complete(r);
    }, 900 + Math.random() * 900);
    r.botTimer.unref?.();
  }
  // Each player's view, with both names and the time left (from the server's clock, so a client with a
  // wrong clock still shows the right countdown).
  broadcast(r) {
    const names = r.players.map(p => p.name), left = Math.max(0, r.draft.deadline - Date.now());
    r.players.forEach((p, s) => this.send(p, { t: 'draft-state', id: r.id, ranked:r.ranked, roster:r.roster, names, left, ...r.draft.view(s) }));
    this.botTurn(r);
  }
  complete(r) {
    if (r.draft.phase !== 'done') return;
    this.rooms.delete(r.id);
    if (!this.capacity()) { for (const p of r.players) { p.state = 'idle'; this.send(p, { t: 'draft-cancelled', message: 'Server is at capacity. Please retry.' }); } return; }
    const entries = r.players.map((player, s) => ({ player, format: r.draft.format, team: r.draft.teams[s], lead: 0, mega: {}, draftMode: r.draft.mode, ranked:r.ranked,
      kit: player.bot ? Object.fromEntries(r.draft.teams[s].map(id => [id, randomKit(SPECIES[id])])) : this.kits(r.draft.teams[s], player.draftKits),
      ...(player.bot && { difficulty: player.botDifficulty }) }));
    this.start(...entries);
  }
  leave(p) {
    this.waiting = this.waiting.filter(e => e.p !== p);
    for (const r of this.rooms.values()) if (r.players.includes(p)) {
      this.rooms.delete(r.id);
      for (const player of r.players) { player.state = 'idle'; this.send(player, { t: 'draft-cancelled', message: 'Draft cancelled: a player left.' }); }
    }
    if (p.state === 'draft') p.state = 'idle';
  }
  tick(now) {
    for (const e of [...this.waiting]) {
      // Nobody else drafting after a while: a computer drafter takes the other seat.
      if (this.makeBot && this.botAfter > 0 && now - e.at >= this.botAfter && e.p.ws?.readyState === 1 && this.capacity()) {
        this.waiting.splice(this.waiting.indexOf(e), 1);
        const bot = this.makeBot({ format: e.format, player: e.p });
        Object.assign(bot.player, { state: 'draft', botDifficulty: bot.difficulty });
        this.open([e.p, bot.player], e.mode, e.format, e.ranked, e.roster);
        continue;
      }
      if (now - e.at > 180000) { this.leave(e.p); this.send(e.p, { t: 'draft-cancelled', message: 'No opponent found. Please retry.' }); }
    }
    for (const r of this.rooms.values()) { if (r.draft.tick(now)) this.broadcast(r); this.complete(r); }
  }
}
