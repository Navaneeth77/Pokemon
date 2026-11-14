// Opt-in diagnostics. Bounded samples, no extra animation loop, DOM updates at most four times/second.
export class FrameSamples {
  constructor(limit = 180) { this.values = new Float64Array(limit); this.reset(); }
  reset() { this.count = 0; this.next = 0; }
  add(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return;
    this.values[this.next] = ms;
    this.next = (this.next + 1) % this.values.length;
    this.count = Math.min(this.count + 1, this.values.length);
  }
  summary() {
    if (!this.count) return null;
    const sorted = Array.from(this.values.slice(0, this.count)).sort((a, b) => a - b);
    return { fps: 1000 / (sorted.reduce((a, b) => a + b, 0) / this.count), p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))] };
  }
}

export function networkMetrics(mm, now) {
  if (mm?.state !== 'battle' || mm.ws?.readyState !== 1) return null;
  const freshPing = Number.isFinite(mm.lastPongAt) && now - mm.lastPongAt < 10000;
  return {
    rtt: freshPing ? mm.rtt : null, jitter: freshPing ? mm.jitter : null,
    snapshotAge: Number.isFinite(mm.lastSnapshotAt) ? Math.max(0, now - mm.lastSnapshotAt) : null,
    interpolation: mm.delay, correction: mm.lastCorrectionMagnitude,
    buffered: mm.ws.bufferedAmount,
  };
}

export class PerformanceOverlay {
  constructor(game) {
    this.game = game; this.samples = new FrameSamples(); this.enabled = false;
    this.element = document.createElement('aside');
    this.element.id = 'performance-overlay'; this.element.hidden = true;
    this.element.setAttribute('aria-label', 'Performance statistics');
    this.element.innerHTML = '<header><b>PERFORMANCE</b><button type="button" aria-label="Hide performance statistics">×</button></header><pre></pre>';
    this.text = this.element.querySelector('pre');
    this.element.querySelector('button').onclick = () => this.setEnabled(false);
    this.style = document.createElement('style');
    this.style.textContent = `#performance-overlay{position:fixed;left:10px;bottom:10px;z-index:5000;width:216px;box-sizing:border-box;padding:8px 10px;background:#101725ed;color:#edf3ff;border:1px solid #7792a8;border-radius:6px;font:12px/1.5 monospace;pointer-events:none}#performance-overlay[hidden]{display:none}#performance-overlay header{display:flex;align-items:center;justify-content:space-between}#performance-overlay button{pointer-events:auto;border:0;background:transparent;color:inherit;font:20px monospace;cursor:pointer;padding:0 4px}#performance-overlay pre{margin:3px 0 0;font:inherit;white-space:pre-wrap}@media(max-width:700px){#performance-overlay{left:auto;right:6px;bottom:auto;top:64px;width:178px;padding:5px 7px;font-size:10px}}@media(max-height:500px) and (pointer:coarse){#performance-overlay{left:8px;right:auto;top:8px;bottom:auto;width:218px;font-size:10px;line-height:1.3}}`;
    document.head.append(this.style); document.body.append(this.element);
    this.onKey = e => {
      if (e.code !== 'F3' || e.repeat || e.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
      e.preventDefault(); e.stopPropagation(); this.setEnabled(!this.enabled);
    };
    this.onVisibility = () => this.samples.reset();
    window.addEventListener('keydown', this.onKey, true);
    document.addEventListener('visibilitychange', this.onVisibility);
    let saved = false;
    try { saved = localStorage.getItem('msb.performance') === 'true'; } catch { /* optional preference */ }
    this.setEnabled(new URLSearchParams(location.search).has('perf') || saved);
  }
  setEnabled(enabled) {
    this.enabled = !!enabled; this.element.hidden = !this.enabled; this.samples.reset();
    const toggle = document.querySelector('[data-perf]');
    if (toggle) { toggle.textContent = `PERFORMANCE: ${this.enabled ? 'ON' : 'OFF'}`; toggle.setAttribute('aria-pressed', String(this.enabled)); }
    clearInterval(this.timer); this.timer = null;
    try { localStorage.setItem('msb.performance', String(this.enabled)); } catch { /* optional preference */ }
    if (this.enabled) { this.draw(); this.timer = setInterval(() => this.draw(), 250); }
  }
  sample(ms) {
    if (!this.enabled) return;
    if (['menu', 'select'].includes(this.game.state)) { this.samples.reset(); return; }
    this.samples.add(ms);
  }
  draw() {
    if (document.hidden) return;
    const frames = this.samples.summary(), net = networkMetrics(this.game.flow?.mm, performance.now());
    const ms = n => Number.isFinite(n) ? `${Math.round(n)} ms` : '—';
    const lines = [frames ? `${Math.round(frames.fps)} FPS · frame p95 ${frames.p95.toFixed(1)} ms` : 'Frames: waiting for battle'];
    if (net) lines.push(`RTT ${ms(net.rtt)} · jitter ${ms(net.jitter)}`, `Since snapshot: ${ms(net.snapshotAge)}`, `Interpolation: ${ms(net.interpolation)}`, `Correction: ${Number.isFinite(net.correction) ? net.correction.toFixed(1) + ' units' : '—'}`, `Upload queue: ${(net.buffered / 1024).toFixed(1)} KiB`);
    else lines.push('Match server: not in battle');
    this.text.textContent = lines.join('\n');
  }
  destroy() {
    clearInterval(this.timer); window.removeEventListener('keydown', this.onKey, true);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.element.remove(); this.style.remove();
  }
}
