import { GroundFX } from './groundfx.js';

export const WORLD_W = 360;
export const WORLD_H = 640;
export const BOUNDS = { minX: 22, maxX: 338, minY: 112, maxY: 588 };

const LEDGE_Y = 603;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const SNOW = [[150, 160, 174], [170, 179, 192], [188, 196, 207], [204, 211, 220], [219, 224, 231], [232, 236, 241]];
const rand = (a, b) => a + Math.random() * (b - a);

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function hash2(i, j, s) {
  let n = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(s, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function noise2(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function paintSnow(ctx) {
  const img = ctx.createImageData(WORLD_W, WORLD_H);
  const d = img.data;
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      let n = 0.55 * noise2(x / 54, y / 54, 7) + 0.3 * noise2(x / 18, y / 18, 8) + 0.15 * noise2(x / 6, y / 6, 9);
      n += (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.1;
      const idx = Math.max(0, Math.min(SNOW.length - 1, Math.floor(((n - 0.2) / 0.6) * SNOW.length)));
      const [r, g, b] = SNOW[idx];
      const shade = y > LEDGE_Y ? 0.82 : 1;
      const o = (y * WORLD_W + x) * 4;
      d[o] = r * shade;
      d[o + 1] = g * shade;
      d[o + 2] = b * shade * 1.03;
      d[o + 3] = 255;
    }
  }
  for (let k = 0; k < 900; k++) {
    const o = (Math.floor(Math.random() * WORLD_H) * WORLD_W + Math.floor(Math.random() * WORLD_W)) * 4;
    const delta = Math.random() < 0.7 ? -34 : 22;
    d[o] += delta;
    d[o + 1] += delta;
    d[o + 2] += delta;
  }
  ctx.putImageData(img, 0, 0);
}

function paintFieldLines(ctx) {
  const L = 14.5, R = 345.5, T = 90.5, B = 598.5, mid = 344.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(L, T, R - L, B - T);
  ctx.beginPath();
  ctx.moveTo(L, mid);
  ctx.lineTo(R, mid);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(180, mid, 44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeRect(92.5, T, 175, 58);
  ctx.strokeRect(92.5, B - 58, 175, 58);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillRect(179, mid - 1, 2, 2);
}

function paintRock(ctx, cx, cy, rw, rh) {
  ctx.fillStyle = 'rgba(30,36,48,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx + 1, cy + rh - 1, rw + 1, rh * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let y = -rh; y <= rh; y++) {
    for (let x = -rw; x <= rw; x++) {
      const d = (x * x) / (rw * rw) + (y * y) / (rh * rh);
      if (d > 1) continue;
      let c = '#737b88';
      if (y < -rh * 0.3 && d < 0.7) c = '#eef2f6';
      else if (x + y < -rw * 0.3) c = '#99a1ad';
      else if (y > rh * 0.4 || x + y > rw * 0.8) c = '#535a66';
      if (d > 0.8) c = '#3c424d';
      ctx.fillStyle = c;
      ctx.fillRect(cx + x, cy + y, 1, 1);
    }
  }
}

function paintEdges(ctx) {
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(0, LEDGE_Y - 1, WORLD_W, 1);
  ctx.fillStyle = '#5b6371';
  ctx.fillRect(0, LEDGE_Y, WORLD_W, 1);
  ctx.fillStyle = 'rgba(36,42,56,0.35)';
  ctx.fillRect(0, LEDGE_Y + 1, WORLD_W, 3);
  for (let x = 8; x < WORLD_W; x += rand(24, 40)) {
    paintRock(ctx, Math.round(x), Math.round(rand(613, 630)), Math.round(rand(6, 12)), Math.round(rand(4, 7)));
  }
  for (const x of [26, 52, 312, 338]) paintRock(ctx, x, Math.round(rand(82, 88)), Math.round(rand(5, 8)), 4);
  const g = ctx.createRadialGradient(180, 340, 160, 180, 340, 430);
  g.addColorStop(0, 'rgba(20,26,38,0)');
  g.addColorStop(1, 'rgba(20,26,38,0.3)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
}

export class Arena {
  constructor() {
    this.ground = makeCanvas(WORLD_W, WORLD_H);
    const g = this.ground.getContext('2d');
    paintSnow(g);
    paintFieldLines(g);
    paintEdges(g);
    this.marks = new GroundFX();
    this.flakes = Array.from({ length: 110 }, () => this.makeFlake(true));
    this.t = 0;
  }

  makeFlake(anywhere) {
    return {
      x: rand(0, WORLD_W + 40),
      y: anywhere ? rand(0, WORLD_H) : -4,
      vy: rand(16, 38),
      vx: rand(-9, -3),
      s: Math.random() < 0.25 ? 2 : 1,
      a: rand(0.55, 0.95),
      ph: rand(0, 6.28),
    };
  }

  reset() {
    this.marks.clear();
  }

  update(dt) {
    this.t += dt;
    for (let i = 0; i < this.flakes.length; i++) {
      const f = this.flakes[i];
      f.y += f.vy * dt;
      f.x += (f.vx + Math.sin(this.t * 1.3 + f.ph) * 5) * dt;
      if (f.y > WORLD_H + 4 || f.x < -4) this.flakes[i] = this.makeFlake(false);
    }
    this.marks.update(dt);
  }

  drawGround(ctx) {
    ctx.drawImage(this.ground, 0, 0);
    this.marks.draw(ctx);
  }

  drawSnow(ctx) {
    ctx.fillStyle = '#ffffff';
    for (const f of this.flakes) {
      ctx.globalAlpha = f.a;
      ctx.fillRect(Math.round(f.x), Math.round(f.y), f.s, f.s);
    }
    ctx.globalAlpha = 1;
  }
}
