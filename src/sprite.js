import { TICK } from './assets.js';

const scratch = document.createElement('canvas');
const sctx = scratch.getContext('2d');

// PMD row order: Down, DownRight, Right, UpRight, Up, UpLeft, Left, DownLeft.
export function dirFromVector(dx, dy) {
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return ((Math.round((90 - deg) / 45) % 8) + 8) % 8;
}

// Not every SpriteCollab sheet has every animation (e.g. Mega Charizard X has no Strike/Faint).
const FALLBACK = { Fly: 'Idle', SpAttack: 'Shoot', Hop: 'Attack', Rotate: 'Attack', Double: 'Idle', Strike: 'Attack', RearUp: 'Attack', Swing: 'Attack', Shoot: 'Attack', Faint: 'Hurt', Charge: 'Idle', Walk: 'Idle', Hurt: 'Idle' };

export class AnimatedSprite {
  constructor(set) {
    this.set = set;
    this.play('Idle', { force: true });
  }

  has(name) {
    return name in this.set.anims;
  }

  resolve(name) {
    let n = name;
    while (n && !this.set.anims[n]) n = FALLBACK[n];
    return this.set.anims[n] ?? this.set.anims.Idle;
  }

  play(name, { loop = true, speed = 1, force = false } = {}) {
    const anim = this.resolve(name);
    if (!force && this.anim === anim && this.loop === loop && !this.done) {
      this.speed = speed;
      return;
    }
    this.anim = anim;
    this.loop = loop;
    this.speed = speed;
    this.frame = 0;
    this.t = 0;
    this.done = false;
    this.pauseAt = null;
  }

  update(dt) {
    if (this.done) return;
    this.t += dt * this.speed;
    for (;;) {
      if (this.pauseAt != null && this.frame >= this.pauseAt) {
        this.frame = Math.min(this.pauseAt, this.anim.frames - 1);
        this.t = 0;
        return;
      }
      const dur = this.anim.durations[this.frame] * TICK;
      if (this.t < dur) return;
      this.t -= dur;
      if (this.frame + 1 < this.anim.frames) this.frame++;
      else if (this.loop) this.frame = 0;
      else {
        this.done = true;
        return;
      }
    }
  }

  // Frames are centred on the Pokémon's ground position.
  draw(ctx, x, y, dir, opts = {}) {
    const a = this.anim, s = opts.scale ?? 1;
    const w = a.fw * s, h = a.fh * s;
    blit(ctx, a.image, this.frame * a.fw, (a.rows > 1 ? dir : 0) * a.fh, a.fw, a.fh,
      Math.round(x - w / 2), Math.round(y - h / 2 + (a.yOffset ?? 0) * s), w, h, opts);
  }
}

// Draws part of an image, optionally tinted toward a flash colour and mirrored horizontally.
export function blit(ctx, src, sx, sy, sw, sh, dx, dy, dw, dh, { alpha = 1, flash = 0, flashColor = '#fff', flip = false, smooth = false } = {}) {
  if (flash > 0) {
    if (scratch.width !== sw || scratch.height !== sh) {
      scratch.width = sw;
      scratch.height = sh;
    } else sctx.clearRect(0, 0, sw, sh);
    sctx.globalCompositeOperation = 'source-over';
    sctx.globalAlpha = 1;
    sctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
    sctx.globalCompositeOperation = 'source-atop';
    sctx.globalAlpha = Math.min(1, flash);
    sctx.fillStyle = flashColor;
    sctx.fillRect(0, 0, sw, sh);
    sctx.globalCompositeOperation = 'source-over';
    sctx.globalAlpha = 1;
    src = scratch;
    sx = 0;
    sy = 0;
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = smooth;
  if (flip) {
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, dw, dh);
  } else ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
  ctx.restore();
}
