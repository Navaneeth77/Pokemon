// One write in flight per connection. Replace only adjacent battle states; combat events and
// lifecycle messages retain their order. A stalled reader cannot accumulate seconds of snapshots.
export class BattleOutbox {
  constructor(ws, { maxBytes = 64 * 1024, maxAgeMs = 2000, now = () => performance.now() } = {}) {
    Object.assign(this, { ws, maxBytes, maxAgeMs, now });
    this.queue = []; this.bytes = 0; this.active = null; this.timer = null; this.closed = false;
    ws.once('close', () => this.dispose());
  }
  send(msg, encoded = JSON.stringify(msg)) {
    if (this.closed || this.ws.readyState !== 1) return;
    const tail = this.queue.at(-1);
    if (tail?.msg.t === 'b' && msg.t === 'b') {
      // Raid hazards are delta-updated; keep the most recent explicit list, including an empty one.
      const merged = { ...tail.msg, ...msg, e: [...(tail.msg.e ?? []), ...(msg.e ?? [])] };
      if (tail.msg.raid && msg.raid) merged.raid = { ...tail.msg.raid, ...msg.raid };
      this.bytes -= tail.bytes;
      tail.msg = merged; tail.data = JSON.stringify(merged); tail.bytes = Buffer.byteLength(tail.data);
      this.bytes += tail.bytes;
    } else {
      const entry = { msg, data: encoded, bytes: Buffer.byteLength(encoded), since: this.now() };
      this.queue.push(entry); this.bytes += entry.bytes;
    }
    this.flush();
  }
  flush() {
    if (this.closed) return;
    if (this.ws.readyState !== 1) return this.dispose();
    const oldest = this.active?.since ?? this.queue[0]?.since;
    if (this.bytes + this.ws.bufferedAmount > this.maxBytes || (oldest != null && this.now() - oldest > this.maxAgeMs)) {
      this.dispose(); this.ws.close(1013, 'slow connection'); return;
    }
    if (!this.active && this.queue.length && this.ws.bufferedAmount === 0) {
      const entry = this.queue.shift(); this.bytes -= entry.bytes; this.active = entry;
      try {
        this.ws.send(entry.data, err => {
          if (this.closed) return;
          this.active = null;
          if (err) { this.dispose(); this.ws.close(1011, 'send failed'); return; }
          this.flush();
        });
      } catch {
        this.dispose(); this.ws.close(1011, 'send failed'); return;
      }
    }
    if ((this.active || this.queue.length) && !this.timer) {
      this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 25);
      this.timer.unref?.();
    } else if (!this.active && !this.queue.length) { clearTimeout(this.timer); this.timer = null; }
  }
  dispose() {
    this.closed = true; clearTimeout(this.timer); this.timer = null;
    this.queue = []; this.bytes = 0; this.active = null;
  }
}

const outboxes = new WeakMap();
export function sendQueued(ws, msg, encoded) {
  if (ws?.readyState !== 1) return;
  let outbox = outboxes.get(ws);
  if (!outbox) { outbox = new BattleOutbox(ws); outboxes.set(ws, outbox); }
  outbox.send(msg, encoded);
}
