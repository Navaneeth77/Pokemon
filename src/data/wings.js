// Wing cut-outs on the airborne, wings-raised frame of each sheet's Hop animation, one entry per
// facing row (PMD order: Down, DownRight, Right, UpRight, Up, UpLeft, Left, DownLeft).
// box / not: [x0, y0, x1, y1] frame pixels (inclusive) that belong / don't belong to the wing.
// pivot: the shoulder the wing swings about. dir: +1 when the wing extends right of its shoulder
// (so it beats down clockwise), −1 when it extends left. back: drawn behind the body.
// up / down: how far (radians) the wing sweeps above / below its drawn position.
// ticks: 1/60 s per beat frame (12 frames per beat) — larger is a slower, heavier wing beat.
// heave: pixels the body rises on the downstroke. swing: scales every wing's sweep.

// Left/right facings are pixel mirrors of each other about x = 23 in these 48-wide frames.
const flip = b => b && [46 - b[2], b[1], 46 - b[0], b[3]];
const mirror = wings => wings.map(w => ({
  ...w, box: flip(w.box), not: flip(w.not), pivot: [46 - w.pivot[0], w.pivot[1]], dir: -w.dir,
}));

// Rows 1–3 (DownRight, Right, UpRight); rows 7, 6, 5 are their mirrors.
const CHARIZARD_RIGHT = [
  [
    { box: [0, 0, 24, 16], not: [0, 13, 14, 40], pivot: [22, 16], dir: -1 },
    { box: [25, 0, 47, 16], not: [31, 14, 47, 40], pivot: [26, 17], dir: 1, back: true },
  ],
  [{ box: [0, 0, 27, 18], not: [0, 17, 9, 40], pivot: [27, 15], dir: -1 }],
  [{ box: [0, 0, 24, 16], pivot: [24, 16], dir: -1 }],
];

const MEGA_X_RIGHT = [
  [
    { box: [0, 0, 21, 20], not: [0, 19, 14, 40], pivot: [21, 15], dir: -1 },
    { box: [22, 0, 47, 13], pivot: [23, 14], dir: 1, back: true },
  ],
  [{ box: [0, 0, 21, 19], not: [0, 17, 9, 40], pivot: [21, 15], dir: -1 }],
  [{ box: [0, 0, 23, 16], pivot: [23, 15], dir: -1 }],
];

export const WINGS = {
  charizard: {
    frame: 6,
    ticks: 4,
    heave: 1,
    rows: [
      [
        { box: [0, 0, 21, 16], pivot: [21, 16], dir: -1, back: true },
        { box: [25, 0, 47, 16], pivot: [25, 16], dir: 1, back: true },
      ],
      ...CHARIZARD_RIGHT,
      [
        { box: [0, 0, 18, 18], pivot: [18, 15], dir: -1, up: -0.6, down: 1.3 },
        { box: [28, 0, 47, 18], pivot: [28, 15], dir: 1, up: -0.6, down: 1.3 },
      ],
      ...[...CHARIZARD_RIGHT].reverse().map(mirror),
    ],
  },
  'charizard-mega-x': {
    frame: 6,
    ticks: 6,
    heave: 2,
    swing: 1.2,
    rows: [
      [
        { box: [0, 0, 19, 19], pivot: [19, 17], dir: -1, back: true },
        { box: [27, 0, 47, 19], pivot: [27, 17], dir: 1, back: true },
      ],
      ...MEGA_X_RIGHT,
      [
        { box: [0, 0, 17, 19], pivot: [18, 15], dir: -1, up: -0.6, down: 1.3 },
        { box: [29, 0, 47, 19], pivot: [28, 15], dir: 1, up: -0.6, down: 1.3 },
      ],
      ...[...MEGA_X_RIGHT].reverse().map(mirror),
    ],
  },
};
