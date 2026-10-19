// 完整抓取 gol.gg 2026 赛季（S16）主要赛事：常规赛 + 季后赛 + 国际赛 + 德杯
// tournament-matchlist 返回的是“系列赛”（BO3/BO5），系列赛页列出本 BO 的每一场 game id
// 用法：
//   node _tools/scrape16full.mjs --list   枚举系列赛 → _tools/series16.json
//   node _tools/scrape16full.mjs          抓取全部场次 → _tools/gs16full.json（每 100 局落盘）
import fs from 'fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const BASE = 'https://gol.gg';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TOURNAMENTS = [
  'LPL 2026 Split 1', 'LPL 2026 Split 1 Playoffs',
  'LPL 2026 Split 2', 'LPL 2026 Split 2 Playoffs',
  'LPL 2026 Split 3', 'LPL 2026 Grand Finals', 'LPL 2026 Regional Finals',
  'LCK Cup 2026', 'LCK 2026 Rounds 1-2', 'LCK 2026 Rounds 3-4',
  'LCK 2026 Season Play-In', 'LCK 2026 Season Playoffs', 'LCK 2026 Road to MSI',
  'LEC 2026 Spring Season', 'LEC 2026 Spring Playoffs',
  'LEC 2026 Versus Season', 'LEC 2026 Versus Playoffs',
  'LEC 2026 Summer Season', 'LEC 2026 Summer Playoffs',
  'First Stand 2026', 'MSI 2026', 'Worlds 2026 Play-In', 'Worlds 2026 Main Event',
  'Demacia Cup Global Invitational 2026',
];

async function get(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 200) return await r.text();
      if (r.status === 404) return null;
      if (r.status === 429 || r.status === 503) { await sleep(4000 + i * 2500); continue; }
    } catch (e) { /* retry */ }
    await sleep(600 + i * 600);
  }
  return null;
}

function parseGame(html) {
  const alt = (s) => [...s.matchAll(/<img[^>]*class='champion_icon[^']*rounded-circle'[^>]*alt='([^']+)'/g)].map((m) => m[1]);
  const teams = [...html.matchAll(/>([^<>]{1,40})<\/a>\s*-\s*(WIN|LOSS)/g)].map((m) => ({ t: m[1], win: m[2] === 'WIN' }));
  const bans = [];
  const banBlocks = [...html.matchAll(/Bans\s*<\/div>\s*<div class="col-10">([\s\S]{0,4000}?)<\/div>/g)];
  for (const b of banBlocks) bans.push(alt(b[1]).slice(0, 5));
  const picks = [];
  const parts = html.split('playersInfosLine').slice(1, 3);
  for (const part of parts) {
    const champs = [...part.matchAll(/href='\.\.\/champion\/champion-stats\/\d+\/[^']*'[^>]*>\s*<img[^>]*alt='([^']+)'/g)].map((m) => m[1]);
    picks.push(champs.slice(0, 5));
  }
  const dur = html.match(/Game Time[\s\S]{0,200}?(\d{2}:\d{2})/);
  const patch = html.match(/Patch\s*<\/td>\s*<td[^>]*>([\d.]+)/);
  return { teams, bans, picks, dur: dur ? dur[1] : '', patch: patch ? patch[1] : '' };
}

const stageOf = (t) => (/Playoffs|Grand Finals|Regional Finals/.test(t) ? 'po' : /Demacia|First Stand/.test(t) ? 'cup' : 'rs');

const listOnly = process.argv.includes('--list');
if (listOnly) {
  const series = new Map();
  for (const t of TOURNAMENTS) {
    const html = await get(`${BASE}/tournament/tournament-matchlist/${encodeURIComponent(t)}/`);
    if (!html) { console.log('nosheet', t); continue; }
    const found = [...new Set([...html.matchAll(/game\/stats\/(\d+)\/page-summary\//g)].map((m) => m[1]))];
    found.forEach((id) => series.set(id, t));
    console.log('list', t, found.length);
    await sleep(250);
  }
  console.log('series total', series.size);
  fs.writeFileSync('_tools/series16.json', JSON.stringify([...series.entries()]));
  process.exit(0);
}

const series = JSON.parse(fs.readFileSync('_tools/series16.json', 'utf8'));
const outPath = '_tools/gs16full.json';
const out = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : {};

const gameIds = [];
const q1 = series.slice();
let expanded = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (q1.length) {
    const [sid, tour] = q1.shift();
    const html = await get(`${BASE}/game/stats/${sid}/page-summary/`);
    if (html) {
      const ids = [...new Set([...html.matchAll(/game\/stats\/(\d+)\/page-game\//g)].map((m) => m[1]))];
      ids.forEach((gid) => gameIds.push([gid, +sid, tour]));
      expanded++;
    }
    if (expanded % 100 === 0 && expanded) console.log('expand', expanded, 'games', gameIds.length);
    await sleep(80);
  }
}));
fs.writeFileSync('_tools/_games16.json', JSON.stringify(gameIds));
const queue = gameIds.filter(([gid]) => !out[gid]);
console.log('expanded', expanded, 'games', gameIds.length, 'have', Object.keys(out).length, 'todo', queue.length);

const t0 = Date.now();
let n = 0;
const save = () => fs.writeFileSync(outPath, JSON.stringify(out));
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) {
    const [gid, sid, tour] = queue.shift();
    if (out[gid]) continue;
    const html = await get(`${BASE}/game/stats/${gid}/page-game/`);
    if (html) {
      const g = parseGame(html);
      g.sid = sid;
      g.tour = tour;
      g.stage = stageOf(tour);
      if (g.picks.length === 2 && g.picks[0].length === 5 && g.picks[1].length === 5) out[gid] = g;
    }
    n++;
    if (n % 100 === 0) { save(); console.log('done', n, 'saved', Object.keys(out).length, Math.round((Date.now() - t0) / 1000) + 's'); }
    await sleep(85);
  }
}));
save();
console.log('final', Object.keys(out).length, 'games in', Math.round((Date.now() - t0) / 1000) + 's');
