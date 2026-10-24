import { randomInt, randomBytes } from 'node:crypto';
import { Draft } from '../src/draft-rules.js';
import { ROSTER, SPECIES } from '../src/data/species.js';
export class DraftRooms {
  constructor(send, start, capacity) { Object.assign(this, { send, start, capacity, waiting: [], rooms: new Map() }); }
  handle(p, m) {
    if (m.t === 'draft-queue') {
      if (p.state !== 'idle') return true;
      if (!['snake', 'trade'].includes(m.mode) || ![3, 6].includes(m.format) || (m.mode === 'trade' && m.format !== 6)) return true;
      const ranked = m.ranked === true, roster = m.roster === 'all' ? 'all' : 'regular';
      const other = this.waiting.find(e => e.mode === m.mode && e.format === m.format && e.ranked === ranked && e.roster === roster && e.p !== p);
      if (other && !this.capacity()) { this.send(p, { t: 'error', message: 'Server at capacity. Please retry shortly.' }); return true; }
      p.state = 'draft';
      if (!other) { this.waiting.push({ p, mode: m.mode, format: m.format, ranked, roster, at: Date.now() }); this.send(p, { t: 'draft-waiting' }); return true; }
      this.waiting.splice(this.waiting.indexOf(other), 1);
      const pool = ROSTER.filter(id => roster === 'all' || SPECIES[id].class === 'regular');
      for (let i = pool.length - 1; i > 0; i--) { const j = randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      const room = { ranked, roster, id: randomBytes(6).toString('hex'), players: [other.p, p], draft: new Draft(m.mode, m.format, pool.slice(0, m.mode === 'trade' ? 12 : m.format * 4)) };
      this.rooms.set(room.id, room); this.broadcast(room); return true;
    }
    if (!m.t.startsWith('draft-')) return false;
    if (m.t === 'draft-cancel') { this.leave(p); return true; }
    const room = this.rooms.get(m.id), side = room?.players.indexOf(p);
    if (side == null || side < 0) return true;
    if (m.t === 'draft-pick') room.draft.choose(side, m.species);
    if (m.t === 'draft-confirm') room.draft.confirm(side);
    this.broadcast(room); this.complete(room); return true;
  }
  // Each player's view, with both names and the time left (from the server's clock, so a client with a
  // wrong clock still shows the right countdown).
  broadcast(r) {
    const names = r.players.map(p => p.name), left = Math.max(0, r.draft.deadline - Date.now());
    r.players.forEach((p, s) => this.send(p, { t: 'draft-state', id: r.id, ranked:r.ranked, roster:r.roster, names, left, ...r.draft.view(s) }));
  }
  complete(r) {
    if (r.draft.phase !== 'done') return;
    this.rooms.delete(r.id);
    if (!this.capacity()) { for (const p of r.players) { p.state = 'idle'; this.send(p, { t: 'draft-cancelled', message: 'Server is at capacity. Please retry.' }); } return; }
    const entries = r.players.map((player, s) => ({ player, format: r.draft.format, team: r.draft.teams[s], lead: 0, mega: {}, draftMode: r.draft.mode, ranked:r.ranked }));
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
    for (const e of [...this.waiting]) if (now - e.at > 180000) { this.leave(e.p); this.send(e.p, { t: 'draft-cancelled', message: 'No opponent found. Please retry.' }); }
    for (const r of this.rooms.values()) { if (r.draft.tick(now)) this.broadcast(r); this.complete(r); }
  }
}
