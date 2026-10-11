import { AnimatedSprite, dirFromVector } from './sprite.js';
import { BOUNDS } from './arena.js';

const RECALL_TIME = 0.4;

export class Pokemon {
  constructor(species, spriteSet, side) {
    this.baseSpecies = species;
    this.baseSet = spriteSet;
    this.species = species;
    this.side = side;
    this.sprite = new AnimatedSprite(spriteSet);
    this.input = { x: 0, y: 0 };
    this.lastMove = { x: 0, y: 1 };
    this.foe = null;
    this.trainer = null;
    this.faceFoeWhileMoving = false;
  }

  get maxHp() { return this.species.hp; }
  get radius() { return this.species.radius; }
  get alive() { return this.hp > 0; }
  get isMega() { return this.species !== this.baseSpecies; }
  // Heights of the body centre and head above the ground, including flight altitude.
  get bodyZ() { return this.species.bodyZ + this.z; }
  get headZ() { return this.species.headZ + this.z; }

  // A fresh battle: full HP, base form.
  reset(x, y, dir) {
    this.species = this.baseSpecies;
    this.sprite.set = this.baseSet;
    this.portrait = this.baseSet.portrait;
    this.hp = this.maxHp;
    this.enter(x, y, dir);
  }

  // (Re)enters the field: clears transient combat state but keeps HP, form and Mega status.
  // Stays hidden until its trainer's Poké Ball opens.
  enter(x, y, dir) {
    Object.assign(this, {
      x, y, z: 0, vx: 0, vy: 0, dir,
      shownHp: this.hp, trailHp: this.hp, trailDelay: 0,
      action: null, cooldowns: {}, busy: 0, root: 0, stagger: 0, frozen: 0, burn: 0, burnTick: 0,
      flash: 0, flashColor: '#fff', appear: 0, recallT: 0, landT: 0, zOverride: null, invuln: false, phasing: false,
      fainted: !this.alive, faintT: 0, moving: false, windT: 0, flyT: 0, auraT: 0, hidden: true,
    });
    this.input.x = this.input.y = 0;
    this.sprite.play(this.idleAnim(), { force: true });
  }

  idleAnim() {
    return this.species.fly && this.sprite.has('Fly') ? 'Fly' : 'Idle';
  }

  megaEvolve(species, spriteSet) {
    this.species = species;
    this.sprite.set = spriteSet;
    this.portrait = spriteSet.portrait;
    this.sprite.play(this.idleAnim(), { force: true });
  }

  canAct() {
    return this.alive && !this.hidden && this.recallT <= 0 && !this.action && this.busy <= 0 && this.root <= 0
      && this.stagger <= 0 && this.frozen <= 0;
  }

  cooldown(id) { return this.cooldowns[id] ?? 0; }
  aimAt(t) { return Math.atan2(t.y - this.y, t.x - this.x); }
  distTo(o) { return Math.hypot(o.x - this.x, o.y - this.y); }

  face(x, y) {
    if (x !== this.x || y !== this.y) this.dir = dirFromVector(x - this.x, y - this.y);
  }

  cancelAction() {
    if (!this.action) return;
    this.action.cancel();
    this.action = null;
  }

  takeHit(dmg, { dirX, dirY, knockback, stagger, flinch }) {
    this.hp = Math.max(0, this.hp - dmg);
    this.trailDelay = 0.45;
    this.flash = 1;
    this.flashColor = '#ffffff';
    const kb = knockback / this.species.weight;
    this.vx += dirX * kb;
    this.vy += dirY * kb;
    if (!this.alive) return;
    if (flinch) this.cancelAction();
    // Attacks in progress have super armour: the hit lands but doesn't interrupt.
    if (!this.action && this.frozen <= 0) {
      this.stagger = Math.max(this.stagger, stagger);
      this.sprite.play('Hurt', { loop: false, force: true });
    }
  }

  freeze(t) {
    this.cancelAction();
    this.frozen = t;
    this.stagger = 0;
  }

  faint() {
    this.cancelAction();
    Object.assign(this, { fainted: true, faintT: 0, frozen: 0, burn: 0 });
    this.sprite.play(this.species.faintAnim ?? 'Hurt', { loop: false, force: true, speed: 0.55 });
  }

  // Hover with a wing-beat bob; actions can take over altitude (dives) or force a landing.
  updateFlight(dt) {
    if (this.zOverride != null) {
      this.z = this.zOverride;
      return;
    }
    const fly = this.species.fly;
    if (!fly) {
      this.z = 0;
      return;
    }
    if (this.fainted) {
      this.z = Math.max(0, this.z - dt * 45);
      return;
    }
    if (this.frozen > 0) return;
    this.flyT += dt;
    const target = this.landT > 0 ? 0 : fly.height + Math.sin(this.flyT * fly.freq) * fly.amp;
    this.z += (target - this.z) * Math.min(1, dt * (this.landT > 0 ? 12 : 5));
  }

  // Cosmetic-only tick used while the battle is paused for a cinematic.
  animate(dt) {
    if (this.hidden) return;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.updateFlight(dt);
    this.sprite.update(dt);
  }

  update(dt, game) {
    if (this.hidden) return;
    if (this.recallT > 0) {
      this.recallT += dt;
      return;
    }
    this.flash = Math.max(0, this.flash - dt * 5);
    this.appear = Math.max(0, this.appear - dt * 2.5);
    this.landT = Math.max(0, this.landT - dt);
    for (const id in this.cooldowns) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const drag = Math.exp(-8 * dt);
    this.vx *= drag;
    this.vy *= drag;
    this.updateFlight(dt);

    if (this.fainted) {
      this.faintT += dt;
      this.sprite.update(dt);
      this.clamp();
      return;
    }
    if (this.frozen > 0) {
      this.frozen -= dt;
      this.clamp();
      return;
    }

    this.busy = Math.max(0, this.busy - dt);
    this.root = Math.max(0, this.root - dt);
    this.stagger = Math.max(0, this.stagger - dt);
    if (this.burn > 0) {
      this.burn -= dt;
      this.burnTick -= dt;
      if (this.burnTick <= 0) {
        this.burnTick = 1;
        game.burnDamage(this);
        if (!this.alive) return;
      }
    }

    if (this.action) {
      this.action.update(dt);
      if (this.action?.done) this.action = null;
    }

    const free = this.stagger <= 0 && this.root <= 0 && (!this.action || this.action.allowMove);
    const len = Math.hypot(this.input.x, this.input.y);
    this.moving = free && len > 0.01;
    if (this.moving) {
      // Normalised so diagonals are no faster than straight movement.
      const nx = this.input.x / Math.max(1, len), ny = this.input.y / Math.max(1, len);
      const speed = this.species.speed * (this.action ? 0.55 : 1);
      this.x += nx * speed * dt;
      this.y += ny * speed * dt;
      this.lastMove.x = nx / Math.hypot(nx, ny);
      this.lastMove.y = ny / Math.hypot(nx, ny);
      if (!this.action) {
        this.dir = this.faceFoeWhileMoving && this.foe
          ? dirFromVector(this.foe.x - this.x, this.foe.y - this.y)
          : dirFromVector(nx, ny);
      }
    } else if (!this.action && this.stagger <= 0 && this.foe) {
      this.face(this.foe.x, this.foe.y);
    }

    this.windT -= dt;
    if (this.windT <= 0) {
      this.windT = this.moving ? (this.species.fly ? 0.18 : 0.16) : 0.45;
      if (this.moving || this.species.fly) game.groundDust(this);
    }
    if (this.species.aura) {
      this.auraT -= dt;
      if (this.auraT <= 0) {
        this.auraT = 0.07;
        game.auraWisp(this);
      }
    }

    if (!this.action && this.stagger <= 0) {
      // Flyers with a wing-beat animation flap (faster while moving) instead of walking.
      if (this.idleAnim() === 'Fly') this.sprite.play('Fly', { speed: this.moving ? 1.25 : 1 });
      else this.sprite.play(this.moving ? 'Walk' : 'Idle');
    }
    this.sprite.update(dt);
    this.clamp();
  }

  clamp() {
    if (this.x < BOUNDS.minX) { this.x = BOUNDS.minX; this.vx = Math.max(0, this.vx); }
    if (this.x > BOUNDS.maxX) { this.x = BOUNDS.maxX; this.vx = Math.min(0, this.vx); }
    if (this.y < BOUNDS.minY) { this.y = BOUNDS.minY; this.vy = Math.max(0, this.vy); }
    if (this.y > BOUNDS.maxY) { this.y = BOUNDS.maxY; this.vy = Math.min(0, this.vy); }
  }

  drawShadow(ctx) {
    if (this.hidden) return;
    const [rx, ry] = this.species.shadow;
    const fade = this.fainted ? Math.max(0, 1 - Math.max(0, this.faintT - 0.9) / 0.9) : 1;
    const recall = this.recallT > 0 ? 1 - Math.min(1, this.recallT / RECALL_TIME) : 1;
    const lift = Math.max(0.4, 1 - this.z / 60);
    ctx.globalAlpha = 0.3 * fade * lift * recall;
    ctx.fillStyle = '#1d2433';
    ctx.beginPath();
    ctx.ellipse(Math.round(this.x), Math.round(this.y) + 1, rx * lift, ry * lift, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  draw(ctx) {
    if (this.hidden) return;
    let alpha = 1, scale = 1;
    let flash = Math.max(this.flash, this.appear);
    let color = this.appear > 0 ? '#ffffff' : this.flashColor;
    let sink = 0;
    if (this.recallT > 0) {
      // Drawn back into the Poké Ball: turns red and shrinks away.
      const k = Math.min(1, this.recallT / RECALL_TIME);
      scale = 1 - 0.85 * k;
      alpha = 1 - 0.4 * k;
      flash = 0.85;
      color = '#ff4a3a';
    } else if (this.fainted) {
      const t = this.faintT;
      if (t < 0.9 && Math.floor(t * 14) % 2 === 0) {
        flash = Math.max(flash, 0.55);
        color = '#ffffff';
      }
      if (t > 0.9) alpha = Math.max(0, 1 - (t - 0.9) / 0.9);
      if (!this.species.faintAnim) sink = Math.min(10, t * 8);
    } else if (this.frozen > 0) {
      flash = Math.max(flash, 0.45);
      color = '#a6ecff';
    } else if (this.burn > 0 && Math.floor(performance.now() / 120) % 4 === 0) {
      flash = Math.max(flash, 0.35);
      color = '#ff7a3a';
    }
    if (alpha <= 0) return;
    // Capped so a white hit-flash never makes the sprite vanish against the snow,
    // except during send-out/recall/Mega Evolution where a full silhouette is intended.
    const cap = this.appear > 0.05 || this.recallT > 0 ? 1 : 0.65;
    this.sprite.draw(ctx, this.x, this.y - this.z + sink, this.dir, { alpha, scale, flash: Math.min(flash, cap), flashColor: color });
    if (this.frozen > 0) this.drawIce(ctx);
  }

  drawIce(ctx) {
    const w = this.radius * 2 + 8, h = this.species.headZ + 6;
    const x = Math.round(this.x - w / 2), y = Math.round(this.y - this.z - h + 3);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#bfefff';
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.beginPath();
    ctx.moveTo(x + 4, y + h * 0.5);
    ctx.lineTo(x + w * 0.45, y + 4);
    ctx.moveTo(x + w * 0.4, y + h - 4);
    ctx.lineTo(x + w - 4, y + h * 0.35);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
