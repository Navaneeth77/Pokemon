export function outlinedText(ctx, str, x, y, o = {}) {
  const {
    size = 10, family = 'Pixelify Sans', weight = 700, italic = false,
    color = '#fff', stroke = '#14161d', lw = 2, align = 'left', baseline = 'alphabetic',
  } = o;
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px "${family}"`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (lw > 0) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

export function roundRect(ctx, x, y, w, h, r, fill, stroke, lw = 1) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

export function pokeball(ctx, x, y, r, active) {
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI, 0);
  ctx.fillStyle = active ? '#e3412f' : '#5d616b';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI);
  ctx.fillStyle = active ? '#f4f4f4' : '#8e929b';
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = '#15171c';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.moveTo(x - r, y);
  ctx.lineTo(x + r, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = '#f4f4f4';
  ctx.fill();
  ctx.stroke();
}

export function rainbowRing(ctx, x, y, r, width, rot = 0, alpha = 1) {
  const n = 24;
  ctx.lineWidth = width;
  for (let i = 0; i < n; i++) {
    ctx.strokeStyle = `hsla(${(i / n) * 360 + rot}, 95%, 62%, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, (i / n) * Math.PI * 2, ((i + 1.2) / n) * Math.PI * 2);
    ctx.stroke();
  }
}

// The Mega Evolution emblem: a rainbow ring around a white disc with a two-strand helix.
export function megaSymbol(ctx, x, y, r, rot = 0) {
  rainbowRing(ctx, x, y, r, Math.max(1, r * 0.28), rot);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = Math.max(0.8, r * 0.18);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#c04bd8';
  ctx.beginPath();
  ctx.arc(x - r * 0.18, y, r * 0.42, -1.2, 1.9);
  ctx.stroke();
  ctx.strokeStyle = '#3f7bd8';
  ctx.beginPath();
  ctx.arc(x + r * 0.18, y, r * 0.42, 1.9, 5.1);
  ctx.stroke();
}
