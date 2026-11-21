// On a lossy connection (mobile data) server updates stall for a few hundred milliseconds and then arrive in a
// burst. The opponent should glide through that, not stop dead and then jump.
import '../server/shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Matchmaker } from '../src/matchmaking.js';

// Replays a server stream at 30 updates/s through the real client code at 60 frames/s and records where the
// opponent is drawn. `path(t)` is the opponent's true position; `stall` holds back every update sent in
// [from, to) until `to` (then they all arrive at once), like a lost TCP packet being resent.
export function replay({ path, stall = null, ms = 4000, latency = 60 }) {
  const mm = Object.assign(Object.create(Matchmaker.prototype), { flip: false, foeBuf: [], offs: [], offset: null, delay: null });
  const mon = { x: path(0).x, y: path(0).y, z: 0, hidden: false, fainted: false, air: null };
  const packets = [];
  for (let ts = 0; ts <= ms; ts += 33) {
    const p = path(ts), arrive = stall && ts >= stall.from && ts < stall.to ? stall.to + latency : ts + latency;
    const side = { i: p.i ?? 0, x: p.x, y: p.y, d: 0, fz: 0, ah: 0, mv: p.mv ?? 1, lx: 1, ly: 0 };
    packets.push({ arrive, ts, m: { A: { i: 0, x: 0, y: 0 }, B: side } });
  }
  const shown = [], realNow = performance.now;
  let now = 0;
  performance.now = () => now; // the client reads the clock itself when an update arrives
  try {
    for (; now <= ms + latency; now += 1000 / 60) {
      packets.sort((a, b) => a.arrive - b.arrive || a.ts - b.ts);
      while (packets.length && packets[0].arrive <= now) { const p = packets.shift(); mm.onSnapshot(p.m, p.ts); }
      mm.foeSample = mm.sampleFoe(now);
      if (!mm.foeSample) continue;
      mm.puppetAfter(1 / 60, { mon, x: mon.x, y: mon.y }, mm.foeSample, false);
      shown.push({ now, x: mon.x, y: mon.y, target: mm.foeSample });
    }
  } finally { performance.now = realNow; }
  return shown;
}

const steps = shown => shown.slice(1).map((s, k) => Math.hypot(s.x - shown[k].x, s.y - shown[k].y));
const walk = t => ({ x: 40 + 0.07 * t, y: 300 }); // 70 px/s, a steady walk across the arena

test('a steadily walking opponent glides through a half-second stall instead of freezing and jumping', () => {
  const shown = replay({ path: walk, stall: { from: 2000, to: 2500 } });
  const maxStep = Math.max(...steps(shown));
  // Walking moves about 1.2 px a frame; the old code jumped tens of pixels in one frame when the burst landed.
  assert.ok(maxStep < 6, `largest jump in one frame: ${maxStep.toFixed(1)} px`);
  // It never stands still for more than a few frames while the opponent is walking.
  let still = 0, longest = 0;
  for (const s of steps(shown).slice(20)) { still = s < 0.05 ? still + 1 : 0; longest = Math.max(longest, still); }
  assert.ok(longest <= 6, `stood still for ${longest} frames`);
  // And it catches up: half a second after the burst it is back on the interpolated path.
  const after = shown.find(s => s.now > 3100);
  assert.ok(Math.hypot(after.x - after.target.x, after.y - after.target.y) < 2, 'back on the server path');
});

test('on a clean connection the opponent is drawn exactly on the interpolated path (no added lag)', () => {
  const shown = replay({ path: walk });
  for (const s of shown.slice(30)) assert.ok(Math.hypot(s.x - s.target.x, s.y - s.target.y) < 0.01);
});

test('a real teleport or switch still shows at once', () => {
  const jump = t => (t < 2000 ? { x: 60, y: 300, mv: 0 } : { x: 300, y: 300, mv: 0 });
  const shown = replay({ path: jump });
  const landed = shown.find(s => s.target.x === 300);
  assert.equal(landed.x, 300);
  const swap = t => (t < 2000 ? { i: 0, x: 60, y: 300, mv: 0 } : { i: 1, x: 120, y: 300, mv: 0 });
  const shown2 = replay({ path: swap });
  const sent = shown2.find(s => s.target.i === 1);
  assert.equal(sent.x, 120);
});
