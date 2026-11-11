// Pixel-art drawing helpers for effects. The arena is drawn in world units where one unit is one art pixel, so
// these draw everything on whole units with hard edges (no anti-aliasing), and fade by ordered dithering instead of
// transparency — the way pixel-art games fade things out.
//
//   dither(x, y, a)                 true if the pixel at (x, y) is drawn at coverage a (0…1), Bayer 4×4
//   pixelLine(ctx, x0, y0, x1, y1, w, a)   a stepped line, w pixels thick
//   pixelPoly(ctx, pts, a)          a filled polygon, scanline-rasterised on the pixel grid
//   pixelRing(ctx, x, y, rx, ry, w, a)     an ellipse outline
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
export const dither = (x, y, a) => a >= 1 || a > BAYER[((y & 3) << 2) | (x & 3)];

export function pixelLine(ctx, x0, y0, x1, y1, w = 1, a = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, h = Math.floor(w / 2);
  let err = dx + dy, x = x0, y = y0;
  for (let n = 0; n < 4000; n++) {
    if (dither(x, y, a)) ctx.fillRect(x - h, y - h, w, w);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

export function pixelPoly(ctx, pts, a = 1) {
  if (pts.length < 3) return;
  let y0 = Infinity, y1 = -Infinity;
  for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  y0 = Math.floor(y0); y1 = Math.ceil(y1);
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > cy) !== (yj > cy)) xs.push(xi + ((cy - yi) / (yj - yi)) * (xj - xi));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.round(xs[k]), xb = Math.round(xs[k + 1]);
      if (xb <= xa) continue;
      if (a >= 1) ctx.fillRect(xa, y, xb - xa, 1);
      else for (let x = xa; x < xb; x++) if (dither(x, y, a)) ctx.fillRect(x, y, 1, 1);
    }
  }
}

export function pixelRing(ctx, x, y, rx, ry, w = 1, a = 1) {
  const n = Math.max(12, Math.round((rx + ry) * 0.6));
  let px = x + rx, py = y;
  for (let i = 1; i <= n; i++) {
    const ang = (i / n) * Math.PI * 2, qx = x + Math.cos(ang) * rx, qy = y + Math.sin(ang) * ry;
    pixelLine(ctx, px, py, qx, qy, w, a);
    px = qx;
    py = qy;
  }
}

// Points of a circle (or ellipse) as a polygon, for pixelPoly.
export const circlePts = (x, y, rx, ry = rx, n = 16) => Array.from({ length: n }, (_, i) => [x + Math.cos((i / n) * Math.PI * 2) * rx, y + Math.sin((i / n) * Math.PI * 2) * ry]);
