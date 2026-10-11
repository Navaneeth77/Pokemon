// A trainer's three Pokémon. Each member keeps its own HP across switches; `index` is the active one.
export class Team {
  constructor(side, trainer, members) {
    this.side = side;
    this.trainer = trainer;
    this.members = members;
    for (const m of members) m.trainer = trainer;
    this.index = 0;
  }

  get active() {
    return this.members[this.index];
  }

  get remaining() {
    return this.members.filter(m => m.alive).length;
  }

  reset(lead, home) {
    this.index = lead;
    this.megaUsed = false; // one Mega Evolution per trainer per battle
    for (const m of this.members) m.reset(home.x, home.y, home.dir);
  }

  // Next healthy member after the active one, in team order; -1 when none are left.
  nextAlive() {
    const n = this.members.length;
    for (let i = 1; i < n; i++) {
      const k = (this.index + i) % n;
      if (this.members[k].alive) return k;
    }
    return -1;
  }
}
