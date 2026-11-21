// Each player's connection delay, measured by the match server itself with WebSocket ping frames. Browsers answer
// those on their own (no page code runs), so a player cannot pretend to have a slower connection to get more time
// to dodge. Used for lag-forgiving dodges (combat.js dodgeGraceFor).
export class Latency {
  constructor(size = 9) { this.size = size; this.samples = []; }
  add(rttMs) {
    if (!(rttMs >= 0 && rttMs < 10_000)) return;
    this.samples.push(rttMs);
    if (this.samples.length > this.size) this.samples.shift();
  }
  // How long a dodge pressed on the player's screen usually takes to reach the server: half the median round trip,
  // plus a fifth for jitter. Zero until there are a few samples (a new connection is never given extra time).
  oneWayMs() {
    if (this.samples.length < 3) return 0;
    const s = [...this.samples].sort((a, b) => a - b);
    return (s[s.length >> 1] / 2) * 1.2;
  }
}

// The ping frame carries the time it was sent; the browser's pong echoes it back.
export const pingPayload = now => { const b = Buffer.alloc(8); b.writeDoubleBE(now); return b; };
export const pingSentAt = data => (data?.length === 8 ? data.readDoubleBE(0) : null);
