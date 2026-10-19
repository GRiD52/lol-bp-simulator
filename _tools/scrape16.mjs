// 抓取 gol.gg 2026 赛季主要赛事单局数据（pick/ban/分路/胜负），用于自建 BP 统计
import fs from 'fs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const BASE = 'https://gol.gg';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = process.argv[2] || 'dry';

export const TOURNAMENTS = [
  'LPL 2026 Split 1', 'LPL 2026 Split 1 Playoffs', 'LPL 2026 Split 2', 'LPL 2026 Split 2 Playoffs',
  'LPL 2026 Split 3', 'LPL 2026 Regional Finals', 'LPL 2026 Grand Finals',
  'LCK 2026 Rounds 1-2', 'LCK 2026 Rounds 3-4', 'LCK 2026 Season Play-In', 'LCK 2026 Season Playoffs', 'LCK 2026 Road to MSI',
  'LEC 2026 Spring Season', 'LEC 2026 Spring Playoffs', 'LEC 2026 Versus Season', 'LEC 2026 Versus Playoffs',
  'LEC 2026 Summer Season', 'LEC 2026 Summer Playoffs',
  'First Stand 2026', 'MSI 2026', 'EWC 2026', 'Worlds 2026 Play-In', 'Worlds 2026 Main Event',
];

async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 200) return await r.text();
      if (r.status === 429) { await sleep(4000); continue; }
      if (r.status === 404) return null;
    } catch (e) { /* retry */ }
    await sleep(600 + i * 900);
  }
  return null;
}

function parseGame(html) {
  const alt = (s) => [...s.matchAll(/<img[^>]*class='champion_icon[^']*rounded-circle'[^>]*alt='([^']+)'/g)].map((m) => m[1]);
  // 赛事名
  const tm = html.match(/tournament\/tournament-stats\/([^/']+)\//);
  const tournament = tm ? decodeURIComponent(tm[1]) : '';
  // 两队 + 胜负
  const teams = [...html.matchAll(/>([^<>]{1,40})<\/a>\s*-\s*(WIN|LOSS)/g)].map((m) => ({ t: m[1], win: m[2] === 'WIN' }));
  // 禁用：两段 "Bans" 之后的 col-10 区块
  const bans = [];
  const banBlocks = [...html.matchAll(/Bans\s*<\/div>\s*<div class="col-10">([\s\S]{0,4000}?)<\/div>/g)];
  for (const b of banBlocks) bans.push(alt(b[1]).slice(0, 5));
  // 选用：playersInfosLine 两张表，行序 = 上野中下辅
  const picks = [];
  const parts = html.split('playersInfosLine').slice(1, 3);
  for (const part of parts) {
    const champs = [...part.matchAll(/href='\.\.\/champion\/champion-stats\/\d+\/[^']*'[^>]*>\s*<img[^>]*alt='([^']+)'/g)].map((m) => m[1]);
    picks.push(champs.slice(0, 5));
  }
  const dur = html.match(/Game Time[\s\S]{0,200}?(\d{2}:\d{2})/);
  return {
    tournament,
    teams,
    bans,
    picks,
    dur: dur ? dur[1] : '',
  };
}

export async function collectIds() {
  const ids = new Map();
  for (const t of TOURNAMENTS) {
    const html = await get(`${BASE}/tournament/tournament-matchlist/${encodeURIComponent(t)}/`);
    if (!html) { console.log('nosheet', t); await sleep(300); continue; }
    const found = [...html.matchAll(/game\/stats\/(\d+)\//g)].map((m) => m[1]);
    found.forEach((id) => ids.set(id, t));
    console.log('list', t, found.length);
    await sleep(300);
  }
  return ids;
}

async function main() {
  if (arg === 'dry') {
    const html = await get(`${BASE}/game/stats/82471/page-game/`);
    console.log(JSON.stringify(parseGame(html), null, 1));
    return;
  }
  if (arg === 'ids') {
    const ids = await collectIds();
    fs.writeFileSync('_tools/ids16.json', JSON.stringify([...ids.keys()]));
    console.log('total ids', ids.size);
    return;
  }
  // 全量抓取
  const ids = JSON.parse(fs.readFileSync('_tools/ids16.json', 'utf8'));
  const out = fs.existsSync('_tools/gs16.json') ? JSON.parse(fs.readFileSync('_tools/gs16.json', 'utf8')) : {};
  let n = 0;
  const queue = ids.filter((id) => !out[id]);
  console.log('todo', queue.length);
  const workers = Array.from({ length: 4 }, async (_, w) => {
    while (queue.length) {
      const id = queue.shift();
      const html = await get(`${BASE}/game/stats/${id}/page-game/`);
      if (html) {
        const g = parseGame(html);
        if (g.picks.length === 2 && g.picks[0].length === 5 && g.picks[1].length === 5) out[id] = g;
      }
      n++;
      if (n % 50 === 0) {
        fs.writeFileSync('_tools/gs16.json', JSON.stringify(out));
        console.log('done', n, 'saved', Object.keys(out).length);
      }
      await sleep(120);
    }
  });
  await Promise.all(workers);
  fs.writeFileSync('_tools/gs16.json', JSON.stringify(out));
  console.log('finished', Object.keys(out).length);
}

main();
