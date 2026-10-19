// 把抓到的 2026 / 2025 赛事对局聚合成前端用的统计库
// 输出 js/data/prostats.js -> window.PROSTATS
// 口径：
//   - 出场/禁用的场次按真实局数累加（p/b），胜场按赛季权重累加（w/pw/bw），胜率 = w/pw
//   - S16（2026）权重 1.0，S15（2025）权重 0.3 只做趋势参考
//   - 额外产出 po：只吃 S16 季后赛（stage=po，含 LPL Split3 / Grand Finals / LCK Playoffs / LEC Playoffs / MSI 等）
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
const names = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools/names.json'), 'utf8'));

const SOURCES = [
  { file: '_tools/gs16full.json', season: '2026', weight: 1, fallback: '_tools/gs16.json' },
  { file: '_tools/gs25.json', season: '2025', weight: 0.3 },
];

const ROLES = ['top', 'jg', 'mid', 'bot', 'sup'];
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const NORM_MAP = {};
Object.keys(names).forEach((k) => { NORM_MAP[norm(k)] = names[k]; });
Object.values(names).forEach((v) => { NORM_MAP[norm(v)] = v; });
const idOf = (raw) => {
  if (!raw) return null;
  if (norm(raw) === 'noban') return null;
  if (names[raw]) return names[raw];
  return NORM_MAP[norm(raw)] || null;
};

function createStats() {
  return {
    champs: {}, // id -> {p,pw,b,bw,w,roles:{r:{p,pw,w}},lg:{L:{p,pw,b,bw,w}}}
    duos: {}, // 'adc|sup' -> {n,nw,w}
    pairs: {}, // 任意两人 -> {n,nw,w}
    counters: {}, // 'A>B' 同位置 -> {n,nw,w}（A 方胜场）
    games: 0,
    wGames: 0,
    blueWin: 0,
    leagues: {},
    byTour: {},
  };
}

const all = createStats();
const po = createStats();
const missing = new Set();
const bySeason = {};

function bumpChamp(st, id, prop, w) {
  const c = st.champs[id] || (st.champs[id] = { p: 0, pw: 0, b: 0, bw: 0, w: 0, roles: {}, lg: {} });
  if (prop === 'b') { c.b += 1; c.bw += w; }
  else if (prop === 'p') { c.p += 1; c.pw += w; }
  else { c[prop] += w; }
  return c;
}

function leagueOf(t) {
  if (!t) return 'OTHER';
  if (t.startsWith('LPL')) return 'LPL';
  if (t.startsWith('LCK')) return 'LCK';
  if (t.startsWith('LEC')) return 'LEC';
  if (t.startsWith('MSI') || t.startsWith('Mid-Season')) return 'MSI';
  if (t.startsWith('Worlds')) return 'Worlds';
  if (t.startsWith('First Stand')) return 'FirstStand';
  if (t.startsWith('EWC')) return 'EWC';
  return 'OTHER';
}

function addGame(st, g, weight) {
  if (!g || !g.picks || g.picks.length !== 2) return false;
  const bp = g.picks[0];
  const rp = g.picks[1];
  const bans = g.bans || [[], []];
  const teams = g.teams || [];
  if (!bp || !rp || bp.length !== 5 || rp.length !== 5) return false;
  if (!bp.every(Boolean) || !rp.every(Boolean)) return false;

  const tour = g.tournament || g.tour || '';
  const lg = leagueOf(tour);
  st.leagues[lg] = (st.leagues[lg] || 0) + 1;
  if (tour) st.byTour[tour] = (st.byTour[tour] || 0) + 1;
  st.games++;
  st.wGames += weight;

  const winner = teams[0] && teams[0].win ? 0 : (teams[1] && teams[1].win ? 1 : -1);
  if (winner === 0) st.blueWin += weight;

  const sides = [bp, rp];
  sides.forEach((picks, si) => {
    const win = winner === si ? 1 : 0;
    const ww = win * weight;
    picks.forEach((raw, ri) => {
      const id = idOf(raw);
      if (!id) { missing.add(raw); return; }
      const c = bumpChamp(st, id, 'p', weight);
      c.w += ww;
      const role = ROLES[ri];
      const rr = c.roles[role] || (c.roles[role] = { p: 0, pw: 0, w: 0 });
      rr.p++; rr.pw += weight; rr.w += ww;
      const ll = c.lg[lg] || (c.lg[lg] = { p: 0, pw: 0, b: 0, bw: 0, w: 0 });
      ll.p++; ll.pw += weight; ll.w += ww;
    });
    (bans[si] || []).forEach((raw) => {
      if (!raw || norm(raw) === 'noban') return;
      const id = idOf(raw);
      if (!id) { missing.add(raw); return; }
      bumpChamp(st, id, 'b', weight);
      const c = st.champs[id];
      const ll = c.lg[lg] || (c.lg[lg] = { p: 0, pw: 0, b: 0, bw: 0, w: 0 });
      ll.b++; ll.bw += weight;
    });
    // 组合：下路双人组 + 任意两人
    const duoIds = [idOf(picks[3]), idOf(picks[4])];
    if (duoIds[0] && duoIds[1]) {
      const k = duoIds[0] < duoIds[1] ? duoIds[0] + '|' + duoIds[1] : duoIds[1] + '|' + duoIds[0];
      const d = st.duos[k] || (st.duos[k] = { n: 0, nw: 0, w: 0 });
      d.n++; d.nw += weight; d.w += ww;
    }
    const ids = picks.map(idOf);
    for (let i = 0; i < 5; i++) {
      if (!ids[i]) continue;
      for (let j = i + 1; j < 5; j++) {
        if (!ids[j]) continue;
        const k = ids[i] < ids[j] ? ids[i] + '|' + ids[j] : ids[j] + '|' + ids[i];
        const d = st.pairs[k] || (st.pairs[k] = { n: 0, nw: 0, w: 0 });
        d.n++; d.nw += weight; d.w += ww;
      }
    }
  });

  // 同位置对位
  if (winner >= 0) {
    for (let r = 0; r < 5; r++) {
      const a = idOf(bp[r]);
      const b = idOf(rp[r]);
      if (!a || !b) continue;
      const k1 = a + '>' + b;
      const k2 = b + '>' + a;
      const d1 = st.counters[k1] || (st.counters[k1] = { n: 0, nw: 0, w: 0 });
      d1.n++; d1.nw += weight; d1.w += winner === 0 ? weight : 0;
      const d2 = st.counters[k2] || (st.counters[k2] = { n: 0, nw: 0, w: 0 });
      d2.n++; d2.nw += weight; d2.w += winner === 1 ? weight : 0;
    }
  }
  return true;
}

SOURCES.forEach((src) => {
  let p = path.join(ROOT, src.file);
  if (!fs.existsSync(p) && src.fallback) p = path.join(ROOT, src.fallback);
  if (!fs.existsSync(p)) return;
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  let n = 0;
  let np = 0;
  Object.keys(raw).forEach((gid) => {
    const g = raw[gid];
    if (!g) return;
    if (addGame(all, g, src.weight)) n++;
    if (src.season === '2026' && g.stage === 'po' && addGame(po, g, src.weight)) np++;
  });
  bySeason[src.season] = n;
  if (np) bySeason[src.season + 'PO'] = np;
  console.log('loaded', src.season, n, 'games (po', np + ') from', path.basename(p));
});

const pct = (w, n) => (n ? Math.round((w / n) * 1000) / 10 : 0);

function buildChamps(st, withRoles) {
  const champs = {};
  Object.keys(st.champs).forEach((id) => {
    const c = st.champs[id];
    if (!c.p) return;
    const roles = {};
    if (withRoles) {
      Object.keys(c.roles).forEach((r) => {
        const v = c.roles[r];
        roles[r] = { p: v.p, wr: pct(v.w, v.pw) };
      });
    }
    const lg = {};
    Object.keys(c.lg).forEach((l) => {
      const v = c.lg[l];
      lg[l] = { p: v.p, b: v.b, wr: pct(v.w, v.pw) };
    });
    champs[id] = {
      p: c.p, b: c.b,
      wr: pct(c.w, c.pw),
      pr: pct(c.pw + c.bw, st.wGames * 2),
      roles, lg,
    };
  });
  return champs;
}

const champs = buildChamps(all, true);
const poChamps = buildChamps(po, false);

const duos = {};
Object.keys(all.duos).forEach((k) => {
  const d = all.duos[k];
  if (d.n < 6) return;
  duos[k] = { n: d.n, wr: pct(d.w, d.nw) };
});
const pairs = {};
Object.keys(all.pairs).forEach((k) => {
  const d = all.pairs[k];
  if (d.n < 10) return;
  pairs[k] = { n: d.n, wr: pct(d.w, d.nw) };
});
const counters = {};
Object.keys(all.counters).forEach((k) => {
  const d = all.counters[k];
  if (d.n < 4) return;
  counters[k] = { n: d.n, wr: pct(d.w, d.nw) };
});
const poCounters = {};
Object.keys(po.counters).forEach((k) => {
  const d = po.counters[k];
  if (d.n < 3) return;
  poCounters[k] = { n: d.n, wr: pct(d.w, d.nw) };
});

const out = {
  ver: '16.20.1',
  sample: {
    games: all.games,
    seasons: bySeason,
    leagues: all.leagues,
    blueWinPct: pct(all.blueWin, all.wGames),
    weighted: { games: Math.round(all.wGames * 10) / 10, currentSeasonWeight: 1, prevSeasonWeight: 0.3 },
    poGames: po.games,
    poBlueWinPct: pct(po.blueWin, po.wGames),
    updated: new Date().toISOString().slice(0, 10),
  },
  champs,
  duos,
  pairs,
  counters,
  po: { sample: { games: po.games, blueWinPct: pct(po.blueWin, po.wGames), leagues: po.leagues }, champs: poChamps, counters: poCounters },
};

const body = 'window.PROSTATS = ' + JSON.stringify(out) + ';\n';
fs.writeFileSync(path.join(ROOT, 'js/data/prostats.js'), body);
console.log('games', all.games, JSON.stringify(bySeason), 'champs', Object.keys(champs).length,
  'duos', Object.keys(duos).length, 'pairs', Object.keys(pairs).length, 'counters', Object.keys(counters).length,
  'po', po.games, 'poChamps', Object.keys(poChamps).length,
  'leagues', JSON.stringify(all.leagues), 'blueWin%', out.sample.blueWinPct,
  'poBlue%', out.sample.poBlueWinPct,
  'size', Math.round(body.length / 1024) + 'KB');
if (missing.size) console.log('missing names:', [...missing].slice(0, 20).join(','));
