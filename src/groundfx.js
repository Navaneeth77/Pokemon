// Temporary arena damage. Every mark lives for a few seconds, fades out and is removed, so the
// battlefield always returns to its original look. Marks are painted at world resolution so they
// share the arena's pixel-art look.

const rand = (a, b) => a + Math.random() * (b - a);
const pick = list => list[Math.floor(Math.random() * list.length)];
const MAX_MARKS = 140;
const SQUASH = 0.72; // ground-plane perspective: circles on the ground read as ellipses

function makeStamp(r, paint) {
  const size = Math.ceil(r * 2 + 6);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  paint(c.getContext('2d'), size / 2, size / 2, r);
  return c;
}

class Stamp {
  constructor(img, x, y, life) {
    Object.assign(this, { img, x, y, life, fade: Math.min(2.5, life * 0.45) });
  }

  draw(ctx) {
    ctx.drawImage(this.img, Math.round(this.x - this.img.width / 2), Math.round(this.y - this.img.height / 2));
  }
}

function speckle(ctx, cx, cy, r, count, colourAt) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * r;
    const [colour, alpha] = colourAt(d / r);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colour;
    ctx.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d * SQUASH), 1, 1);
  }
  ctx.globalAlpha = 1;
}

function paintScorch(ctx, cx, cy, r) {
  speckle(ctx, cx, cy, r, Math.ceil(r * r * 1.3), k => [k < 0.5 ? '#231f22' : '#47403f', (1 - k) * 0.5 + 0.08]);
}

function jaggedLines(ctx, cx, cy, r, arms, colour) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1;
  for (let i = 0; i < arms; i++) {
    let a = (i / arms) * Math.PI * 2 + rand(-0.3, 0.3), x = cx, y = cy;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < r * 1.2; s += 3) {
      a += rand(-0.6, 0.6);
      x += Math.cos(a) * 3;
      y += Math.sin(a) * 3 * SQUASH;
      ctx.lineTo(Math.round(x) + 0.5, Math.round(y) + 0.5);
    }
    ctx.stroke();
  }
}

function paintBurn(ctx, cx, cy, r) {
  paintScorch(ctx, cx, cy, r);
  jaggedLines(ctx, cx, cy, r, 5, 'rgba(30,28,38,0.7)');
  speckle(ctx, cx, cy, r * 0.8, 6, () => ['#ffe066', 0.8]);
}

function paintFrost(ctx, cx, cy, r) {
  ctx.fillStyle = 'rgba(214,242,255,0.6)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * SQUASH, 0, 0, Math.PI * 2);
  ctx.fill();
  speckle(ctx, cx, cy, r, Math.ceil(r * r * 0.7), () => [pick(['#ffffff', '#e4f8ff', '#9ee3ff']), 0.9]);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const a = rand(0, Math.PI * 2), d = rand(0, r * 0.6), l = rand(2, r * 0.5);
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * SQUASH;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * SQUASH);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(120,205,245,0.7)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * SQUASH, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function paintWet(ctx, cx, cy, r) {
  ctx.fillStyle = 'rgba(60,88,124,0.4)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(130,175,220,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.1, cy + 1, r * 0.6, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.2, cy - r * 0.15, r * 0.45, r * 0.22, 0, Math.PI * 1.1, Math.PI * 1.7);
  ctx.stroke();
  speckle(ctx, cx, cy, r * 1.3, Math.ceil(r * 0.8), () => ['#4f6f94', 0.6]);
}

const paintEnergy = rgb => (ctx, cx, cy, r) => {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(${rgb},0.55)`);
  g.addColorStop(0.7, `rgba(${rgb},0.2)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, SQUASH);
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
  paintScorch(ctx, cx, cy, r * 0.45);
};

function paintLeaves(ctx, cx, cy, r) {
  ctx.strokeStyle = 'rgba(40,90,30,0.6)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const y = cy + rand(-r * 0.4, r * 0.4);
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.8, y + rand(-2, 2));
    ctx.lineTo(cx + r * 0.8, y + rand(-2, 2));
    ctx.stroke();
  }
  for (let i = 0; i < Math.ceil(r); i++) {
    const a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * r;
    ctx.fillStyle = pick(['#9be05a', '#5fb946', '#3a8a2a']);
    ctx.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d * SQUASH), Math.random() < 0.5 ? 2 : 1, 1);
  }
}

// Earthquake-style fracture: cracks race outward from the impact, slabs of ground are pushed up
// around a central pit, and loose rubble is scattered. It all fades out after several seconds.
class Fracture {
  constructor(x, y, R, life) {
    Object.assign(this, { x, y, R, life, fade: 2.2, grow: 0.45 });
    this.cracks = [];
    const arms = 7 + Math.floor(Math.random() * 4);
    const angles = [];
    for (let i = 0; i < arms; i++) {
      const a = (i / arms) * Math.PI * 2 + rand(-0.25, 0.25);
      angles.push(a);
      this.crack(a, Math.cos(a) * R * 0.12, Math.sin(a) * R * 0.12 * SQUASH, R * rand(0.75, 1.1), 1.8, 0);
    }
    this.slabs = this.makeSlabs(angles.sort((p, q) => p - q));
    this.rubble = Array.from({ length: Math.round(R * 0.45) }, () => {
      const a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * R * 0.9;
      return { x: Math.round(Math.cos(a) * d), y: Math.round(Math.sin(a) * d * SQUASH), d, s: Math.random() < 0.35 ? 2 : 1, c: pick(['#6b7380', '#8e96a3', '#4a515c', '#eef2f6']) };
    });
  }

  crack(angle, sx, sy, len, width, depth) {
    const pts = [[sx, sy, Math.hypot(sx, sy / SQUASH)]];
    let a = angle, x = sx, y = sy;
    for (let s = 0; s < len; s += 4) {
      a += rand(-0.45, 0.45);
      a += (angle - a) * 0.3;
      x += Math.cos(a) * 4;
      y += Math.sin(a) * 4 * SQUASH;
      pts.push([x, y, Math.hypot(x, y / SQUASH)]);
      if (depth < 1 && s > len * 0.25 && Math.random() < 0.18) {
        this.crack(a + (Math.random() < 0.5 ? -1 : 1) * rand(0.5, 1), x, y, (len - s) * rand(0.3, 0.55), width * 0.6, depth + 1);
      }
    }
    this.cracks.push({ pts, width });
  }

  makeSlabs(angles) {
    const slabs = [];
    for (let i = 0; i < angles.length; i++) {
      if (Math.random() < 0.3) continue;
      const a0 = angles[i] + 0.08;
      const a1 = (i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2) - 0.08;
      const r0 = this.R * rand(0.15, 0.22), r1 = this.R * rand(0.36, 0.5);
      const poly = [];
      for (let k = 0; k <= 3; k++) {
        const a = a0 + ((a1 - a0) * k) / 3, r = r1 * rand(0.9, 1.08);
        poly.push([Math.cos(a) * r, Math.sin(a) * r * SQUASH]);
      }
      for (let k = 3; k >= 0; k--) {
        const a = a0 + ((a1 - a0) * k) / 3;
        poly.push([Math.cos(a) * r0, Math.sin(a) * r0 * SQUASH]);
      }
      slabs.push({ poly, lift: rand(1.5, 3.5), tone: pick(['#e2e7ed', '#d0d7e0', '#c0c8d2']) });
    }
    return slabs;
  }

  static path(ctx, poly, dy) {
    ctx.beginPath();
    poly.forEach(([px, py], i) => (i ? ctx.lineTo(px, py + dy) : ctx.moveTo(px, py + dy)));
    ctx.closePath();
  }

  strokeCrack(ctx, pts, front, ox, oy) {
    ctx.beginPath();
    let started = false;
    for (const [px, py, r] of pts) {
      if (r > front) break;
      if (started) ctx.lineTo(px + ox, py + oy);
      else {
        ctx.moveTo(px + ox, py + oy);
        started = true;
      }
    }
    if (started) ctx.stroke();
  }

  draw(ctx) {
    const t = this.age;
    const front = this.R * 1.15 * Math.min(1, t / this.grow);
    const pop = Math.min(1, t / 0.12);
    const jitter = t < 0.4 ? (Math.random() * 2 - 1) * (1 - t / 0.4) * 1.5 : 0;
    ctx.save();
    ctx.translate(Math.round(this.x + jitter), Math.round(this.y));
    ctx.fillStyle = 'rgba(38,36,46,0.6)';
    ctx.beginPath();
    ctx.ellipse(0, 0, this.R * 0.2 * pop, this.R * 0.14 * pop, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const s of this.slabs) {
      Fracture.path(ctx, s.poly, 2);
      ctx.fillStyle = 'rgba(28,30,40,0.42)';
      ctx.fill();
      Fracture.path(ctx, s.poly, -s.lift * pop);
      ctx.fillStyle = s.tone;
      ctx.fill();
      ctx.strokeStyle = '#555c6a';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const c of this.cracks) {
      ctx.strokeStyle = '#2b2f39';
      ctx.lineWidth = c.width;
      this.strokeCrack(ctx, c.pts, front, 0, 0);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 0.6;
      this.strokeCrack(ctx, c.pts, front, 0.8, 0.9);
    }
    for (const r of this.rubble) {
      if (r.d > front) continue;
      ctx.fillStyle = r.c;
      ctx.fillRect(r.x, r.y, r.s, r.s);
    }
    ctx.restore();
  }
}

export class GroundFX {
  constructor() {
    this.list = [];
  }

  clear() {
    this.list.length = 0;
  }

  add(mark) {
    mark.age = 0;
    this.list.push(mark);
    if (this.list.length > MAX_MARKS) this.list.shift();
    return mark;
  }

  update(dt) {
    let w = 0;
    for (const m of this.list) {
      m.age += dt;
      if (m.age < m.life) this.list[w++] = m;
    }
    this.list.length = w;
  }

  draw(ctx) {
    for (const m of this.list) {
      ctx.globalAlpha = Math.max(0, Math.min(1, m.age / 0.08, (m.life - m.age) / m.fade));
      m.draw(ctx);
    }
    ctx.globalAlpha = 1;
  }

  stamp(x, y, r, life, paint) {
    return this.add(new Stamp(makeStamp(r, paint), x, y, life));
  }

  scorch(x, y, r, life = 5) { return this.stamp(x, y, r, life, paintScorch); }
  burn(x, y, r, life = 5) { return this.stamp(x, y, r, life, paintBurn); }
  frost(x, y, r, life = 6) { return this.stamp(x, y, r, life, paintFrost); }
  wet(x, y, r, life = 5) { return this.stamp(x, y, r * 1.2, life, paintWet); }
  leaves(x, y, r, life = 5) { return this.stamp(x, y, r, life, paintLeaves); }
  energy(x, y, r, rgb, life = 4) { return this.stamp(x, y, r, life, paintEnergy(rgb.join(','))); }
  dragon(x, y, r, life = 4) { return this.energy(x, y, r, [140, 100, 255], life); }
  fracture(x, y, R, life = 6.5) { return this.add(new Fracture(x, y, R, life)); }
}
