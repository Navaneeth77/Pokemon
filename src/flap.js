// Builds a wing-beat "Fly" animation from a single PMD frame: the wings are cut away from the
// body (see data/wings.js) and re-drawn rotated about their shoulders for each beat frame.

const FRAMES = 12;
const TICKS = 4;
const UP = -0.3;
const DOWN = 1.3;

const smooth = t => t * t * (3 - 2 * t);
// 0 = wings as drawn (raised), 1 = fully down: an accelerating power stroke over the first
// third of the beat, then a slow recovery.
const stroke = p => (p < 0.35 ? (p / 0.35) ** 1.6 : 1 - smooth((p - 0.35) / 0.65));

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const inside = (b, x, y) => b && x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

// Moves the wing's pixels out of `img` into a canvas of their own.
function cutWing(img, { box, not }) {
  const wing = new ImageData(img.width, img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!inside(box, x, y) || inside(not, x, y)) continue;
      const o = (y * img.width + x) * 4;
      if (img.data[o + 3] === 0) continue;
      wing.data.set(img.data.subarray(o, o + 4), o);
      img.data[o + 3] = 0;
    }
  }
  const c = makeCanvas(img.width, img.height);
  c.getContext('2d').putImageData(wing, 0, 0);
  return c;
}

// Vertical centre of the opaque pixels of one down-facing frame, relative to the anchor.
function bodyCentre(anim, frame) {
  const c = makeCanvas(anim.fw, anim.fh);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(anim.image, (frame + (anim.offset ?? 0)) * anim.fw, 0, anim.fw, anim.fh, 0, 0, anim.fw, anim.fh);
  const d = ctx.getImageData(0, 0, anim.fw, anim.fh).data;
  let top = -1, bottom = -1;
  for (let y = 0; y < anim.fh; y++) {
    for (let x = 0; x < anim.fw; x++) {
      if (d[(y * anim.fw + x) * 4 + 3] === 0) continue;
      if (top < 0) top = y;
      bottom = y;
      break;
    }
  }
  return (top + bottom) / 2 - anim.fh / 2;
}

export function addFlapAnim(set, cfg) {
  const src = set.anims.Hop;
  if (!src) return;
  const { fw, fh } = src;
  const sheet = makeCanvas(fw * FRAMES, fh * cfg.rows.length);
  const out = sheet.getContext('2d');
  out.imageSmoothingEnabled = false;
  cfg.rows.forEach((wings, row) => {
    const body = makeCanvas(fw, fh);
    const bctx = body.getContext('2d', { willReadFrequently: true });
    bctx.drawImage(src.image, cfg.frame * fw, row * fh, fw, fh, 0, 0, fw, fh);
    const img = bctx.getImageData(0, 0, fw, fh);
    const parts = wings.map(w => ({ ...w, canvas: cutWing(img, w) }));
    bctx.putImageData(img, 0, 0);
    for (let f = 0; f < FRAMES; f++) {
      const a = stroke(f / FRAMES);
      // The downstroke heaves the whole body up; it settles back during the recovery.
      const ox = f * fw, oy = row * fh - Math.round((cfg.heave ?? 0) * a);
      const drawWing = w => {
        const [px, py] = w.pivot;
        out.save();
        out.translate(ox + px + 0.5, oy + py + 0.5);
        const up = w.up ?? UP;
        out.rotate(w.dir * (cfg.swing ?? 1) * (up + ((w.down ?? DOWN) - up) * a));
        out.drawImage(w.canvas, -px - 0.5, -py - 0.5);
        out.restore();
      };
      parts.filter(w => w.back).forEach(drawWing);
      out.drawImage(body, ox, oy);
      parts.filter(w => !w.back).forEach(drawWing);
    }
  });
  set.anims.Fly = {
    name: 'Fly',
    image: sheet,
    fw,
    fh,
    frames: FRAMES,
    rows: cfg.rows.length,
    durations: Array(FRAMES).fill(cfg.ticks ?? TICKS),
    rushFrame: null,
    hitFrame: null,
    returnFrame: null,
    // Hop draws this frame mid-jump; shift it back down so altitude comes only from flight.
    yOffset: Math.round(bodyCentre(set.anims.Idle, 0) - bodyCentre(src, cfg.frame)),
  };
}
