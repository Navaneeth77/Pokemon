import { AnimatedSprite, dirFromVector } from './sprite.js';
import { BOUNDS } from './arena.js';
import { Afterimage, FloatText } from './effects.js';
import { abilityOf } from './data/abilities.js';
import { tickStatus, statusSpeed, tickBuffs, buffMult } from './status.js';

const RECALL_TIME = 0.4;
const DODGE_TIME = 0.2;
const DODGE_SPEED = 400;
const DODGE_INVULN = 0.28;
export const DODGE_COOLDOWN = 1.6;
export const CHARGE_MAX = 1.2; // seconds of holding for a fully charged attack
const BUFF_WISP = ['#ffffff', '#ffe680', '#ff9a5a', '#7ab8ff'];

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
  get isMega() { return this.species.megaOf === this.baseSpecies.id; }
  // Heights of the body centre and head above the ground, including flight altitude.
  get bodyZ() { return this.species.bodyZ + this.lift; }
  get headZ() { return this.species.headZ + this.lift; }
  // Height off the ground: flight altitude plus any launch from an aerial combo.
  get lift() { return this.z + (this.air?.h ?? 0); }
  get airborne() { return !!this.air; }
  // Can't be hit: soaring out of reach (invuln) or inside a dodge's invulnerability window.
  get untouchable() { return this.invuln || this.dodgeInv > 0; }

  // A fresh battle: full HP, base form.
  reset(x, y, dir) {
    this.species = this.baseSpecies;
    this.sprite.set = this.baseSet;
    this.portrait = this.baseSet.portrait;
    this.hp = this.maxHp;
    this.ult = 0;
    this.status = {};
    this.megaChoice = null;
    this.enter(x, y, dir);
  }

  // (Re)enters the field: clears transient combat state but keeps HP, form and Mega status.
  // Stays hidden until its trainer's Poké Ball opens.
  enter(x, y, dir) {
    Object.assign(this, {
      x, y, z: 0, vx: 0, vy: 0, dir,
      shownHp: this.hp, trailHp: this.hp, trailDelay: 0,
      elementAura: null, reactionUntil: 0, reactionComboUntil: 0, reactionCount: 0,
      action: null, cooldowns: {}, busy: 0, root: 0, stagger: 0, frozen: 0, status: this.status ?? {}, sGuard: {}, buffs: {},
      combo: { n: 0, uses: 0, t: 0, chain: 0, lastRole: -1, foe: null }, chainT: 0, chainRole: -1, comboHits: 0, comboTimer: 0, escapeT: 0,
      ab: {}, charging: null, typeOverride: null, shield: 0, chill: 0, form: null, air: null, guard: null, regen: null,
      flash: 0, flashColor: '#fff', appear: 0, recallT: 0, landT: 0, zOverride: null, invuln: false, phasing: false, held: false,
      fainted: !this.alive, faintT: 0, moving: false, windT: 0, flyT: 0, auraT: 0, hidden: true,
      dodgeT: 0, dodgeInv: 0, dodgeCD: 0, dodgeDir: { x: 0, y: 1 }, ghostT: 0, buffT: 0,
    });
    this.input.x = this.input.y = 0;
    this.sprite.play(this.idleAnim(), { force: true });
  }

  idleAnim() {
    return this.species.fly && this.sprite.has('Fly') ? 'Fly' : 'Idle';
  }

  // Alternate battle form that only swaps the sheet (Aegislash's Blade Forme); null restores the species' own.
  setSheet(set) {
    const name = this.sprite.anim?.name ?? 'Idle';
    this.sprite.set = set;
    this.sprite.play(name, { force: true, loop: this.sprite.loop });
  }

  // Launched into the air (aerial combos). Repeated launches rise less and fall faster.
  launch(vz) {
    if (this.remote || this.zOverride != null || this.held || !this.alive) return false;
    const a = this.air ?? (this.air = { h: 0, vz: 0, t: 0, juggle: 0, g: 950 });
    a.vz = Math.max(a.vz, vz);
    a.h = Math.max(a.h, 1);
    a.g = 950 + a.juggle * 320;
    this.cancelAction();
    return true;
  }

  updateAir(dt, game) {
    const a = this.air;
    if (!a) return;
    a.t += dt;
    a.vz -= a.g * dt;
    a.h += a.vz * dt;
    if (a.h > 0) return;
    // Touchdown: a short landing recovery, then free to act (no infinite juggles).
    this.air = null;
    if (!this.fainted) {
      this.stagger = Math.max(this.stagger, 0.22);
      this.sprite.play('Hurt', { loop: false, force: true });
    }
    game.onLand(this, -a.vz);
  }

  // Ultimate charge (0–100). Crossing 100 plays the ready cue once.
  gainUlt(game, amount) {
    if (this.remote || !this.alive || this.hidden || game.state !== 'fighting') return;
    const before = this.ult;
    this.ult = Math.min(100, this.ult + amount);
    if (before < 100 && this.ult >= 100) game.onUltReady(this);
  }

  // Holding a chargeable move. Interrupted charges (hit, stun) still cost part of the cooldown.
  cancelCharge(game, broken) {
    const c = this.charging;
    if (!c || this.remote) return;
    this.charging = null;
    if (!broken) return;
    if (abilityOf(this).chargeGuard) {
      this.charging = c;
      return;
    }
    if (game.startCooldown) game.startCooldown(this, c.id, c.move.cooldown * 0.4);
    else this.cooldowns[c.id] = Math.max(this.cooldowns[c.id] ?? 0, c.move.cooldown * 0.4);
    game.spawn(new FloatText(this.x, this.y - this.headZ - 14, 'CHARGE BROKEN', '#ff9a8a', 7));
  }

  megaEvolve(species, spriteSet) {
    const damageTaken = this.maxHp - this.hp;
    this.species = species;
    this.hp = Math.max(0, this.maxHp - damageTaken);
    this.sprite.set = spriteSet;
    this.portrait = spriteSet.portrait;
    this.sprite.play(this.idleAnim(), { force: true });
  }

  canAct() {
    return this.alive && !this.hidden && this.recallT <= 0 && !this.action && this.busy <= 0 && this.root <= 0
      && this.stagger <= 0 && this.frozen <= 0 && this.dodgeT <= 0 && !this.held && !(this.status.sleep > 0) && !this.charging
      && (!this.air || (this.species.fly && this.air.t > 0.35));
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

  takeHit(dmg, { dirX, dirY, knockback, stagger, flinch }, game) {
    this.flash = 1;
    this.flashColor = '#ffffff';
    // Online: the other player's game owns their Pokémon's HP and reactions; here a hit only flashes.
    if (this.remote) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.trailDelay = 0.45;
    const kb = knockback / this.species.weight;
    this.vx += dirX * kb;
    this.vy += dirY * kb;
    if (!this.alive) return;
    if (flinch) this.cancelAction();
    if (this.charging && stagger > 0 && game) this.cancelCharge(game, true);
    // Attacks in progress have super armour: the hit lands but doesn't interrupt.
    if (!this.action && this.frozen <= 0 && !(this.animHold > 0)) {
      this.stagger = Math.max(this.stagger, stagger);
      this.sprite.play('Hurt', { loop: false, force: true });
    }
  }

  // Quick evasive dash with a short invulnerability window. Not allowed mid-attack, stunned or frozen.
  // `force` replays a dodge the other player already made (online).
  dodge(dx, dy, force = false) {
    if (!force) {
      if (this.air && this.air.t < 0.4) return false; // can air-dodge out of a juggle only after a moment
      if (!this.alive || this.hidden || this.held || this.status.sleep > 0 || this.recallT > 0 || this.frozen > 0 || this.stagger > 0 || this.root > 0 || this.dodgeCD > 0) return false;
      if (this.action && !this.action.allowMove) return false;
    }
    const len = Math.hypot(dx, dy);
    if (len < 0.01) return false;
    this.dodgeDir = { x: dx / len, y: dy / len };
    const ab = abilityOf(this);
    this.dodgeSpeed = DODGE_SPEED * (ab.dodgeDist ?? 1);
    Object.assign(this, { dodgeT: DODGE_TIME, dodgeInv: DODGE_INVULN, dodgeCD: DODGE_COOLDOWN * (ab.dodgeCdMult ?? 1), ghostT: 0 });
    this.dir = dirFromVector(dx, dy);
    return true;
  }

  freeze(t) {
    if (this.remote) return;
    this.cancelAction();
    this.frozen = t;
    this.stagger = 0;
  }

  faint() {
    this.cancelAction();
    Object.assign(this, { elementAura: null, fainted: true, faintT: 0, frozen: 0, status: {}, buffs: {}, charging: null, held: false });
    this.sprite.play(this.species.faintAnim ?? 'Hurt', { loop: false, force: true, speed: 0.55 });
  }

  // Hover with a wing-beat bob; actions can take over altitude (dives) or force a landing.
  updateFlight(dt) {
    if (this.zOverride != null) {
      this.z = this.zOverride;
      return;
    }
    // A legendary's held cast pose also holds its altitude on online clients.
    if (this.boss && this.animHold > 0) return;
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
    if (this.elementAura && this.elementAura.until <= game.time) this.elementAura = null;
    if (this.hidden) return;
    if (this.recallT > 0) {
      this.recallT += dt;
      return;
    }
    this.flash = Math.max(0, this.flash - dt * 5);
    this.appear = Math.max(0, this.appear - dt * 2.5);
    this.landT = Math.max(0, this.landT - dt);
    const ab = abilityOf(this);
    const cdRate = (ab.cdRate ?? 1) * (this.foe && !this.foe.hidden && this.foe.alive ? abilityOf(this.foe).foeCdRate ?? 1 : 1);
    for (const id in this.cooldowns) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt * cdRate);

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const drag = Math.exp(-8 * dt);
    this.vx *= drag;
    this.vy *= drag;
    this.updateFlight(dt);
    this.updateAir(dt, game);

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
    this.animHold = Math.max(0, (this.animHold ?? 0) - dt); // a raid boss's attack animation plays through
    this.root = Math.max(0, this.root - dt);
    this.stagger = Math.max(0, this.stagger - dt);
    this.dodgeCD = Math.max(0, this.dodgeCD - dt);
    this.dodgeInv = Math.max(0, this.dodgeInv - dt);
    this.buffT = Math.max(0, this.buffT - dt);
    tickBuffs(this, dt);
    this.chainT = Math.max(0, this.chainT - dt);
    if (this.guard && (this.guard.t -= dt) <= 0) this.guard = null;
    if (this.regen) {
      this.regen.t -= dt;
      this.regen.acc += this.maxHp * this.regen.rate * dt;
      if (this.regen.acc >= 10 && game.state === 'fighting') {
        game.heal(this, this.regen.acc);
        this.regen.acc = 0;
      }
      if (this.regen.t <= 0) this.regen = null;
    }
    this.combo.t = Math.max(0, this.combo.t - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    this.escapeT = Math.max(0, this.escapeT - dt);
    if (this.escapeT > 0) this.stagger = Math.min(this.stagger, 0.05);
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      this.x += this.dodgeDir.x * (this.dodgeSpeed ?? DODGE_SPEED) * dt;
      this.y += this.dodgeDir.y * (this.dodgeSpeed ?? DODGE_SPEED) * dt;
      this.ghostT -= dt;
      if (this.ghostT <= 0) {
        this.ghostT = 0.03;
        game.spawn(new Afterimage(this, 0.2, '#e8f6ff'));
      }
    }
    if (game.state === 'fighting') {
      tickStatus(game, this, dt);
      if (!this.alive) return;
      ab.tick?.(game, this, dt);
    }
    if (this.charging) game.updateCharge(this, dt);

    if (this.action) {
      this.action.update(dt);
      if (this.action?.done) this.action = null;
    }

    const free = !this.held && !(this.status.sleep > 0) && (!this.air || this.species.fly) && this.dodgeT <= 0 && this.stagger <= 0 && this.root <= 0 && (!this.action || this.action.allowMove);
    const len = Math.hypot(this.input.x, this.input.y);
    this.moving = free && len > 0.01;
    if (this.moving) {
      // Normalised so diagonals are no faster than straight movement.
      const nx = this.input.x / Math.max(1, len), ny = this.input.y / Math.max(1, len);
      const speed = this.species.speed * (this.action ? 0.55 : 1) * (this.buffT > 0 ? 1.3 : 1) * buffMult(this, 'spd')
        * statusSpeed(this) * (ab.speedMult?.(this) ?? 1) * (this.charging ? 0.4 : 1);
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
    const glow = ab.glow?.(this);
    const buffed = this.buffT > 0 || Object.values(this.buffs).some(b => b.m > 1);
    if (this.species.aura || buffed || glow) {
      this.auraT -= dt;
      if (this.auraT <= 0) {
        this.auraT = 0.07;
        game.auraWisp(this, glow ?? (buffed ? BUFF_WISP : this.species.aura));
      }
    }

    if (this.charging) this.sprite.play('Charge');
    else if (!this.action && this.stagger <= 0 && !(this.animHold > 0)) {
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
    const lift = Math.max(0.4, 1 - this.lift / 60);
    ctx.globalAlpha = 0.3 * fade * lift * recall;
    ctx.fillStyle = '#1d2433';
    ctx.beginPath();
    ctx.ellipse(Math.round(this.x), Math.round(this.y) + 1, rx * lift, ry * lift, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  draw(ctx) {
    if (this.hidden) return;
    let alpha = this.ab.ghost > 0 ? 0.4 : 1, scale = this.drawScale ?? 1;
    let flash = Math.max(this.flash, this.appear);
    let color = this.appear > 0 ? '#ffffff' : this.flashColor;
    let sink = 0;
    if (this.recallT > 0) {
      // Drawn back into the Poké Ball: turns red and shrinks away.
      const k = Math.min(1, this.recallT / RECALL_TIME);
      scale *= 1 - 0.85 * k;
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
    } else if (this.status.burn > 0 && Math.floor(performance.now() / 120) % 4 === 0) {
      flash = Math.max(flash, 0.35);
      color = '#ff7a3a';
    } else if (this.status.poison > 0 && Math.floor(performance.now() / 140) % 5 === 0) {
      flash = Math.max(flash, 0.35);
      color = '#c060d0';
    } else if (this.ab.disguise) {
      flash = Math.max(flash, 0.3);
      color = '#3a2030';
    }
    if (alpha <= 0) return;
    // Capped so a white hit-flash never makes the sprite vanish against the snow,
    // except during send-out/recall/Mega Evolution where a full silhouette is intended.
    const cap = this.appear > 0.05 || this.recallT > 0 ? 1 : 0.65;
    this.sprite.draw(ctx, this.x, this.y - this.lift + sink, this.dir, { alpha, scale, flash: Math.min(flash, cap), flashColor: color });
    if (this.guard) this.drawGuard(ctx);
    if (this.frozen > 0) this.drawIce(ctx);
    if (this.status.sleep > 0) this.drawSleep(ctx);
    if (this.charging) this.drawCharge(ctx);
  }

  // Protective bubble while King's Shield / Quick Guard is up.
  drawGuard(ctx) {
    const g = this.guard, r = this.radius + 9, y = this.y - this.bodyZ;
    ctx.globalAlpha = 0.25 + 0.15 * Math.sin(performance.now() / 60);
    ctx.fillStyle = g.color;
    ctx.beginPath();
    ctx.ellipse(this.x, y, r, r * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = g.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawSleep(ctx) {
    const t = performance.now() / 1000;
    ctx.font = '700 7px "Pixelify Sans"';
    ctx.fillStyle = '#d8ccff';
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.8 + i / 3) % 1;
      ctx.globalAlpha = 1 - k;
      ctx.fillText('z', this.x + 6 + k * 8, this.y - this.headZ - 4 - k * 14);
    }
    ctx.globalAlpha = 1;
  }

  // Ring above the head that fills while a chargeable move is held.
  drawCharge(ctx) {
    const k = Math.min(1, this.charging.t / CHARGE_MAX), x = this.x, y = this.y - this.headZ - 9;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(10,12,20,0.75)';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = k >= 1 ? '#ffffff' : this.charging.color;
    ctx.beginPath();
    ctx.arc(x, y, 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
    ctx.stroke();
  }

  drawIce(ctx) {
    const w = this.radius * 2 + 8, h = this.species.headZ + 6;
    const x = Math.round(this.x - w / 2), y = Math.round(this.y - this.lift - h + 3);
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
