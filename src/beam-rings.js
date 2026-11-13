// Shared cross-sections of an energy beam. Distance is in world units, so
// tracking and clash shortening don't make the rings jump along the line.
export function drawBeamRings(ctx, x, y, endX, endY, width, age, color, fade, nominalWidth = width) {
  const dx = endX - x, dy = endY - y, length = Math.hypot(dx, dy);
  if (length < 2 || width < 1 || fade <= 0) return;
  const gap = Math.max(24, nominalWidth * 1.9);
  const radius = Math.max(4, Math.min(39, width * 0.85));
  const travel = age * 710;
  const distance = travel <= length ? travel : length + (travel - length) % gap;
  ctx.save();
  const opacity = ctx.globalAlpha;
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(dy, dx));
  for (let i = 0; i < 15; i++) {
    const p = distance - i * gap;
    if (p < 0) break;
    if (p > length) continue;
    const endFade = Math.min(1, (length - p) / 12);
    ctx.globalAlpha = opacity * fade * endFade * 0.76;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.4, Math.min(3.5, width * 0.09));
    ctx.beginPath();
    ctx.ellipse(p, 0, radius * 0.32, radius * (0.66 + 0.34 * Math.min(1, p / 55)), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
