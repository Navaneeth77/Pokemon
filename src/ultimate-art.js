import { loadImage } from './assets.js';
import { Effect } from './effects.js';

const names = [
  'shuriken', 'splash', 'leaf-cut', 'steel-cut', 'leaves', 'dreepy', 'water-shot',
  'spirit-arrow', 'petals', 'roots', 'debris', 'aura-sphere',
  'aura-break', 'ribbons', 'frost',
];
const art = new Map();

export async function preloadUltimateArt() {
  await Promise.allSettled(names.map(async name => {
    art.set(name, await loadImage(`/art/ultimates/${name}.webp`));
  }));
}

export function paintUltimate(ctx, name, x, y, width, { angle = 0, alpha = 1, lift = 0, aspect = 1, flip = false } = {}) {
  const image = art.get(name);
  if (!image || width <= 0 || alpha <= 0) return false;
  const height = width * image.naturalHeight / image.naturalWidth * aspect;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (flip) ctx.scale(1, -1);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha *= alpha;
  ctx.drawImage(image, -width / 2, -height * (0.5 + lift), width, height);
  ctx.restore();
  return true;
}

class ArtBurst extends Effect {
  constructor(name, x, y, size, life, look) {
    super(look.layer ?? 'air', life);
    Object.assign(this, { name, x, y, size, look });
  }

  draw(ctx) {
    const p = Math.min(1, this.age / this.life);
    const alpha = (this.look.alpha ?? 1) * Math.min(1, (1 - p) * 2.4);
    const scale = 1 - 0.28 * (1 - Math.min(1, p * 4)) ** 2;
    paintUltimate(ctx, this.name, this.x, this.y, this.size * scale, { ...this.look, alpha });
  }
}

export function ultimateArt(game, name, x, y, size, life, look = {}) {
  if (game.headless || !art.has(name)) return false;
  game.spawn(new ArtBurst(name, x, y, size, life, look));
  return true;
}
