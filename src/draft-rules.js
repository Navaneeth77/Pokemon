// The server supplies a shuffled legal roster; clients receive only view(side).
export class Draft {
  constructor(mode, format, pool, now = Date.now()) {
    if (!['snake', 'trade'].includes(mode) || ![3, 6].includes(format) || (mode === 'trade' && format !== 6)) throw new Error('Invalid draft format');
    if (new Set(pool).size !== pool.length || pool.length < format * 2) throw new Error('Insufficient unique pool');
    Object.assign(this, { mode, format, pool: [...pool], teams: [[], []], origins: [[], []], choices: [null, null], confirmed: [false, false], round: 0, pick: 0, phase: 'picking', deadline: now + 25000 });
  }
  get turn() { return [0, 1, 1, 0][this.pick % 4]; }
  pair(side) { return this.pool.slice(this.round * 4 + side * 2, this.round * 4 + side * 2 + 2); }
  choose(side, id, now = Date.now()) {
    if (![0, 1].includes(side) || this.phase !== 'picking' || now >= this.deadline) return false;
    if (this.mode === 'snake') {
      if (side !== this.turn || !this.pool.includes(id)) return false;
      this.teams[side].push(id); this.origins[side].push('picked');
      this.pool.splice(this.pool.indexOf(id), 1); this.pick++;
      this.phase = this.pick === this.format * 2 ? 'confirm' : 'picking';
      this.deadline = now + 25000;
    } else {
      if (this.choices[side] !== null || !this.pair(side).includes(id)) return false;
      this.choices[side] = id;
      if (this.choices.every(Boolean)) {
        for (let s = 0; s < 2; s++) {
          this.teams[s].push(this.choices[s], this.pair(1 - s).find(id => id !== this.choices[1 - s]));
          this.origins[s].push('picked', 'received');
        }
        this.phase = 'reveal'; this.deadline = now + 3500;
      }
    }
    return true;
  }
  tick(now = Date.now()) {
    if (now < this.deadline || this.phase === 'done') return false;
    if (this.phase === 'confirm') { this.phase = 'done'; return true; }
    if (this.phase === 'reveal') {
      this.round++; this.choices = [null, null];
      this.phase = this.round === 3 ? 'confirm' : 'picking'; this.deadline = now + 25000; return true;
    }
    this.deadline = now + 25000;
    if (this.mode === 'snake') this.choose(this.turn, this.pool[0], now);
    else for (let s = 0; s < 2; s++) if (!this.choices[s]) this.choose(s, this.pair(s)[0], now);
    return true;
  }
  confirm(side) {
    if (this.phase !== 'confirm' || ![0, 1].includes(side)) return false;
    this.confirmed[side] = true;
    if (this.confirmed.every(Boolean)) this.phase = 'done';
    return true;
  }
  view(side) {
    return { mode: this.mode, format: this.format, phase: this.phase, teams: this.teams, origins: this.origins, turn: this.turn, you: side, round: this.round, deadline: this.deadline, confirmed: this.confirmed, chosen: this.choices[side] !== null,
      pool: this.mode === 'snake' ? this.pool : this.phase === 'picking' ? this.pair(side) : [], waiting: this.mode === 'trade' && this.choices[side] !== null };
  }
}
