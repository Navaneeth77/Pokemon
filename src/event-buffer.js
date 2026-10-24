// Snapshots retain current gameplay state. If a background tab falls behind, keep all team-ending
// events and Mega changes, then only recent cosmetic/action events instead of growing forever.
export function appendBattleEvents(buffer, incoming) {
  for (const event of incoming) if (event && typeof event.t === 'string') buffer.push(event);
  if (buffer.length <= 256) return buffer;
  const essential = new Map();
  for (const event of buffer) if (event.t === 'faint' || event.t === 'mega') essential.set(`${event.t}:${event.side}:${event.i??event.c??''}`,event);
  const keep = new Set([...essential.values()].slice(-64));
  for (const event of buffer.slice(-128)) keep.add(event);
  return buffer.filter(event=>keep.has(event));
}
