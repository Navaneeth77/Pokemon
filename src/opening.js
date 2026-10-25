import { AnimatedSprite } from './sprite.js';

// Change the game's title here (it is also used by the title menu and the page title).
export const GAME_TITLE = { top: 'POKÉMON', bottom: 'CHAOS ARENA', tag: 'A FAN-MADE BATTLE GAME', full: 'Pokémon: Chaos Arena' };

// Pixel-art opening: drawn at a low logical resolution and scaled up by a whole number with no
// smoothing, like a handheld screen. Timeline in seconds; any input jumps to PRESS START.
const T = { fade: 0.9, mons: 1.9, flash: 3.1, title: 3.3, ball: 4.2, open: 5.0, press: 5.3 };
const SKY = ['#0b0a1f', '#141235', '#1d1a4a', '#2a2160', '#3d2a72', '#5a3482'];
const ease = t => 1 - (1 - t) ** 3;
const RAY_HEIGHT = 80; // visible height of Rayquaza's sprite above its feet

export class Opening {
  constructor(canvas, sprites, onStart) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onStart = onStart;
    this.t = 0;
    this.running = false;
    this.mons = [
      { set: sprites.rayquaza, x: 0.5, y: 0.6, from: 0.75, dir: 0, delay: 0.3, shadow: true },
      { set: sprites.charizard, x: 0.22, y: 0.7, from: -0.4, dir: 2, delay: 0 },
      { set: sprites.pikachu, x: 0.8, y: 0.74, from: 1.4, dir: 6, delay: 0.15 },
      { set: sprites.eevee, x: 0.38, y: 0.9, from: -0.3, dir: 1, delay: 0.25 },
      { set: sprites.bidoof, x: 0.63, y: 0.91, from: 1.3, dir: 7, delay: 0.35 },
    ].filter(m => m.set).map(m => ({ ...m, sprite: new AnimatedSprite(m.set) }));
    this.stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 0.55, p: Math.random() * 6 }));
    this.snow = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random(), s: 6 + Math.random() * 14, w: Math.random() * 6 }));
    this.ridges = [0.62, 0.7, 0.8].map((base, layer) => {
      const pts = [];
      let h = 0;
      for (let i = 0; i <= 64; i++) {
        h = Math.max(-0.08, Math.min(0.08, h + (Math.random() - 0.5) * 0.05));
        const peak = layer === 0 ? Math.max(0, 0.32 - Math.abs(i / 64 - 0.5) * 1.1) : 0;
        pts.push(base - peak - h * (1 - layer * 0.3));
      }
      return pts;
    });
    this.resize = this.resize.bind(this);
  }

  start() {
    this.running = true;
    this.t = 0;
    this.last = performance.now();
    this.resize();
    window.addEventListener('resize', this.resize);
    const frame = now => {
      if (!this.running) return;
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.t += dt;
      for (const m of this.mons) m.sprite.update(dt);
      this.draw();
    };
    requestAnimationFrame(frame);
  }

  stop() {
    this.running = false;
    window.removeEventListener('resize', this.resize);
  }

  get ready() { return this.t >= T.press; }

  skip() {
    if (this.t < T.press) this.t = T.press;
  }

  // Whole-number scale so every art pixel is a crisp block on screen.
  resize() {
    const vw = window.innerWidth, vh = window.visualViewport?.height ?? window.innerHeight;
    this.scale = Math.max(2, Math.floor(Math.min(vw, vh) / 220));
    this.W = Math.ceil(vw / this.scale);
    this.H = Math.ceil(vh / this.scale);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.canvas.style.width = `${this.W * this.scale}px`;
    this.canvas.style.height = `${this.H * this.scale}px`;
  }

  draw() {
    const { ctx, W, H, t } = this;
    ctx.imageSmoothingEnabled = false;
    // Sky in flat bands (a limited palette, like a handheld background).
    SKY.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(0, Math.floor((H * 0.7 * i) / SKY.length), W, Math.ceil((H * 0.7) / SKY.length) + 1);
    });
    for (const s of this.stars) {
      if (Math.sin(t * 3 + s.p) > -0.3) {
        ctx.fillStyle = Math.sin(t * 2 + s.p) > 0.6 ? '#ffffff' : '#9a9ad8';
        ctx.fillRect(Math.floor(s.x * W), Math.floor(s.y * H), 1, 1);
      }
    }
    // Moon.
    const mx = Math.floor(W * 0.78), my = Math.floor(H * 0.16), r = Math.max(6, Math.floor(H * 0.05));
    ctx.fillStyle = '#f4e8c0';
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y));
      ctx.fillRect(mx - w, my + y, w * 2, 1);
    }
    ctx.fillStyle = '#d8c890';
    ctx.fillRect(mx - Math.floor(r / 3), my - Math.floor(r / 4), 2, 2);
    ctx.fillRect(mx + Math.floor(r / 4), my + Math.floor(r / 3), 3, 2);
    // Mountain layers: Mt. Silver in the middle with snowy peaks.
    const cols = [['#2c2654', '#e8ecf8'], ['#221d44', '#c8d0e8'], ['#18142f', '#a8b4d0']];
    this.ridges.forEach((pts, layer) => {
      const [rock, snow] = cols[layer];
      for (let x = 0; x < W; x++) {
        const k = (x / W) * 64, i = Math.floor(k), f = k - i;
        const top = Math.floor(H * (pts[i] * (1 - f) + pts[Math.min(64, i + 1)] * f));
        ctx.fillStyle = rock;
        ctx.fillRect(x, top, 1, H - top);
        ctx.fillStyle = snow;
        ctx.fillRect(x, top, 1, layer === 0 ? 3 : 1);
      }
    });
    // Pokémon: silhouettes slide in, then a flash reveals them.
    for (const m of this.backdrop ? [] : this.mons) {
      const k = ease(Math.min(1, Math.max(0, (t - T.mons - m.delay) / 0.9)));
      if (k <= 0) continue;
      const x = Math.floor(W * (m.from + (m.x - m.from) * k));
      if (m.shadow) {
        // Rayquaza stays a looming shadow below the title: pitch-black silhouette, slow hover, faint aura.
        const feet = Math.min(Math.floor(H * 0.86), Math.max(Math.floor(H * m.y), this.titleBottom() + RAY_HEIGHT));
        const y = Math.floor(feet + (1 - k) * H * 0.3 + Math.sin(t * 1.4) * 2);
        const glow = 0.16 + 0.08 * Math.sin(t * 2.2);
        const g = ctx.createRadialGradient(x, y - RAY_HEIGHT / 2, 4, x, y - RAY_HEIGHT / 2, RAY_HEIGHT * 0.8);
        g.addColorStop(0, `rgba(70,220,150,${glow * k})`);
        g.addColorStop(1, 'rgba(70,220,150,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - RAY_HEIGHT, y - RAY_HEIGHT * 1.4, RAY_HEIGHT * 2, RAY_HEIGHT * 1.6);
        m.sprite.draw(ctx, x, y, m.dir, { flash: 1, flashColor: '#05040c' });
        continue;
      }
      const y = Math.floor(H * m.y);
      const reveal = Math.min(1, Math.max(0, (t - T.flash) / 0.6));
      m.sprite.draw(ctx, x, y, m.dir, { flash: 1 - reveal * 0.95, flashColor: '#0a0818' });
    }
    // Snowfall over everything.
    ctx.fillStyle = '#f4f6ff';
    for (const s of this.snow) {
      const y = (s.y * H + t * s.s) % H, x = (s.x * W + Math.sin(t + s.w) * 3 + W) % W;
      ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
    }
    if (this.backdrop) return; // the main menu page keeps the sky, moon, mountains and snow only
    if (t > T.flash && t < T.flash + 0.25) {
      ctx.fillStyle = `rgba(255,255,255,${1 - (t - T.flash) / 0.25})`;
      ctx.fillRect(0, 0, W, H);
    }
    this.drawTitle();
    this.drawBall();
    if (this.ready && Math.floor(t * 2.2) % 2 === 0) {
      const touch = matchMedia('(pointer: coarse)').matches;
      this.text(touch ? 'TAP TO START' : 'PRESS START', W / 2, Math.floor(H * 0.9), 9, '#ffffff', '#1c1b24');
    }
    // Black at the start, fading in four hard steps (a retro fade).
    const fade = t < T.fade ? 1 : 1 - Math.min(1, Math.floor(((t - T.fade) / 0.6) * 4) / 4);
    if (fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  text(str, x, y, size, fill, stroke, font = 'Pixelify Sans', weight = 700) {
    const { ctx } = this;
    ctx.font = `${weight} ${size}px "${font}"`;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, size / 4);
    ctx.strokeStyle = stroke;
    ctx.strokeText(str, Math.floor(x), Math.floor(y));
    ctx.fillStyle = fill;
    ctx.fillText(str, Math.floor(x), Math.floor(y));
  }

  // Bottom edge of the logo and tagline (same maths as drawTitle).
  titleBottom() {
    const { W, H } = this, size = Math.max(14, Math.floor(Math.min(W / 6.5, H / 8)));
    const y = Math.floor(H * 0.2), by = y + Math.floor(size * 0.35), bh = Math.floor(size * 0.8);
    return by + bh + Math.floor(size * 0.55) + 4;
  }

  // The logo exactly as the start screen draws it (same code, size and pixel scale), cropped onto its
  // own canvas so the main menu page can show it.
  logoCanvas() {
    const { W, H, scale } = this, h = Math.min(H, this.titleBottom() + 8);
    const full = document.createElement('canvas');
    full.width = W;
    full.height = h;
    const main = this.ctx, t = this.t;
    this.ctx = full.getContext('2d', { willReadFrequently: true });
    this.t = Math.max(t, T.title + 1); // fully dropped in, as it rests on the start screen
    try {
      this.drawTitle();
    } finally {
      this.ctx = main;
      this.t = t;
    }
    const d = full.getContext('2d').getImageData(0, 0, W, h).data;
    let x0 = W, x1 = -1, y0 = h, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < W; x++) {
        if (!d[(y * W + x) * 4 + 3]) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    const c = document.createElement('canvas'), cw = Math.max(1, x1 - x0 + 1), ch = Math.max(1, y1 - y0 + 1);
    c.width = cw;
    c.height = ch;
    c.getContext('2d').drawImage(full, x0, y0, cw, ch, 0, 0, cw, ch);
    c.style.width = `${cw * scale}px`;
    c.style.height = `${ch * scale}px`;
    return c;
  }

  drawTitle() {
    const { W, H, t } = this, k = Math.min(1, Math.max(0, (t - T.title) / 0.5));
    if (k <= 0) return;
    const drop = (1 - ease(k)) * -H * 0.3, size = Math.max(14, Math.floor(Math.min(W / 6.5, H / 8)));
    const y = Math.floor(H * 0.2 + drop);
    this.text(GAME_TITLE.top, W / 2, y, size, '#ffd84a', '#2a4aa8', 'Luckiest Guy', 400);
    // Red banner behind the second word.
    this.ctx.font = `400 ${Math.floor(size * 0.72)}px "Luckiest Guy"`;
    const by = y + Math.floor(size * 0.35), bh = Math.floor(size * 0.8), bw = Math.min(W - 6, Math.floor(this.ctx.measureText(GAME_TITLE.bottom).width + size * 0.8));
    this.ctx.fillStyle = '#7a1410';
    this.ctx.fillRect(Math.floor(W / 2 - bw / 2) - 2, by - 2, bw + 4, bh + 4);
    this.ctx.fillStyle = '#d63a2a';
    this.ctx.fillRect(Math.floor(W / 2 - bw / 2), by, bw, bh);
    this.text(GAME_TITLE.bottom, W / 2, by + Math.floor(bh * 0.82), Math.floor(size * 0.72), '#ffffff', '#3a0a08', 'Luckiest Guy', 400);
    this.text(GAME_TITLE.tag, W / 2, by + bh + Math.floor(size * 0.55), Math.max(6, Math.floor(size * 0.3)), '#c8d0f0', '#1c1b24');
  }

  // A Poké Ball drops in, bounces, then bursts open.
  drawBall() {
    const { ctx, W, H, t } = this;
    if (t < T.ball) return;
    const r = Math.max(5, Math.floor(H * 0.03)), x = Math.floor(W * 0.27), ground = Math.floor(H * 0.82);
    const k = t - T.ball;
    let y = ground;
    if (k < 0.45) y = Math.floor(-r + (ground + r) * (k / 0.45) ** 2);
    else if (k < 0.75) y = ground - Math.floor(Math.sin(((k - 0.45) / 0.3) * Math.PI) * H * 0.06);
    const wobble = k > 0.75 && t < T.open ? Math.round(Math.sin(k * 30)) : 0;
    if (t < T.open) {
      for (let dy = -r; dy <= r; dy++) {
        const w = Math.floor(Math.sqrt(r * r - dy * dy));
        ctx.fillStyle = dy < 0 ? '#e0362f' : '#f4f4f4';
        ctx.fillRect(x - w + wobble, y + dy, w * 2, 1);
      }
      ctx.fillStyle = '#1c1b24';
      ctx.fillRect(x - r + wobble, y, r * 2, 1);
      ctx.fillRect(x - 2 + wobble, y - 1, 4, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 1 + wobble, y, 2, 1);
      return;
    }
    // Burst of light rays as it opens.
    const b = t - T.open;
    if (b < 0.8) {
      ctx.fillStyle = `rgba(255,255,255,${1 - b / 0.8})`;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, len = Math.floor(10 + b * 120);
        for (let d = 4; d < len; d += 2) ctx.fillRect(Math.floor(x + Math.cos(a) * d), Math.floor(y + Math.sin(a) * d), 1, 1);
      }
    }
    // Open halves resting on the ground.
    ctx.fillStyle = '#e0362f';
    ctx.fillRect(x - r - 2, y - 3, r, 3);
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(x + 2, y - 3, r, 3);
  }
}
