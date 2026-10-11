import { GroundFX } from './groundfx.js';

export const WORLD_W = 360;
export const WORLD_H = 640;
export const BOUNDS = { minX: 22, maxX: 338, minY: 112, maxY: 588 };

const LEDGE_Y = 603;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const rand = (a, b) => a + Math.random() * (b - a);

// Battle arenas. Each paints its own ground (dithered noise in a small palette), field lines, edge
// decoration, the scenery around the arena (seen in the fullscreen battle) and ambient particles.
export const ARENAS = [
  {
    id: 'mtSilver', name: 'Mt. Silver Summit', desc: 'Snowy peak. Snow drifts down all battle.',
    ground: [[150, 160, 174], [170, 179, 192], [188, 196, 207], [204, 211, 220], [219, 224, 231], [232, 236, 241]],
    lines: 'rgba(255,255,255,0.5)', rock: ['#737b88', '#eef2f6', '#99a1ad', '#535a66', '#3c424d'], deco: 'rock',
    outer: [[96, 104, 120], [112, 121, 137], [130, 138, 154]], ambient: { kind: 'snow', n: 110, colors: ['#ffffff'] },
  },
  {
    id: 'viridian', name: 'Viridian Forest', desc: 'A sunlit clearing. Leaves drift on the breeze.',
    ground: [[66, 120, 54], [78, 138, 60], [92, 152, 66], [108, 166, 74], [126, 180, 84], [146, 196, 98]],
    lines: 'rgba(255,255,240,0.55)', rock: ['#3f7a34', '#8fd060', '#5aa048', '#2f5a28', '#1f3a1c'], deco: 'bush',
    outer: [[28, 70, 34], [36, 86, 40], [46, 100, 48]], ambient: { kind: 'leaf', n: 40, colors: ['#8fd060', '#d8b040', '#5aa048'] },
  },
  {
    id: 'cinnabar', name: 'Cinnabar Volcano', desc: 'Cracked basalt over molten rock. Embers rise.',
    ground: [[52, 40, 40], [64, 48, 46], [76, 58, 54], [90, 68, 62], [104, 80, 70], [120, 92, 80]],
    lines: 'rgba(255,170,90,0.55)', rock: ['#4a3a36', '#ff9a3a', '#6a524a', '#2a1e1c', '#1a1210'], deco: 'lava',
    outer: [[34, 24, 24], [44, 30, 28], [56, 38, 34]], ambient: { kind: 'ember', n: 60, colors: ['#ffd060', '#ff8a3a', '#ff5a2a'] },
  },
  {
    id: 'seafoam', name: 'Seafoam Shore', desc: 'A sandy beach ringed by the sea.',
    ground: [[200, 176, 128], [212, 188, 138], [222, 200, 150], [232, 212, 162], [240, 222, 176], [248, 234, 192]],
    lines: 'rgba(255,255,255,0.6)', rock: ['#a89880', '#f4ecd8', '#c8b8a0', '#7a6a58', '#5a4c40'], deco: 'shell',
    outer: [[40, 110, 170], [52, 128, 190], [70, 148, 206]], ambient: { kind: 'sparkle', n: 30, colors: ['#ffffff', '#d8f4ff'] },
  },
  {
    id: 'indigo', name: 'Indigo Plateau Stadium', desc: 'The league stadium court under the lights.',
    ground: 'court', lines: 'rgba(255,255,255,0.75)', rock: ['#5a6a8a', '#c8d8f0', '#7a8aa8', '#3a4a6a', '#2a3450'], deco: 'wall',
    outer: 'crowd', ambient: { kind: 'confetti', n: 36, colors: ['#ffd84a', '#ff6a4d', '#5aa6f0', '#8ad84f'] },
  },
];
export const arenaById = id => ARENAS.find(a => a.id === id) ?? ARENAS[0];

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

// Dithered noise in the given palette (the original snow algorithm, any palette).
function paintNoise(ctx, w, h, palette, ledge = Infinity, specks = 900) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0.55 * noise2(x / 54, y / 54, 7) + 0.3 * noise2(x / 18, y / 18, 8) + 0.15 * noise2(x / 6, y / 6, 9);
      n += (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.1;
      const idx = Math.max(0, Math.min(palette.length - 1, Math.floor(((n - 0.2) / 0.6) * palette.length)));
      const [r, g, b] = palette[idx];
      const shade = y > ledge ? 0.82 : 1;
      const o = (y * w + x) * 4;
      d[o] = r * shade;
      d[o + 1] = g * shade;
      d[o + 2] = b * shade * 1.03;
      d[o + 3] = 255;
    }
  }
  for (let k = 0; k < specks; k++) {
    const o = (Math.floor(Math.random() * h) * w + Math.floor(Math.random() * w)) * 4;
    const delta = Math.random() < 0.7 ? -34 : 22;
    d[o] += delta;
    d[o + 1] += delta;
    d[o + 2] += delta;
  }
  ctx.putImageData(img, 0, 0);
}

// League court: two-tone tiles with a Poké Ball centre emblem.
function paintCourt(ctx) {
  for (let y = 0; y < WORLD_H; y += 16) {
    for (let x = 0; x < WORLD_W; x += 16) {
      ctx.fillStyle = ((x + y) / 16) % 2 ? '#4a64a8' : '#5470b4';
      ctx.fillRect(x, y, 16, 16);
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let y = 0; y < WORLD_H; y += 4) ctx.fillRect(0, y, WORLD_W, 1);
  ctx.fillStyle = '#c84a4a';
  ctx.beginPath();
  ctx.arc(180, 344.5, 30, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#e8ecf4';
  ctx.beginPath();
  ctx.arc(180, 344.5, 30, 0, Math.PI);
  ctx.fill();
}

function paintFieldLines(ctx, color) {
  const L = 14.5, R = 345.5, T = 90.5, B = 598.5, mid = 344.5;
  ctx.strokeStyle = color;
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
  ctx.fillStyle = color;
  ctx.fillRect(179, mid - 1, 2, 2);
}

// A boulder / bush / lava rock in the theme's five shades (base, highlight, light, shadow, outline).
function paintRock(ctx, cx, cy, rw, rh, [base, top, light, dark, line], glow) {
  ctx.fillStyle = 'rgba(30,36,48,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx + 1, cy + rh - 1, rw + 1, rh * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let y = -rh; y <= rh; y++) {
    for (let x = -rw; x <= rw; x++) {
      const d = (x * x) / (rw * rw) + (y * y) / (rh * rh);
      if (d > 1) continue;
      let c = base;
      if (y < -rh * 0.3 && d < 0.7) c = top;
      else if (x + y < -rw * 0.3) c = light;
      else if (y > rh * 0.4 || x + y > rw * 0.8) c = dark;
      if (d > 0.8) c = line;
      if (glow && d < 0.3 && Math.random() < 0.5) c = '#ffb040';
      ctx.fillStyle = c;
      ctx.fillRect(cx + x, cy + y, 1, 1);
    }
  }
}

// Theme extras painted onto the ground: flowers, lava cracks, shells.
function paintExtras(ctx, t) {
  if (t.deco === 'bush') {
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = ['#f4f4f4', '#f2c232', '#ec7ab0'][i % 3];
      ctx.fillRect(Math.round(rand(16, 344)), Math.round(rand(92, 596)), 1, 1);
    }
  } else if (t.deco === 'lava') {
    for (let i = 0; i < 14; i++) {
      let x = rand(20, 340), y = rand(100, 590);
      for (let s = 0; s < 18; s++) {
        x += rand(-3, 3);
        y += rand(-1, 3);
        ctx.fillStyle = s % 4 ? '#e2552b' : '#ffb040';
        ctx.fillRect(Math.round(x), Math.round(y), 2, 1);
      }
    }
  } else if (t.deco === 'shell') {
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = ['#f4ecd8', '#ec9ab0', '#c8b8a0'][i % 3];
      ctx.fillRect(Math.round(rand(16, 344)), Math.round(rand(92, 596)), 2, 1);
    }
  }
}

function paintEdges(ctx, t) {
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(0, LEDGE_Y - 1, WORLD_W, 1);
  ctx.fillStyle = t.rock[3];
  ctx.fillRect(0, LEDGE_Y, WORLD_W, 1);
  ctx.fillStyle = 'rgba(36,42,56,0.35)';
  ctx.fillRect(0, LEDGE_Y + 1, WORLD_W, 3);
  if (t.deco === 'wall') {
    // Stadium barrier along the bottom and top edges.
    ctx.fillStyle = '#2a3450';
    ctx.fillRect(0, LEDGE_Y + 4, WORLD_W, WORLD_H - LEDGE_Y);
    ctx.fillRect(0, 76, WORLD_W, 8);
    for (let x = 0; x < WORLD_W; x += 24) {
      ctx.fillStyle = (x / 24) % 2 ? '#c84a4a' : '#e8ecf4';
      ctx.fillRect(x, LEDGE_Y + 8, 24, 6);
      ctx.fillRect(x, 78, 24, 4);
    }
  } else {
    for (let x = 8; x < WORLD_W; x += rand(24, 40)) {
      paintRock(ctx, Math.round(x), Math.round(rand(613, 630)), Math.round(rand(6, 12)), Math.round(rand(4, 7)), t.rock, t.deco === 'lava');
    }
    for (const x of [26, 52, 312, 338]) paintRock(ctx, x, Math.round(rand(82, 88)), Math.round(rand(5, 8)), 4, t.rock, t.deco === 'lava');
  }
  const g = ctx.createRadialGradient(180, 340, 160, 180, 340, 430);
  g.addColorStop(0, 'rgba(20,26,38,0)');
  g.addColorStop(1, 'rgba(20,26,38,0.3)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
}

const groundCache = new Map();
export function paintArena(t) {
  if (groundCache.has(t.id)) return groundCache.get(t.id);
  const c = makeCanvas(WORLD_W, WORLD_H), g = c.getContext('2d');
  if (t.ground === 'court') paintCourt(g);
  else paintNoise(g, WORLD_W, WORLD_H, t.ground, LEDGE_Y);
  paintExtras(g, t);
  paintFieldLines(g, t.lines);
  paintEdges(g, t);
  groundCache.set(t.id, c);
  return c;
}

// Repeating tile for the scenery around the arena.
function paintOuterTile(t) {
  const S = 128, c = makeCanvas(S, S), g = c.getContext('2d');
  if (t.outer === 'crowd') {
    g.fillStyle = '#1a2036';
    g.fillRect(0, 0, S, S);
    for (let y = 2; y < S; y += 8) {
      g.fillStyle = '#242c48';
      g.fillRect(0, y + 5, S, 2);
      for (let x = 1; x < S; x += 4) {
        g.fillStyle = ['#e0362f', '#f2c232', '#5aa6f0', '#f4f4f4', '#8ad84f', '#a060e0'][Math.floor(Math.random() * 6)];
        g.fillRect(x, y + Math.round(Math.random()), 2, 3);
      }
    }
    return c;
  }
  paintNoise(g, S, S, t.outer, Infinity, 120);
  if (t.id === 'seafoam') {
    for (let i = 0; i < 18; i++) {
      g.fillStyle = 'rgba(220,244,255,0.7)';
      g.fillRect(Math.round(rand(0, S)), Math.round(rand(0, S)), Math.round(rand(4, 10)), 1);
    }
  } else {
    for (let i = 0; i < 4; i++) {
      paintRock(g, Math.round(rand(10, S - 10)), Math.round(rand(10, S - 10)), Math.round(rand(5, 9)), Math.round(rand(4, 7)), t.rock, t.deco === 'lava');
    }
  }
  return c;
}

export class Arena {
  constructor() {
    this.marks = new GroundFX();
    this.t = 0;
    this.setTheme('mtSilver');
  }

  setTheme(id) {
    this.theme = arenaById(id);
    this.ground = paintArena(this.theme);
    this.outer = paintOuterTile(this.theme);
    this.pattern = null;
    const a = this.theme.ambient;
    this.flakes = Array.from({ length: a.n }, () => this.makeFlake(true));
  }

  makeFlake(anywhere) {
    const kind = this.theme.ambient.kind, up = kind === 'ember';
    return {
      x: rand(-20, WORLD_W + 40),
      y: anywhere ? rand(0, WORLD_H) : up ? WORLD_H + 4 : -4,
      vy: up ? -rand(20, 50) : kind === 'leaf' ? rand(12, 24) : kind === 'sparkle' ? 0 : rand(16, 38),
      vx: kind === 'leaf' ? rand(8, 20) : rand(-9, -3),
      s: Math.random() < 0.25 ? 2 : 1,
      a: rand(0.55, 0.95),
      ph: rand(0, 6.28),
      c: this.theme.ambient.colors[Math.floor(Math.random() * this.theme.ambient.colors.length)],
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
      if (f.y > WORLD_H + 4 || f.y < -6 || f.x < -24 || f.x > WORLD_W + 44) this.flakes[i] = this.makeFlake(false);
    }
    this.marks.update(dt);
  }

  // Scenery filling the rest of the screen around the arena.
  drawBackdrop(ctx) {
    this.pattern ??= ctx.createPattern(this.outer, 'repeat');
    ctx.fillStyle = this.pattern;
    ctx.fillRect(-1600, -1600, WORLD_W + 3200, WORLD_H + 3200);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-4, -4, WORLD_W + 8, WORLD_H + 8);
  }

  drawGround(ctx) {
    ctx.drawImage(this.ground, 0, 0);
    this.marks.draw(ctx);
  }

  drawSnow(ctx) {
    const kind = this.theme.ambient.kind;
    for (const f of this.flakes) {
      ctx.globalAlpha = kind === 'sparkle' ? Math.max(0, Math.sin(this.t * 3 + f.ph)) * f.a : f.a;
      ctx.fillStyle = f.c;
      if (kind === 'leaf' || kind === 'confetti') ctx.fillRect(Math.round(f.x), Math.round(f.y), 2, Math.sin(this.t * 4 + f.ph) > 0 ? 1 : 2);
      else ctx.fillRect(Math.round(f.x), Math.round(f.y), f.s, f.s);
    }
    ctx.globalAlpha = 1;
  }
}
