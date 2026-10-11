// Original pixel-art trainers (16×24) in the style of the Reel's overworld sprites:
// Red stands at the bottom seen from behind, Gold at the top facing the camera.

const OUTLINE = '#1c1b24';

const PALETTES = {
  red: {
    k: OUTLINE, r: '#e0362f', R: '#a32020', w: '#f4f4f4', h: '#2a2630', H: '#4a4352',
    t: '#26262e', s: '#f2c7a0', S: '#cf9670', b: '#4a6cc4', B: '#2f4a92',
  },
  gold: {
    k: OUTLINE, h: '#2b2b36', y: '#f2c232', n: '#5a3d2b', N: '#3e2a1e', s: '#f2c7a0', S: '#cf9670',
    r: '#d63b2f', R: '#9c2420', w: '#f4f4f4', b: '#41548f', B: '#2d3b6b',
  },
};

const BASE = {
  red: [
    '................',
    '................',
    '.....kkkkkk.....',
    '....krrrrrrk....',
    '...krrrrrrrrk...',
    '...krrrrrrrRk...',
    '...krrRwwRrRk...',
    '...kRRRRRRRRk...',
    '...khhHhhHhhk...',
    '...khHhhhhHhk...',
    '....khhhhhhk....',
    '....kkSssSkk....',
    '...kwrrrrrrwk...',
    '..ktrrrrrrrrtk..',
    '..ktrRrrrrRrtk..',
    '..ksrRrrrrRrsk..',
    '..kSrrrrrrrrSk..',
    '...kttttttttk...',
    '...kbbbbbbbbk...',
    '...kbbBkkBbbk...',
    '...kbbBkkBbbk...',
    '...kbBk..kBbk...',
    '...kwrk..krwk...',
    '...kkkk..kkkk...',
  ],
  gold: [
    '................',
    '................',
    '.....kkkkkk.....',
    '....khhhhhhk....',
    '...khhhhhhhhk...',
    '...khyyyyyyhk...',
    '...kNhhhhhhNk...',
    '..knnnnnnnnnnk..',
    '..knNnnnnnnNnk..',
    '...knssssssnk...',
    '...kskssssksk...',
    '....kSssssSk....',
    '...kkwrrrrwkk...',
    '..krrrwkkwrrrk..',
    '..krRrwkkwrRrk..',
    '..ksRrrkkrrRsk..',
    '..kSrrrrrrrrSk..',
    '...kRRRRRRRRk...',
    '...kbBBBBBBbk...',
    '...kBBBkkBBBk...',
    '...kBBk..kBBk...',
    '...kbBk..kBbk...',
    '...krrk..krrk...',
    '...kkkk..kkkk...',
  ],
};

// Per-pose pixel overrides [row, col, colour]: the throwing arm is lifted and the
// Poké Ball is held above the head.
const range = (from, to, fn) => Array.from({ length: to - from + 1 }, (_, i) => fn(from + i)).flat();

const RED_ARM_DOWN_CLEARED = [[13, 12, 'r'], [14, 12, 'r'], [15, 12, 'r'], [16, 12, 'r']];
const RED_ARM_UP = [
  [6, 13, 's'], [6, 14, 's'], [6, 15, 'k'], [7, 13, 's'], [7, 14, 'S'], [7, 15, 'k'],
  ...range(8, 11, r => [[r, 13, 't'], [r, 14, 't'], [r, 15, 'k']]),
  [10, 12, 'k'], [11, 12, 'k'], [12, 13, 't'], [12, 14, 'k'],
];
const RED_BALL = [
  [2, 13, 'k'], [2, 14, 'k'], [3, 12, 'k'], [3, 13, 'r'], [3, 14, 'r'], [3, 15, 'k'],
  [4, 12, 'k'], [4, 13, 'w'], [4, 14, 'w'], [4, 15, 'k'], [5, 13, 'k'], [5, 14, 'k'],
];

const GOLD_ARM_DOWN_CLEARED = [[15, 3, 'r'], [16, 3, 'R']];
const GOLD_ARM_UP = [
  [5, 0, 'k'], [5, 1, 's'], [5, 2, 's'], [5, 3, 'k'], [6, 0, 'k'], [6, 1, 's'], [6, 2, 'S'], [6, 3, 'k'],
  ...range(7, 12, r => [[r, 0, 'k'], [r, 1, 'r'], [r, 2, 'R']]),
];
const GOLD_BALL = [
  [1, 1, 'k'], [1, 2, 'k'], [2, 0, 'k'], [2, 1, 'r'], [2, 2, 'r'], [2, 3, 'k'],
  [3, 0, 'k'], [3, 1, 'w'], [3, 2, 'w'], [3, 3, 'k'], [4, 1, 'k'], [4, 2, 'k'],
];

const POSES = {
  red: {
    idle: [],
    raise: [...RED_ARM_DOWN_CLEARED, ...RED_ARM_UP, ...RED_BALL],
    point: [...RED_ARM_DOWN_CLEARED, ...RED_ARM_UP, [5, 13, 'k'], [5, 14, 'k']],
    throw: [
      ...RED_ARM_DOWN_CLEARED, [8, 13, 'k'], [8, 14, 'k'], [9, 13, 's'], [9, 14, 's'], [9, 15, 'k'],
      [10, 12, 'k'], [10, 13, 't'], [10, 14, 't'], [10, 15, 'k'], [11, 12, 'k'], [11, 13, 't'], [11, 14, 't'], [11, 15, 'k'],
      [12, 13, 't'], [12, 14, 'k'],
    ],
  },
  gold: {
    idle: [],
    raise: [...GOLD_ARM_DOWN_CLEARED, ...GOLD_ARM_UP, ...GOLD_BALL],
    point: [...GOLD_ARM_DOWN_CLEARED, ...GOLD_ARM_UP, [4, 1, 'k'], [4, 2, 'k']],
    throw: [
      ...GOLD_ARM_DOWN_CLEARED, [12, 1, 'k'], [12, 2, 'k'], [13, 0, 'k'], [13, 1, 'r'], [13, 2, 'r'],
      [14, 0, 'k'], [14, 1, 's'], [14, 2, 'R'], [15, 0, 'k'], [15, 1, 'k'],
    ],
  },
};

// Where the raised hand is, relative to the trainer's feet (dx along x, z height).
const HAND = { red: { dx: 5.5, z: 20 }, gold: { dx: -6.5, z: 21 } };

function buildFrame(rows, overrides, palette) {
  const grid = rows.map(r => r.split(''));
  for (const [y, x, c] of overrides) grid[y][x] = c;
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 24;
  const ctx = canvas.getContext('2d');
  grid.forEach((row, y) => row.forEach((ch, x) => {
    if (ch === '.') return;
    ctx.fillStyle = palette[ch];
    ctx.fillRect(x, y, 1, 1);
  }));
  return canvas;
}

export class Trainer {
  constructor(id, name, x, y) {
    this.id = id;
    this.name = name;
    this.x = x;
    this.y = y;
    this.frames = Object.fromEntries(
      Object.entries(POSES[id]).map(([pose, o]) => [pose, buildFrame(BASE[id], o, PALETTES[id])]),
    );
    this.reset();
  }

  reset() {
    this.pose = 'idle';
    this.poseT = Infinity;
  }

  setPose(pose, duration = Infinity) {
    this.pose = pose;
    this.poseT = duration;
  }

  hand() {
    const h = HAND[this.id];
    return { x: this.x + h.dx, y: this.y, z: h.z };
  }

  update(dt) {
    if (this.poseT === Infinity) return;
    this.poseT -= dt;
    if (this.poseT <= 0) this.reset();
  }

  drawShadow(ctx) {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#1d2433';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, 6, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  draw(ctx) {
    ctx.drawImage(this.frames[this.pose], Math.round(this.x - 8), Math.round(this.y - 23));
  }
}
