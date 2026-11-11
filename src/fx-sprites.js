// Hand-drawn pixel-art effect animations (public/fx, credits in public/fx/CREDITS.txt), played at native pixel size.
//
//   preloadFxSheets()                        loads every sheet and finds its real frames (blank cells are skipped)
//   new FxSprite(key, x, y, z, { scale, tint, speed, flip, layer, anchor })   plays one through once
//   hasFx(key)                               true once the sheet is loaded (effects are skipped until then)
//
// `tint` recolours a sheet (cached per colour), so one animation can serve several types.
import { loadImage } from './assets.js';
import { Effect } from './effects.js';

// fw × fh frame size; fps playback; anchor 'bottom' plants the frame on the ground (bolts, fire bombs).
export const FX_META = {
  magicspell: { fw: 100, fh: 100, fps: 90 }, bluefire: { fw: 100, fh: 100, fps: 90 }, magickahit: { fw: 100, fh: 100, fps: 90 },
  flamelash: { fw: 100, fh: 100, fps: 90 }, firespin: { fw: 100, fh: 100, fps: 90 }, protection: { fw: 100, fh: 100, fps: 70 },
  weaponhit: { fw: 100, fh: 100, fps: 60 }, fire: { fw: 100, fh: 100, fps: 90, anchor: 'bottom' }, nebula: { fw: 100, fh: 100, fps: 90 },
  vortex: { fw: 100, fh: 100, fps: 90 }, phantom: { fw: 100, fh: 100, fps: 80 }, sunburn: { fw: 100, fh: 100, fps: 90 },
  felspell: { fw: 100, fh: 100, fps: 90 }, midnight: { fw: 100, fh: 100, fps: 90 }, freezing: { fw: 100, fh: 100, fps: 90 },
  bubbles: { fw: 100, fh: 100, fps: 90 },
  spark: { fw: 32, fh: 32, fps: 20 }, lightning: { fw: 64, fh: 128, fps: 20, anchor: 'bottom' }, darkbolt: { fw: 88, fh: 88, fps: 20 },
  firebomb: { fw: 64, fh: 64, fps: 22, anchor: 'bottom' }, gravityburst: { fw: 92, fh: 92, fps: 22 }, plasmaburst: { fw: 38, fh: 38, fps: 22 },
  plasmasparkle: { fw: 13, fh: 13, fps: 18 }, radialspark: { fw: 64, fh: 64, fps: 20 },
};

const SHEETS = {};
export const hasFx = key => !!SHEETS[key];

// Frames that actually contain something, in reading order.
function realFrames(img, fw, fh) {
  const cols = Math.floor(img.width / fw), rows = Math.floor(img.height / fh), c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const data = x.getImageData(0, 0, img.width, img.height).data, frames = [];
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      let any = false;
      for (let y = r * fh; y < (r + 1) * fh && !any; y += 2) {
        for (let xx = q * fw; xx < (q + 1) * fw; xx += 2) if (data[(y * img.width + xx) * 4 + 3] > 16) { any = true; break; }
      }
      frames.push(any ? [q * fw, r * fh] : null);
    }
  }
  // Keep everything between the first and last non-blank frame (blank frames in the middle are part of the timing).
  const first = frames.findIndex(Boolean), last = frames.length - 1 - [...frames].reverse().findIndex(Boolean);
  return first < 0 ? [] : frames.slice(first, last + 1).map((f, i, all) => f ?? all.slice(0, i).reverse().find(Boolean) ?? [0, 0]);
}

export async function preloadFxSheets() {
  if (typeof document === 'undefined') return;
  await Promise.all(Object.entries(FX_META).map(async ([key, meta]) => {
    try {
      const img = await loadImage(`/fx/${key}.png`);
      const frames = realFrames(img, meta.fw, meta.fh);
      if (frames.length) SHEETS[key] = { img, meta, frames, tints: new Map() };
    } catch { /* a missing sheet just means that effect is skipped */ }
  }));
}

// The sheet recoloured toward `color`, keeping its light and dark pixels (cached).
function tinted(sheet, color) {
  let c = sheet.tints.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = sheet.img.width;
  c.height = sheet.img.height;
  const x = c.getContext('2d');
  x.drawImage(sheet.img, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.globalAlpha = 0.6;
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  sheet.tints.set(color, c);
  return c;
}

export class FxSprite extends Effect {
  constructor(key, x, y, z = 0, { scale = 1, tint = null, speed = 1, flip = false, layer = 'air', anchor = null } = {}) {
    const s = SHEETS[key], fps = (s?.meta.fps ?? 30) * speed;
    super(layer, s ? s.frames.length / fps : 0.001);
    Object.assign(this, { key, x, y, z, scale, tint, fps, flip, anchor: anchor ?? s?.meta.anchor ?? 'center' });
  }

  draw(ctx) {
    const s = SHEETS[this.key];
    if (!s) return;
    const [sx, sy] = s.frames[Math.min(s.frames.length - 1, Math.floor(this.age * this.fps))];
    const { fw, fh } = s.meta, w = fw * this.scale, h = fh * this.scale;
    const dx = Math.round(this.x - w / 2), dy = Math.round(this.y - this.z - (this.anchor === 'bottom' ? h : h / 2));
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (this.flip) {
      ctx.translate(dx * 2 + w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(this.tint ? tinted(s, this.tint) : s.img, sx, sy, fw, fh, dx, dy, w, h);
    ctx.restore();
  }
}
