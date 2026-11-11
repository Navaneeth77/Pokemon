// Realistic element bursts: what each type's hit actually throws into the air, with real physics (gravity, drag,
// rising heat and smoke, falling droplets and sparks). `s` scales the burst: 0.5 for a light jab, 1 for a solid hit,
// 2 for a huge one.
//
//   elementBurst(g, type, x, y, z, s)
import { rand, Glow, Ring, Lightning, FIRE } from './effects.js';

const n = (base, s) => Math.max(1, Math.round(base * s));

function smoke(g, x, y, z, s, colors = ['#5a5560', '#3a3640', '#2a2830'], alpha = 0.32) {
  for (let i = 0; i < n(5, s); i++) {
    g.particles.spawn({ x: x + rand(-8, 8) * s, y: y + rand(-4, 4) * s, z: z + rand(-4, 8), vx: rand(-14, 14), vy: rand(-6, 6), vz: rand(14, 34), gz: -10, drag: 1.2,
      life: rand(0.7, 1.2), size: rand(4, 7) * s, sizeEnd: rand(12, 18) * s, colors, alpha, round: true });
  }
}

function dust(g, x, y, z, s, colors = ['#d8ccb0', '#b8a888', '#8a7a60'], alpha = 0.4) {
  for (let i = 0; i < n(6, s); i++) {
    const a = rand(0, Math.PI * 2), sp = rand(30, 70) * s;
    g.particles.spawn({ x, y, z: Math.min(z, 6), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, vz: rand(6, 24), drag: 2.5, life: rand(0.5, 0.9), size: rand(4, 7) * s, sizeEnd: rand(10, 16) * s, colors, alpha, round: true });
  }
}

// Bits thrown out that fall back under gravity.
function chunks(g, x, y, z, s, colors, { count = 10, speed = 120, up = 140, size = [2, 4], grav = 520, round = false, life = [0.4, 0.8] } = {}) {
  for (let i = 0; i < n(count, s); i++) {
    const a = rand(0, Math.PI * 2), sp = rand(speed * 0.3, speed) * Math.sqrt(s);
    g.particles.spawn({ x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rand(up * 0.3, up) * Math.sqrt(s), gz: grav, life: rand(...life), size: rand(...size), sizeEnd: size[0] * 0.6, colors, round });
  }
}

const BURST = {
  fire(g, x, y, z, s) {
    // Flame tongues licking upward, embers drifting off, then smoke.
    for (let i = 0; i < n(14, s); i++) {
      g.particles.spawn({ x: x + rand(-8, 8) * s, y: y + rand(-4, 4), z: z + rand(-6, 6), vx: rand(-40, 40) * s, vy: rand(-20, 20), vz: rand(50, 140) * s, gz: -60, drag: 1.5, life: rand(0.3, 0.55), size: rand(5, 9) * s, sizeEnd: 1, colors: FIRE, round: true });
    }
    for (let i = 0; i < n(10, s); i++) {
      g.particles.spawn({ x, y, z, vx: rand(-90, 90) * s, vy: rand(-50, 50), vz: rand(40, 160), gz: 90, drag: 0.8, life: rand(0.6, 1.2), size: rand(1, 2), colors: ['#fff6c0', '#ffb040', '#ff6a1f'], fade: true });
    }
    g.spawn(new Glow(x, y, z, 26 * s, [255, 140, 60], 0.25));
    smoke(g, x, y, z + 10, s * 0.8);
  },
  water(g, x, y, z, s) {
    // A splash crown of droplets thrown up and out, falling back; spray mist; a foam ring on the ground.
    for (let i = 0; i < n(18, s); i++) {
      const a = (i / n(18, s)) * Math.PI * 2 + rand(-0.15, 0.15), sp = rand(50, 110) * Math.sqrt(s);
      g.particles.spawn({ x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rand(110, 210) * Math.sqrt(s), gz: 620, life: rand(0.45, 0.75), size: rand(1.5, 3), sizeEnd: 1, colors: ['#ffffff', '#bfe6ff', '#5aa6f0'], round: true });
    }
    for (let i = 0; i < n(5, s); i++) g.particles.spawn({ x: x + rand(-10, 10), y, z, vx: rand(-20, 20), vz: rand(10, 30), drag: 1.5, life: rand(0.5, 0.8), size: 6 * s, sizeEnd: 16 * s, colors: ['#e8f6ff'], alpha: 0.28, round: true });
    g.spawn(new Ring(x, y, { r0: 4, r1: 26 * s, life: 0.4, color: 'rgba(230,246,255,0.9)', width: 2 }));
  },
  electric(g, x, y, z, s) {
    // Branching arcs crawling outward, white-hot sparks falling under gravity, a blue-white afterglow.
    for (let i = 0; i < n(4, s); i++) {
      const a = rand(0, Math.PI * 2), r = rand(22, 40) * s;
      g.spawn(new Lightning(x, y - z, x + Math.cos(a) * r, y - z + Math.sin(a) * r * 0.7, 0.12, { width: 1.5, branches: 2, glow: 'rgba(255,240,140,0.5)' }));
    }
    chunks(g, x, y, z, s, ['#ffffff', '#fff6a0', '#ffd040'], { count: 16, speed: 170, up: 120, size: [1, 2], grav: 700, life: [0.25, 0.55] });
    g.spawn(new Glow(x, y, z, 30 * s, [200, 220, 255], 0.2));
  },
  ice(g, x, y, z, s) {
    // Glittering shards, a puff of freezing mist, glints.
    chunks(g, x, y, z, s, ['#ffffff', '#d8f6ff', '#8ad0f0'], { count: 14, speed: 140, up: 130, size: [2, 4], grav: 560 });
    for (let i = 0; i < n(5, s); i++) g.particles.spawn({ x: x + rand(-8, 8), y, z, vx: rand(-25, 25), vz: rand(-5, 15), drag: 1.8, life: rand(0.6, 1), size: 5 * s, sizeEnd: 14 * s, colors: ['#e6f8ff'], alpha: 0.3, round: true });
    for (let i = 0; i < n(4, s); i++) g.particles.spawn({ x: x + rand(-18, 18) * s, y: y + rand(-8, 8), z: z + rand(-6, 14), life: rand(0.15, 0.3), size: 3, colors: ['#ffffff'], fade: false });
  },
  grass(g, x, y, z, s) {
    // Leaves tumbling down slowly, a puff of green.
    for (let i = 0; i < n(12, s); i++) {
      g.particles.spawn({ x, y, z, vx: rand(-90, 90) * s, vy: rand(-40, 40), vz: rand(40, 120), gz: 110, drag: 2.2, life: rand(0.7, 1.2), size: rand(2, 4), sizeEnd: 2, colors: ['#c8ff8a', '#6ac040', '#3f9a3a'] });
    }
    dust(g, x, y, z, s * 0.6, ['#c8f0a0', '#90c870'], 0.25);
  },
  bug(g, x, y, z, s) {
    chunks(g, x, y, z, s, ['#f0ffc0', '#a8d040', '#5a7a20'], { count: 12, speed: 110, up: 110, size: [1.5, 3] });
    dust(g, x, y, z, s * 0.5, ['#e0f0a0', '#a8c060'], 0.25);
  },
  rock(g, x, y, z, s) {
    // Stone chunks with weight, a gritty dust cloud.
    chunks(g, x, y, z, s, ['#c8bca0', '#8a7a60', '#5a4e3c'], { count: 12, speed: 120, up: 160, size: [2.5, 5], grav: 700 });
    dust(g, x, y, z, s);
  },
  ground(g, x, y, z, s) {
    chunks(g, x, y, z, s, ['#d8c090', '#a0804a', '#6a5030'], { count: 12, speed: 110, up: 150, size: [2, 4], grav: 650 });
    dust(g, x, y, z, s * 1.3, ['#e0c898', '#b89868', '#8a6a40'], 0.45);
  },
  steel(g, x, y, z, s) {
    // A shower of white-hot sparks skittering off metal.
    chunks(g, x, y, z, s, ['#ffffff', '#fff2c0', '#ffb040'], { count: 18, speed: 200, up: 100, size: [1, 2], grav: 800, life: [0.2, 0.45] });
    g.spawn(new Ring(x, y, { z, r0: 3, r1: 20 * s, life: 0.15, color: '#ffffff', width: 2, layer: 'air' }));
  },
  fighting(g, x, y, z, s) {
    chunks(g, x, y, z, s, ['#ffffff', '#ffd0b0', '#e07040'], { count: 8, speed: 130, up: 60, size: [1.5, 3], life: [0.2, 0.4] });
    dust(g, x, y, z, s);
  },
  normal(g, x, y, z, s) {
    chunks(g, x, y, z, s, ['#ffffff', '#f0f0d8'], { count: 8, speed: 120, up: 60, size: [1.5, 3], life: [0.2, 0.4] });
    dust(g, x, y, z, s);
  },
  flying(g, x, y, z, s) {
    // Feathers drifting down, a gust ring.
    for (let i = 0; i < n(8, s); i++) g.particles.spawn({ x, y, z, vx: rand(-80, 80), vy: rand(-30, 30), vz: rand(30, 90), gz: 70, drag: 2.5, life: rand(0.8, 1.3), size: rand(2, 3), colors: ['#ffffff', '#e8f0ff'] });
    g.spawn(new Ring(x, y, { z, r0: 6, r1: 34 * s, life: 0.3, color: 'rgba(255,255,255,0.8)', width: 2, layer: 'air' }));
  },
  poison(g, x, y, z, s) {
    // Bubbles of venom popping and a toxic haze.
    for (let i = 0; i < n(10, s); i++) g.particles.spawn({ x: x + rand(-10, 10), y: y + rand(-5, 5), z: z + rand(-6, 6), vx: rand(-30, 30), vz: rand(20, 70), gz: -20, drag: 1, life: rand(0.4, 0.8), size: rand(2, 4), sizeEnd: rand(4, 6), colors: ['#f0c0ff', '#c060d0', '#7a2a9a'], round: true, alpha: 0.85 });
    smoke(g, x, y, z, s * 0.7, ['#a060b0', '#6a2a7a', '#3a1040'], 0.28);
  },
  psychic(g, x, y, z, s) {
    for (let i = 0; i < 3; i++) g.spawn(new Ring(x, y, { z, r0: 6 + i * 6, r1: (26 + i * 10) * s, life: 0.3 + i * 0.06, color: ['#ffffff', '#ffb0e0', '#c060a0'][i], width: 2, layer: 'air' }));
    chunks(g, x, y, z, s, ['#ffffff', '#ffc0e8'], { count: 8, speed: 80, up: 60, size: [1, 2], grav: 0, life: [0.3, 0.6] });
  },
  ghost(g, x, y, z, s) {
    // Cold wisps curling up and fading.
    for (let i = 0; i < n(8, s); i++) g.particles.spawn({ x: x + rand(-10, 10), y, z, vx: rand(-20, 20), vz: rand(20, 50), gz: -15, drag: 1, life: rand(0.6, 1), size: rand(3, 5) * s, sizeEnd: 1, colors: ['#e0c8ff', '#7a48b8', '#2a1838'], round: true, alpha: 0.7 });
    g.spawn(new Glow(x, y, z, 24 * s, [120, 70, 190], 0.3));
  },
  dragon(g, x, y, z, s) {
    // Draconic fire: violet-blue flame and glittering scales.
    for (let i = 0; i < n(12, s); i++) g.particles.spawn({ x: x + rand(-8, 8), y, z, vx: rand(-50, 50), vz: rand(50, 130), gz: -50, drag: 1.4, life: rand(0.3, 0.5), size: rand(5, 8) * s, sizeEnd: 1, colors: ['#ffffff', '#c8a8ff', '#7a50f0', '#3a2090'], round: true });
    chunks(g, x, y, z, s, ['#ffffff', '#b090ff'], { count: 8, speed: 120, up: 100, size: [1, 2], life: [0.3, 0.6] });
  },
  dark(g, x, y, z, s) {
    // Black smoke tendrils with violet sparks.
    smoke(g, x, y, z, s, ['#2a1838', '#1a0f24', '#0a0610'], 0.5);
    chunks(g, x, y, z, s, ['#c8a0ff', '#6a3a8a'], { count: 8, speed: 120, up: 80, size: [1, 2], life: [0.25, 0.5] });
  },
  fairy(g, x, y, z, s) {
    // Twinkling sparkles that hang in the air, a pink shimmer.
    for (let i = 0; i < n(12, s); i++) {
      const a = rand(0, Math.PI * 2), sp = rand(30, 90);
      g.particles.spawn({ x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rand(10, 60), drag: 2.5, life: rand(0.5, 1), size: rand(1.5, 3), colors: ['#ffffff', '#ffe0f0', '#ffffff', '#f080b0'], fade: true });
    }
    g.spawn(new Glow(x, y, z, 26 * s, [255, 180, 220], 0.3));
  },
};

export function elementBurst(g, type, x, y, z, s = 1) {
  (BURST[type] ?? BURST.normal)(g, x, y, z, Math.max(0.4, Math.min(2.2, s)));
}
