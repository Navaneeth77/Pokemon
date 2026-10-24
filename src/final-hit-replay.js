import { quality } from './quality.js';
import { WORLD_W, WORLD_H } from './arena.js';

// Actual rendered frames, never replayed combat inputs. Twelve half-resolution frames use <3 MB of raw pixels.
export class FinalHitReplay {
  constructor() { this.clear(); }
  clear() {
    for (const frame of this.frames ?? []) { frame.width = 0; frame.height = 0; }
    this.frames = []; this.cursor = 0; this.last = -Infinity;
  }
  capture(game, now = performance.now()) {
    const low = quality().particles < 500, limit = low ? 6 : 12, interval = low ? 180 : 100;
    if (now - this.last < interval) return;
    this.last = now;
    const frame = this.frames[this.cursor] ?? document.createElement('canvas'), width = low ? 120 : 180, height = low ? 214 : 320;
    if (frame.width !== width) frame.width = width;
    if (frame.height !== height) frame.height = height;
    const ctx = frame.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const { canvas, view, k } = game;
    ctx.drawImage(canvas, view.ox * k, view.oy * k, WORLD_W * k, WORLD_H * k, 0, 0, width, height);
    this.frames[this.cursor] = frame;
    this.cursor = (this.cursor + 1) % limit;
    if (this.frames.length > limit) {
      for (const extra of this.frames.splice(limit)) { extra.width = 0; extra.height = 0; }
    }
  }
  clip() {
    if (this.frames.length < 3) return [];
    return [...this.frames.slice(this.cursor), ...this.frames.slice(0, this.cursor)];
  }
}
