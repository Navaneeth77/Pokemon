// Each player's connection delay, measured by the match server for lag-forgiving dodges (combat.js dodgeGraceFor).
// Once a second the server sends { t: 'sping', ts } and the game answers { t: 'spong', ts } straight away. This uses
// ordinary game messages: WebSocket ping frames are answered by the hosting proxy (Render), not by the player, so
// they only measure the hop to the proxy. Only a time this server actually sent is accepted back, so a client cannot
// invent an older one; at most it can answer late, and the forgiveness it buys is capped (150 ms).
export class Latency {
  constructor(size = 9) { this.size = size; this.samples = []; this.sent = []; }
  // The time to put in the next ping (remembered so only a real echo counts).
  stamp(now) {
    this.sent.push(now);
    if (this.sent.length > 8) this.sent.shift();
    return now;
  }
  // The echo of a ping: true when it matched one this server sent.
  echo(ts, now) {
    const k = this.sent.indexOf(ts);
    if (k < 0) return false;
    this.sent.splice(0, k + 1);
    this.add(now - ts);
    return true;
  }
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
