// This tiny entry starts before the game/asset graph. It never opens a player socket.
export function matchServerUrl() {
  const env = import.meta.env?.VITE_MATCH_SERVER_URL;
  if (env) return env.replace(/\/$/, '');
  const h = globalThis.location?.hostname ?? '';
  const local = h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local') || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h);
  return local ? `ws://${h}:8787` : null;
}

const servers = new Map();
export function serverIsWarm(url) {
  return Date.now() - (servers.get(url)?.readyAt ?? 0) < 15000;
}
export function rememberReady(url, ready = true) {
  const entry = servers.get(url) ?? {};
  entry.readyAt = ready ? Date.now() : 0;
  servers.set(url, entry);
}
export function warmServer(url = matchServerUrl()) {
  if (!url) return Promise.resolve(false);
  if (serverIsWarm(url)) return Promise.resolve(true);
  const entry = servers.get(url) ?? {};
  if (entry.pending) return entry.pending;
  servers.set(url, entry);
  entry.pending = (async () => {
    try {
      const base = url.replace(/^ws/, 'http');
      const options = { cache: 'no-store', signal: AbortSignal.timeout(8000) };
      let response = await fetch(`${base}/ready`, options);
      const legacy = response.status === 404;
      if (legacy) response = await fetch(`${base}/health`, options);
      const status = await response.json();
      const ready = response.ok && !!(legacy ? status.ok : status.ready);
      rememberReady(url, ready);
      return ready;
    } catch {
      rememberReady(url, false);
      return false; // Offline play must not wait for the match host.
    } finally { entry.pending = null; }
  })();
  return entry.pending;
}

