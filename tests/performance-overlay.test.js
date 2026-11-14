import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameSamples, networkMetrics } from '../src/performance-overlay.js';

test('frame statistics stay bounded and discard earlier sessions', () => {
  const samples = new FrameSamples(3);
  [200, 10, 20, 30, NaN, -1].forEach(n => samples.add(n));
  assert.equal(samples.count, 3);
  assert.deepEqual(samples.summary(), { fps: 50, p95: 30 });
  samples.reset(); assert.equal(samples.summary(), null);
});

test('network statistics distinguish stale ping, snapshot age and disconnected sessions', () => {
  const mm = { state: 'battle', ws: { readyState: 1, bufferedAmount: 2048 }, lastPongAt: 100, rtt: 80, jitter: 12, lastSnapshotAt: 10980, delay: 35 };
  const metrics = networkMetrics(mm, 11000);
  assert.equal(metrics.rtt, null); assert.equal(metrics.snapshotAge, 20); assert.equal(metrics.interpolation, 35);
  mm.lastSnapshotAt = null; assert.equal(networkMetrics(mm, 11000).snapshotAge, null);
  mm.ws.readyState = 3; assert.equal(networkMetrics(mm, 11000), null);
  mm.ws.readyState = 1; mm.state = 'idle'; assert.equal(networkMetrics(mm, 11000), null);
});
