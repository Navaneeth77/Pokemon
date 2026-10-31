import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { freshWallet, walletAction, walletView, progressMatch, rollover } from '../src/economy.js';

const PID = /^[A-Za-z0-9_-]{8,64}$/, HEX = /^[a-f0-9]{64}$/;
// A wallet is rewritten only when something in it really changed (the clock guard `lastNow` moves on
// every request, so it is left out of the comparison).
const fingerprint = w => JSON.stringify({ ...w, lastNow: 0 });

// Wallets live in memory and are saved one player at a time, so a wallet request never rewrites (or
// even copies) everyone else's data on the match server's single thread. Saving goes to `sink` when one
// is attached (Redis, see server/index.js); otherwise to an append-only journal file: one small line per
// change, last line wins, compacted when the server starts. Storage that can't be read is never
// overwritten: the economy refuses requests until it's fixed.
export class EconomyStore {
  constructor(file, sink = null) {
    this.file = file;
    this.sink = sink;
    this.data = { version: 1, players: {} };
    this.error = null;
    if (file) this.read();
  }

  read() {
    let text;
    try {
      text = fs.readFileSync(this.file, 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT') this.error = 'Economy storage could not be loaded. Existing data was preserved.';
      return;
    }
    try {
      // A file that doesn't end in a newline is either the first version's single-object save or a
      // write cut short by a crash: a damaged last line after good ones is dropped, and the file is
      // rewritten cleanly so later appends start on a fresh line.
      const rows = text.split('\n').filter(l => l.trim()), torn = !text.endsWith('\n');
      let good = 0;
      for (let i = 0; i < rows.length; i++) {
        let row;
        try {
          row = JSON.parse(rows[i]);
        } catch (e) {
          if (torn && i === rows.length - 1 && good) break;
          throw e;
        }
        good++;
        if (row.players) {
          // The first version stored everyone in one object.
          if (row.version !== 1) throw Error('Unsupported economy save');
          Object.assign(this.data.players, row.players);
        } else if (PID.test(row.pid ?? '') && row.credential && row.wallet) this.data.players[row.pid] = { credential: row.credential, wallet: row.wallet };
        else if (row.version !== 1) throw Error('Unsupported economy save');
      }
      if (torn || rows.length > 100 + 3 * Object.keys(this.data.players).length) this.compact();
    } catch {
      this.data = { version: 1, players: {} };
      this.error = 'Economy storage could not be loaded. Existing data was preserved.';
    }
  }

  compact() {
    const lines = ['{"version":1}', ...Object.entries(this.data.players).map(([pid, r]) => JSON.stringify({ pid, ...r }))];
    fs.writeFileSync(`${this.file}.tmp`, `${lines.join('\n')}\n`, { mode: 0o600 });
    fs.renameSync(`${this.file}.tmp`, this.file);
  }

  // Wallets loaded from another store (Redis) at startup.
  load(entries) {
    for (const [pid, r] of entries) if (PID.test(pid) && r?.credential && r.wallet) this.data.players[pid] = r;
  }

  hash(secret) { return crypto.createHash('sha256').update(secret).digest('hex'); }

  authenticated(pid, secret) { return typeof secret === 'string' && HEX.test(secret) && this.data.players[pid]?.credential === this.hash(secret); }

  // Saves one wallet. A failure leaves both the file and memory unchanged.
  save(pid, record) {
    if (this.error) throw Error(this.error);
    if (this.sink) this.sink(pid, record);
    else {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.appendFileSync(this.file, `${JSON.stringify({ pid, ...record })}\n`, { mode: 0o600 });
    }
    this.data.players[pid] = record;
  }

  request(pid, secret, op, id, now = Date.now()) {
    if (this.error) throw Error(this.error);
    if (!PID.test(pid ?? '') || !HEX.test(secret ?? '')) throw Error('Invalid anonymous wallet credential.');
    const old = this.data.players[pid];
    if (old && !this.authenticated(pid, secret)) throw Error('This wallet belongs to another browser credential. No balance was changed.');
    const record = old ? structuredClone(old) : { credential: this.hash(secret), wallet: freshWallet(pid, now) };
    walletAction(record.wallet, op, id, now);
    if (!old || fingerprint(record.wallet) !== fingerprint(old.wallet)) this.save(pid, record);
    return walletView(record.wallet, now);
  }

  // `local` (a win against a computer trainer) counts toward the same daily cap as Bot Battles.
  award(player, summary, now = Date.now(), { local = false } = {}) {
    const old = player?.economyAuthenticated && this.data.players[player.pid];
    if (!old) return false;
    try {
      const record = structuredClone(old);
      rollover(record.wallet, now);
      if (!progressMatch(record.wallet, summary, now, { local })) return false;
      this.save(player.pid, record);
      return true;
    } catch (e) {
      console.error('Economy reward could not be persisted; no reward committed.');
      return false;
    }
  }
}
