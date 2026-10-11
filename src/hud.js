import { outlinedText, roundRect, pokeball, megaSymbol } from './draw.js';
import { TYPE_COLORS } from './data/types.js';
import { WORLD_W } from './arena.js';
import { abilityOf, typesOf } from './data/abilities.js';
import { statusPills, buffPills } from './status.js';

const BAR_W = 116;

export class Hud {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.callouts = {};
    this.notes = {};
    this.combos = {};
    this.banner = null;
    this.glow = { player: 0, opponent: 0 };
  }

  callout(side, text) {
    this.callouts[side] = { text, t: 0 };
  }

  // Short ability notification under a side's panel.
  ability(side, name, text) {
    this.notes[side] = { text: `${name}: ${text}`, t: 0 };
  }

  combo(side, text, big) {
    this.combos[side] = { text, big, t: 0 };
  }

  // Briefly lights up a side's panel when a new Pokémon takes the field.
  flashPanel(side) {
    this.glow[side] = 1;
  }

  showBanner(text, { sub = '', band = false, color = '#fff', y = 250, life = Infinity, size = 30 } = {}) {
    this.banner = { text, sub, band, color, y, life, size, t: 0 };
  }

  update(dt) {
    for (const k in this.callouts) {
      const c = this.callouts[k];
      if (c && (c.t += dt) > 1.6) this.callouts[k] = null;
    }
    for (const k in this.glow) this.glow[k] = Math.max(0, this.glow[k] - dt * 1.5);
    for (const box of [this.notes, this.combos]) {
      for (const k in box) if (box[k] && (box[k].t += dt) > 1.8) box[k] = null;
    }
    if (this.banner && (this.banner.t += dt) > this.banner.life) this.banner = null;
    for (const m of [this.game.player, this.game.opponent]) {
      m.shownHp += (m.hp - m.shownHp) * Math.min(1, dt * 14);
      if (m.trailHp > m.shownHp) {
        m.trailDelay -= dt;
        if (m.trailDelay <= 0) m.trailHp = Math.max(m.shownHp, m.trailHp - m.maxHp * 0.6 * dt);
      } else m.trailHp = m.shownHp;
    }
  }

  draw(ctx) {
    const g = this.game;
    const top = ctx.createLinearGradient(0, 0, 0, 48);
    top.addColorStop(0, 'rgba(12,16,26,0.9)');
    top.addColorStop(1, 'rgba(12,16,26,0.6)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, WORLD_W, 48);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, 48, WORLD_W, 1);
    this.drawPanel(ctx, g.player, g.playerTeam, false);
    this.drawPanel(ctx, g.opponent, g.opponentTeam, true);
    this.drawTimer(ctx);
    this.drawSwitch(ctx);
    if (this.callouts.player) this.drawCallout(ctx, this.callouts.player, false);
    if (this.callouts.opponent) this.drawCallout(ctx, this.callouts.opponent, true);
    for (const [side, right] of [['player', false], ['opponent', true]]) {
      if (this.notes[side]) this.drawNote(ctx, this.notes[side], right);
      this.drawCombo(ctx, side === 'player' ? g.player : g.opponent, this.combos[side], right);
    }
    this.drawWeather(ctx);
    this.drawBanner(ctx);
  }

  drawPanel(ctx, mon, team, right) {
    const W = WORLD_W, align = right ? 'right' : 'left';
    const px = right ? W - 37 : 5;
    roundRect(ctx, px - 1, 4, 34, 34, 4, '#10131a');
    roundRect(ctx, px, 5, 32, 32, 3, right ? '#e46a5f' : '#f0883e');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(mon.portrait, px + 1, 6, 30, 30);
    ctx.imageSmoothingEnabled = false;
    if (!mon.alive) roundRect(ctx, px, 5, 32, 32, 3, 'rgba(10,12,18,0.6)');

    const tx = right ? W - 42 : 42;
    const name = mon.species.name.toUpperCase();
    outlinedText(ctx, name, tx, 14, { size: name.length > 12 ? 9.5 : 11, align, lw: 2.5 });

    const pills = typesOf(mon).map(t => [t.toUpperCase(), TYPE_COLORS[t][0]]);
    if (mon.isMega) pills.push(['MEGA', '#c44fd8']);
    pills.push(...statusPills(mon).slice(0, 2));
    ctx.font = '700 5.5px "Pixelify Sans"';
    let cx = tx;
    for (const [label, color] of pills) {
      const w = Math.ceil(ctx.measureText(label).width) + 7;
      const x = right ? cx - w : cx;
      roundRect(ctx, x, 16.5, w, 7, 3.5, color, '#12151c', 0.8);
      outlinedText(ctx, label, x + w / 2, 22.2, { size: 5.5, align: 'center', lw: 1.2 });
      cx += right ? -(w + 2) : w + 2;
    }

    const bx = right ? W - 42 - BAR_W : 42, by = 27, bh = 8;
    roundRect(ctx, bx - 1, by - 1, BAR_W + 2, bh + 2, 2, '#0b0e14');
    ctx.fillStyle = '#2a313d';
    ctx.fillRect(bx, by, BAR_W, bh);
    const fill = (ratio, color) => {
      const w = Math.max(0, Math.round(BAR_W * ratio));
      ctx.fillStyle = color;
      ctx.fillRect(right ? bx + BAR_W - w : bx, by, w, bh);
    };
    const r = mon.shownHp / mon.maxHp;
    fill(mon.trailHp / mon.maxHp, '#f3f3f3');
    fill(r, r > 0.5 ? '#46d36b' : r > 0.2 ? '#f4c430' : '#ec4b3c');
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(bx, by, BAR_W, 2);
    outlinedText(ctx, String(Math.ceil(mon.hp)), right ? bx + BAR_W - 3 : bx + 3, by + 7, { size: 7, family: 'Luckiest Guy', weight: 400, align, lw: 2 });

    // Ultimate meter: fills from damage dealt and taken; glows when ready.
    const ready = mon.ult >= 100, uw = Math.round(BAR_W * Math.min(1, mon.ult / 100));
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(bx - 1, by + bh + 1, BAR_W + 2, 4);
    ctx.fillStyle = ready ? (Math.floor(performance.now() / 160) % 2 ? '#ffffff' : '#ffd84a') : '#d89a1a';
    ctx.fillRect(right ? bx + BAR_W - uw : bx, by + bh + 2, uw, 2);

    // Team roster: one ball per member (grey once fainted), the active one ringed.
    team.members.forEach((m, i) => {
      const x = right ? W - 46 - i * 8 : 46 + i * 8;
      if (m.isMega) megaSymbol(ctx, x, 42, 3.2);
      else pokeball(ctx, x, 42, 3, m.alive);
      if (m === mon) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.arc(x, 42, 4.6, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    // Trainer name after the team balls (3 or 6 of them); the player's chosen portrait sits in front.
    let nx = 46 + team.members.length * 8 + 2;
    const bust = !right && this.game.playerBust;
    if (bust) {
      ctx.drawImage(bust, nx - 1, 36.5, 9, 9);
      nx += 10;
    }
    nx = right ? W - nx : nx;
    outlinedText(ctx, mon.trainer.name.toUpperCase(), nx, 44.5, {
      size: 6, align, color: right ? '#f5c542' : '#ff6a4d', lw: 2,
    });
    ctx.font = '700 6px "Pixelify Sans"';
    const tw = ctx.measureText(mon.trainer.name.toUpperCase()).width;
    const abName = abilityOf(mon).name.toUpperCase();
    outlinedText(ctx, right ? `${abName} ·` : `· ${abName}`, right ? nx - tw - 4 : nx + tw + 4, 44.5, { size: 6, align, color: '#e8e0c8', lw: 2 });
    if (ready) outlinedText(ctx, 'ULT READY', right ? bx : bx + BAR_W, by + bh + 8.5, { size: 5.5, align: right ? 'left' : 'right', color: '#ffd84a', lw: 1.5 });

    const glow = this.glow[right ? 'opponent' : 'player'];
    if (glow > 0) roundRect(ctx, right ? W / 2 + 4 : 2, 2, W / 2 - 6, 44, 6, `rgba(255,255,255,${0.35 * glow})`);
  }

  drawTimer(ctx) {
    const s = Math.floor(this.game.time);
    const label = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    roundRect(ctx, WORLD_W / 2 - 16, 51, 32, 12, 6, 'rgba(16,20,30,0.88)', 'rgba(255,255,255,0.12)', 0.8);
    outlinedText(ctx, label, WORLD_W / 2, 60.5, { size: 8, family: 'Luckiest Guy', weight: 400, align: 'center', lw: 0 });
  }

  // Shared team switch cooldown, shown under the player's panel.
  drawSwitch(ctx) {
    const g = this.game;
    if (g.state !== 'fighting') return;
    const cd = Math.ceil(g.switchCD);
    const none = g.playerTeam.remaining <= 1;
    const label = none ? 'NO SWITCH' : cd > 0 ? `SWITCH ${cd}S` : 'SWITCH [Q]';
    ctx.font = '400 7px "Luckiest Guy"';
    const w = Math.ceil(ctx.measureText(label).width) + 12;
    roundRect(ctx, 5, 51, w, 11, 5.5, cd > 0 || none ? 'rgba(16,20,30,0.88)' : 'rgba(40,120,70,0.92)', 'rgba(255,255,255,0.15)', 0.8);
    outlinedText(ctx, label, 5 + w / 2, 59.6, { size: 7, family: 'Luckiest Guy', weight: 400, align: 'center', lw: 0, color: cd > 0 || none ? '#c9d2de' : '#ffffff' });
    const dcd = g.player.dodgeCD;
    const dl = dcd > 0 ? `DODGE ${dcd.toFixed(1)}S` : 'DODGE [SPACE]';
    const dw = Math.ceil(ctx.measureText(dl).width) + 12, dx = 5 + w + 4;
    roundRect(ctx, dx, 51, dw, 11, 5.5, dcd > 0 ? 'rgba(16,20,30,0.88)' : 'rgba(40,90,150,0.92)', 'rgba(255,255,255,0.15)', 0.8);
    outlinedText(ctx, dl, dx + dw / 2, 59.6, { size: 7, family: 'Luckiest Guy', weight: 400, align: 'center', lw: 0, color: dcd > 0 ? '#c9d2de' : '#ffffff' });
  }

  drawNote(ctx, n, right) {
    const alpha = n.t > 1.5 ? Math.max(0, 1 - (n.t - 1.5) / 0.3) : Math.min(1, n.t / 0.12);
    ctx.font = '700 6.5px "Pixelify Sans"';
    const text = n.text.length > 46 ? `${n.text.slice(0, 45)}…` : n.text;
    const w = Math.ceil(ctx.measureText(text).width) + 12, x = right ? WORLD_W - 6 - w : 6;
    ctx.save();
    ctx.globalAlpha = alpha;
    roundRect(ctx, x, 82, w, 11, 5.5, 'rgba(40,30,8,0.9)', '#ffd84a', 0.8);
    outlinedText(ctx, text, x + w / 2, 89.8, { size: 6.5, align: 'center', color: '#ffe9a8', lw: 0 });
    ctx.restore();
  }

  // Hit counter for the current string, plus the latest chain notice.
  drawCombo(ctx, mon, note, right) {
    const c = mon.combo;
    if (!(c?.t > 0 && c.n >= 2) && !note) return;
    const x = right ? WORLD_W - 10 : 10, align = right ? 'right' : 'left';
    if (c?.t > 0 && c.n >= 2) {
      const pop = 1 + Math.max(0, (c.t - 1.3) / 0.2) * 0.3;
      ctx.save();
      ctx.translate(x, 110);
      ctx.scale(pop, pop);
      outlinedText(ctx, `${c.n} HITS`, 0, 0, { family: 'Luckiest Guy', weight: 400, size: 14, color: c.n >= 5 ? '#ffd84a' : '#ffffff', stroke: '#24100c', lw: 3, align });
      ctx.restore();
    }
    if (note) {
      const a = note.t > 1.4 ? Math.max(0, 1 - (note.t - 1.4) / 0.4) : 1;
      ctx.save();
      ctx.globalAlpha = a;
      outlinedText(ctx, note.text, x, 121, { family: 'Luckiest Guy', weight: 400, size: note.big ? 10 : 7, color: note.big ? '#ff9a3a' : '#bff3ff', stroke: '#24100c', lw: 2.5, align });
      ctx.restore();
    }
  }

  drawWeather(ctx) {
    const g = this.game;
    const label = g.deltaStream ? 'STRONG WINDS' : { rain: 'RAIN', sun: 'HARSH SUN', sand: 'SANDSTORM' }[g.weather];
    if (!label) return;
    const color = g.deltaStream ? '#2f9e95' : { rain: '#3a6ad0', sun: '#d8781a', sand: '#a88a4a' }[g.weather];
    ctx.font = '400 7px "Luckiest Guy"';
    const w = Math.ceil(ctx.measureText(label).width) + 12;
    roundRect(ctx, WORLD_W / 2 - w / 2, 66, w, 11, 5.5, color, 'rgba(255,255,255,0.2)', 0.8);
    outlinedText(ctx, label, WORLD_W / 2, 74.6, { size: 7, family: 'Luckiest Guy', weight: 400, align: 'center', lw: 0 });
  }

  // Small status / boost / ability tags above each Pokémon on the field.
  drawTags(ctx) {
    for (const mon of [this.game.player, this.game.opponent]) {
      if (mon.hidden || !mon.alive) continue;
      const tags = [...statusPills(mon), ...buffPills(mon)];
      const ab = abilityOf(mon).pill?.(mon);
      if (ab) tags.push(ab);
      if (mon.shield > 0 && !ab) tags.push(['SHIELD', '#ff70b0']);
      if (mon.air) tags.unshift([`AIRBORNE${mon.air.juggle ? ` ×${mon.air.juggle}` : ''}`, '#5a6ad8']);
      if (mon.guard) tags.push([mon.guard.label, '#a8881a']);
      if (mon.regen) tags.push(['AQUA RING', '#3a8ae8']);
      if (!tags.length) continue;
      ctx.font = '700 4.5px "Pixelify Sans"';
      const widths = tags.map(([l]) => Math.ceil(ctx.measureText(l).width) + 5);
      let x = mon.x - (widths.reduce((a, b) => a + b, 0) + (tags.length - 1)) / 2;
      const y = mon.y - mon.headZ - (mon.charging ? 22 : 10);
      tags.forEach(([label, color], i) => {
        roundRect(ctx, x, y - 6, widths[i], 6.5, 3, color, '#12151c', 0.6);
        outlinedText(ctx, label, x + widths[i] / 2, y - 1.4, { size: 4.5, align: 'center', lw: 1 });
        x += widths[i] + 1;
      });
    }
  }

  drawCallout(ctx, c, right) {
    const alpha = c.t < 0.12 ? c.t / 0.12 : c.t > 1.3 ? Math.max(0, 1 - (c.t - 1.3) / 0.3) : 1;
    const scale = c.t < 0.12 ? 0.7 + 0.3 * (c.t / 0.12) : 1;
    ctx.font = 'italic 700 8px "Pixelify Sans"';
    const w = Math.ceil(ctx.measureText(c.text).width) + 14, h = 13;
    const x = right ? WORLD_W - 6 - w : 6;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x + w / 2, 66 + h / 2);
    ctx.scale(scale, scale);
    roundRect(ctx, -w / 2, -h / 2, w, h, h / 2, '#f7efd6', '#2b2420', 1.2);
    outlinedText(ctx, c.text, 0, 3, { size: 8, italic: true, align: 'center', color: '#3b2a1f', lw: 0 });
    ctx.restore();
  }

  drawBanner(ctx) {
    const b = this.banner;
    if (!b) return;
    const k = Math.min(1, b.t / 0.25);
    const ease = 1 - Math.pow(1 - k, 3);
    const fade = b.life === Infinity ? 1 : Math.min(1, (b.life - b.t) / 0.25);
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    ctx.translate(WORLD_W / 2 + (1 - ease) * -360, b.y);
    ctx.rotate(-0.05);
    if (b.band) {
      ctx.fillStyle = '#6f160f';
      ctx.fillRect(-220, -25, 440, 50);
      ctx.fillStyle = '#d63a2a';
      ctx.fillRect(-220, -21, 440, 42);
    }
    outlinedText(ctx, b.text, 0, b.size * 0.37, { family: 'Luckiest Guy', weight: 400, size: b.size, color: b.color, lw: 5, stroke: '#24100c', align: 'center' });
    if (b.sub) outlinedText(ctx, b.sub, 0, 46, { family: 'Luckiest Guy', weight: 400, size: 15, color: '#ffd84a', lw: 4, stroke: '#24100c', align: 'center' });
    ctx.restore();
  }
}
