// Local by default. Remote staging is an explicit, data-writing opt-in.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir, cpus } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
const args = process.argv.slice(2), opt = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
if (args.includes('--help')) {
  console.log('npm run test:load -- [--players 20] [--raids 0] [--warmup 10] [--duration 60] [--output results.json]\nLocal server uses isolated temporary storage. --url https://STAGING --allow-remote targets staging and creates synthetic players/results. Matches automatically requeue for long soaks.');
  process.exit(0);
}
const players = Number(opt('--players', 20)), raids = Number(opt('--raids', 0));
const duration = Number(opt('--duration', 60)), warmup = Number(opt('--warmup', 10));
if (!Number.isInteger(players) || players < 2 || players > 64 || players % 2 || !Number.isInteger(raids) || raids < 0 || raids > players / 2 || !Number.isFinite(duration) || duration < 1 || !Number.isFinite(warmup) || warmup < 0) throw Error('Use an even --players from 2 to 64, valid --raids, --duration >= 1 and --warmup >= 0.');
const remote = opt('--url', null);
if (remote && !args.includes('--allow-remote')) throw Error('Remote load creates players and match results. Add --allow-remote only for an authorized staging server.');
const sleep = ms => new Promise(r => setTimeout(r, ms)), id = randomBytes(5).toString('hex');
const clients = [], health = [], failures = [], ends = {};
let child, dir, inputTimer, healthTimer, stopping = false, measuring = false, logs = '', start, base;
const quantile = a => { if (!a.length) return null; a = [...a].sort((a,b) => a-b); const q = p => +a[Math.min(a.length-1, Math.floor(a.length*p))].toFixed(2); return { n: a.length, p50: q(.5), p95: q(.95), p99: q(.99), max: q(1) }; };
// Bound diagnostic sample residency for long soaks; counters remain exact.
const sample = (list, value) => { if (list.length < 20000) list.push(value); else list[Math.floor(Math.random() * list.length)] = value; };
const getHealth = async () => { const r = await fetch(base + '/health', { signal: AbortSignal.timeout(5000) }); if (!r.ok) throw Error(`health HTTP ${r.status}`); return r.json(); };
async function waitFor(fn, label, ms = 45000) { const until = performance.now() + ms; while (!fn()) { if (performance.now() > until || child?.exitCode != null) throw Error(`Timed out: ${label}. ${logs.slice(-1200)}`); await sleep(30); } }
for (const [signal, code] of [['SIGINT',130],['SIGTERM',143]]) process.once(signal, () => { cleanup().finally(() => process.exit(code)); });
try {
  if (remote) { base = new URL(remote).origin; console.error('STAGING LOAD: synthetic players/results will be created at ' + base); }
  else {
    dir = await mkdtemp(join(tmpdir(), 'pokemon-load-'));
    const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening'); const port = reservation.address().port; await new Promise(r => reservation.close(r));
    base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server/index.js'], { cwd: new URL('../', import.meta.url), env: { ...process.env, PORT: String(port), MAX_MATCHES: String(players/2), MAX_RAIDS: String(Math.max(1,raids)), BOT_MATCH_AFTER_MS: '0', KEEP_AWAKE: '0', MATCH_TEST_HP: '1', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', ECONOMY_FILE: join(dir,'wallets.json'), LEADERBOARD_FILE: join(dir,'records.json') }, stdio: ['ignore','pipe','pipe'] });
    child.stdout.on('data', d => { logs = (logs + d).slice(-12000); }); child.stderr.on('data', d => { logs = (logs + d).slice(-12000); });
    await waitFor(() => logs.includes('match server on'), 'local server startup', 15000);
  }
  const initial = await getHealth();
  if (initial.capacity < players / 2) throw Error(`Server has ${initial.capacity} match slots; ${players/2} required. Configure staging first.`);
  const teams = [['charizard','snorlax','lapras'], ['blastoise','raichu','garchomp'], ['gengar','lucario','corviknight']];
  async function connect(n) {
    const ws = new WebSocket(base.replace(/^http/, 'ws'));
    const c = { ws, n, ready: false, active: false, match: null, bytes: 0, snaps: 0, activeMs: 0, gaps: [], rtts: [], last: null, moves: 0, welcomed: false, raid: Math.floor(n/2) >= players/2-raids };
    clients.push(c);
    c.send = m => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
    c.queue = () => { if (stopping) return; c.send(c.raid ? {t:'raid-queue',kind:'public',boss:'rayquaza',difficulty:'hard',format:3,team:teams[n%teams.length],lead:0,mega:{}} : {t:'queue',format:3,team:teams[n%teams.length],lead:0,mega:{}}); };
    ws.on('error', e => { if (!stopping) failures.push(`client ${n}: ${e.message}`); });
    ws.on('close', () => { if (!stopping) failures.push(`client ${n}: unexpected close`); c.active = false; });
    ws.on('message', raw => {
      const m = JSON.parse(raw), now = performance.now();
      if (measuring) c.bytes += raw.length;
      if (m.t === 'welcome') c.welcomed = true;
      if (m.t === 'matched') { c.match = m.id; c.send({t:'loaded',id:m.id}); }
      if (m.t === 'start') { c.active = true; c.last = null; }
      if (m.t === 'b' && measuring) {
        c.moves += m.e?.length ?? 0;
        if (m.s) { c.snaps++; if (c.last != null) sample(c.gaps, now-c.last); c.last = now; }
      }
      if (m.t === 'pong' && measuring) sample(c.rtts, now-m.ts);
      if (m.t === 'end') {
        c.active = false; c.last = null; c.match = null;
        if (measuring) ends[m.reason] = (ends[m.reason] ?? 0) + 1;
        if (!['ko','time','team-eliminated'].includes(m.reason) && !stopping) failures.push(`client ${n}: unexpected end ${m.reason}`);
        c.queue();
      }
      if (['error','aborted','raid-cancelled','queue-timeout'].includes(m.t) && !stopping) failures.push(`client ${n}: ${m.t} ${m.message ?? m.reason ?? ''}`);
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('WebSocket open timeout')), 15000);
      ws.once('open', () => { clearTimeout(timeout); resolve(); });
      ws.once('error', error => { clearTimeout(timeout); reject(error); });
    });
    c.send({t:'hello',v:2,pid:`load-${id}-${n}`,name:'Load test'});
    await waitFor(() => c.welcomed, `hello ${n}`, 15000); return c;
  }
  await Promise.all(Array.from({length:players}, (_,n) => connect(n)));
  for (const c of clients) c.queue();
  let tick = 0, lastInput = performance.now();
  inputTimer = setInterval(() => {
    const now = performance.now(), elapsed = now-lastInput; lastInput = now; tick++;
    if (measuring && elapsed > 2000) failures.push(`Scheduling interruption ${Math.round(elapsed)} ms; result cannot establish steady load`);
    for (const c of clients) {
      if (!c.active || !c.match) continue;
      if (measuring) c.activeMs += elapsed;
      c.send({t:'in',id:c.match,x:Math.sin(tick/60+c.n)*.6,y:Math.cos(tick/90+c.n)*.3,q:tick});
      if (tick%30===0) { c.send({t:'ping',ts:now}); c.send({t:'act',id:c.match,k:'press',i:Math.floor(tick/30)%4}); }
      if (tick%30===2) c.send({t:'act',id:c.match,k:'release',i:Math.floor(tick/30)%4});
      if (tick%180===0) c.send({t:'act',id:c.match,k:'dodge'});
    }
  }, 17);
  await waitFor(() => clients.every(c => c.active), 'all players fighting');
  await sleep(warmup*1000);
  for (const c of clients) c.last = null;
  start = performance.now(); measuring = true;
  let healthBusy = false;
  const poll = async () => { if (healthBusy || stopping) return; healthBusy=true; try { health.push({seconds:+((performance.now()-start)/1000).toFixed(2), ...(await getHealth())}); } catch(e) { failures.push(e.message); } finally { healthBusy=false; } };
  await poll(); healthTimer = setInterval(poll,10000);
  await sleep(duration*1000);
  const seconds=(performance.now()-start)/1000;
  measuring = false; clearInterval(healthTimer); await waitFor(() => !healthBusy, 'health sample',6000); await poll();
  const rows=clients.map(c => ({player:c.n,raid:c.raid,activeFraction:+(c.activeMs/(seconds*1000)).toFixed(3),snapshots:c.snaps,snapshotHz:+(c.snaps/(c.activeMs/1000||seconds)).toFixed(2),snapshotGapMs:quantile(c.gaps),rttMs:quantile(c.rtts),KiBps:+(c.bytes/seconds/1024).toFixed(2),combatEvents:c.moves}));
  for(const row of rows) if(row.activeFraction < .85 || row.snapshotHz < 27) failures.push(`player ${row.player}: insufficient sustained workload (${row.activeFraction} active, ${row.snapshotHz} Hz)`);
  const report={target:remote?base:'isolated local server',players,raids,warmup,seconds:+seconds.toFixed(2),node:process.version,cpu:cpus()[0].model,valid:failures.length===0,failures:[...new Set(failures)],totalOutboundMbps:+(clients.reduce((n,c)=>n+c.bytes,0)*8/seconds/1e6).toFixed(3),ends,clients:rows,health,note:'Payload excludes transport overhead. RTT is from this load generator. Gaps/RTT use bounded samples on long runs. Normal completed matches requeue; activeFraction exposes downtime. Health CPU metrics are rolling server windows. Local results do not certify production or phones.'};
  const json=JSON.stringify(report,null,2);
  if(opt('--output',null)) await writeFile(opt('--output'),json+'\n');
  console.log(JSON.stringify({valid:report.valid,players,raids,seconds:report.seconds,worstSnapshotHz:Math.min(...rows.map(r=>r.snapshotHz)),worstRttP95:Math.max(...rows.map(r=>r.rttMs?.p95??0)),outboundMbps:report.totalOutboundMbps,failures:report.failures},null,2));
  if(failures.length) process.exitCode=1;
} catch(e) { console.error(e.stack); process.exitCode=1; }
finally { await cleanup(); }
async function cleanup() {
  if (stopping) return;
  stopping=true; clearInterval(inputTimer); clearInterval(healthTimer);
  for(const c of clients) c.ws.terminate();
  if(child && child.exitCode===null) { const done=once(child,'exit');child.kill('SIGTERM');await done; }
  if(dir) await rm(dir,{recursive:true,force:true});
}
