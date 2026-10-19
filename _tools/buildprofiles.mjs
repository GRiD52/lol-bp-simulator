// 从真实赛事 BP 数据里提炼「职业分路」与「战队风格画像」
// 输出 js/data/profiles.js -> window.PRO_ROLES / window.TEAM_PROFILES
//
// 口径：
// - 分路按 Liquipedia 对局页的固定顺序（上/野/中/下/辅），1107 局 x 2 队 = 2214 个阵容
// - 分路权重：2026 赛季 1.0，2025 赛季 0.4（职业分路变化慢，旧赛季仍具参考性）
// - 战队画像只用 2026 赛季（当前阵容）为主，2025 赛季按 0.4 加权
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
const names = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools/names.json'), 'utf8'));
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

// 英雄定位标签（与 js/data/champmeta.js 同源）
const metaSrc = fs.readFileSync(path.join(ROOT, 'js/data/champmeta.js'), 'utf8');
const CH_TAGS = {};
metaSrc.replace(/(\w+): '([^']+)'/g, (_, k, v) => {
  const parts = v.split('|');
  CH_TAGS[k] = { pos: parts[0] || '', tags: (parts[2] || '').split(',').filter(Boolean) };
});

// 战队别名 → 站点里的 24 支战队
const TEAM_ALIAS = {};
const TEAMS = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools/teamlist.json'), 'utf8'));
TEAMS.forEach((t) => {
  TEAM_ALIAS[norm(t.t)] = t.t;
  TEAM_ALIAS[norm(t.tag)] = t.t;
});
[
  ['Gen.G', 'Gen.G Esports'], ['Gen.G eSports', 'Gen.G Esports'],
  ['Dplus KIA', 'Dplus'], ['Dplus', 'Dplus'],
  ['BNK FearX', 'FEARX'], ['FEARX', 'FEARX'],
  ['DN SOOPers', 'SOOPers'], ['SOOPers', 'SOOPers'],
  ['HANJIN BRION', 'BRION'], ['OK BRION', 'BRION'], ['BRION', 'BRION'],
  ['Kiwoom DRX', 'DRX'], ['DRX', 'DRX'],
  ['Nongshim RedForce', 'Nongshim Redforce'], ['Nongshim Redforce', 'Nongshim Redforce'],
  ['OMG', 'Oh My God'], ['Oh My God', 'Oh My God'],
  ['TT', 'ThunderTalk Gaming'], ['ThunderTalk Gaming', 'ThunderTalk Gaming'],
  ['Anyone s Legend', "Anyone's Legend"], ["Anyone's Legend", "Anyone's Legend"],
  ['Edward Gaming', 'EDward Gaming'], ['EDward Gaming', 'EDward Gaming'],
  ['Hanwha Life eSports', 'Hanwha Life Esports'], ['Hanwha Life Esports', 'Hanwha Life Esports'],
  ['LGD Gaming', 'LGD Gaming'], ['Ultra Prime', 'Ultra Prime'],
].forEach(([a, b]) => { TEAM_ALIAS[norm(a)] = b; });
const teamOf = (raw) => TEAM_ALIAS[norm(raw)] || null;

const SOURCES = [
  { file: '_tools/gs16full.json', fallback: '_tools/gs16.json', weight: 1, label: '2026' },
  { file: '_tools/gs25.json', weight: 0.4, label: '2025' },
];
const ROLES = ['top', 'jg', 'mid', 'bot', 'sup'];

const roles = {};   // champ -> { role: weightedPlays }
const roleWin = {}; // champ -> { role: weightedWins }
const team = {};    // name -> stats
const unmatched = new Set();
const missing = new Set();
const bySeason = {};
let games = 0;

function teamBox(name) {
  if (!team[name]) {
    team[name] = {
      name, games: 0, wins: 0, durSum: 0, durN: 0,
      picks: {}, bans: {}, banned: {},
      side: { blue: { g: 0, w: 0 }, red: { g: 0, w: 0 } },
    };
  }
  return team[name];
}

SOURCES.forEach((src) => {
  let p = path.join(ROOT, src.file);
  if (!fs.existsSync(p) && src.fallback) p = path.join(ROOT, src.fallback);
  if (!fs.existsSync(p)) return;
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  let n = 0;
  Object.keys(raw).forEach((gid) => {
    const g = raw[gid];
    if (!g || !g.picks || g.picks.length !== 2) return;
    const [bp, rp] = g.picks;
    if (!bp || !rp || bp.length !== 5 || rp.length !== 5) return;
    if (!bp.every(Boolean) || !rp.every(Boolean)) return;
    const tnames = (g.teams || []).map((t) => teamOf(t && t.t));
    if (!tnames[0] || !tnames[1]) { (g.teams || []).forEach((t) => t && unmatched.add(t.t)); return; }
    const winner = (g.teams[0] && g.teams[0].win) ? 0 : ((g.teams[1] && g.teams[1].win) ? 1 : -1);
    if (winner < 0) return;
    n++; games++;

    const durSec = (() => {
      const m = /(\d+):(\d+)/.exec(g.dur || '');
      return m ? (+m[1]) * 60 + (+m[2]) : 0;
    })();

    [bp, rp].forEach((picks, si) => {
      const tn = tnames[si];
      const box = teamBox(tn);
      box.games++;
      box.wins += winner === si ? 1 : 0;
      const sd = si === 0 ? 'blue' : 'red';
      box.side[sd].g++;
      box.side[sd].w += winner === si ? 1 : 0;
      if (durSec && si === 0) { box.durSum += durSec; box.durN++; }
      picks.forEach((rawC, ri) => {
        const id = idOf(rawC);
        if (!id) { missing.add(rawC); return; }
        const role = ROLES[ri];
        const r = roles[id] || (roles[id] = {});
        r[role] = (r[role] || 0) + src.weight;
        const rw = roleWin[id] || (roleWin[id] = {});
        rw[role] = (rw[role] || 0) + (winner === si ? src.weight : 0);
        box.picks[id] = (box.picks[id] || 0) + 1;
      });
      (g.bans && g.bans[si] ? g.bans[si] : []).forEach((rawC) => {
        if (!rawC || norm(rawC) === 'noban') return;
        const id = idOf(rawC);
        if (!id) { missing.add(rawC); return; }
        box.bans[id] = (box.bans[id] || 0) + 1;
      });
      // 对手 ban 自己（banned）
      const opp = si === 0 ? 1 : 0;
      const oppBans = (g.bans && g.bans[opp]) || [];
      oppBans.forEach((rawC) => {
        if (!rawC || norm(rawC) === 'noban') return;
        const id = idOf(rawC);
        if (!id) return;
        box.banned[id] = (box.banned[id] || 0) + 1;
      });
    });
  });
  bySeason[src.label] = n;
});

// 职业分路：计数取整 + 占比
const PRO_ROLES = {};
Object.keys(roles).forEach((id) => {
  const r = roles[id];
  const total = Object.keys(r).reduce((a, k) => a + r[k], 0);
  const out = {};
  ROLES.forEach((role) => {
    const p = r[role] || 0;
    if (p <= 0) return;
    const wr = roleWin[id] && roleWin[id][role] ? roleWin[id][role] / p : 0;
    out[role] = { p: Math.round(p * 10) / 10, share: Math.round((p / total) * 1000) / 10, wr: Math.round(wr * 1000) / 10 };
  });
  PRO_ROLES[id] = { total: Math.round(total * 10) / 10, roles: out };
});

// 战队画像：只保留匹配上的 24 队，附风格标签统计
const TAG_KEYS = ['front', 'engage', 'cc', 'poke', 'sustain', 'burst', 'scale', 'early', 'split', 'util', 'antitank', 'wave', 'mobi', 'heal'];
function tagShares(picks) {
  const cnt = {};
  let total = 0;
  Object.keys(picks).forEach((id) => {
    const n = picks[id];
    const tags = (CH_TAGS[id] || {}).tags || [];
    total += n;
    tags.forEach((t) => { cnt[t] = (cnt[t] || 0) + n; });
  });
  const out = {};
  TAG_KEYS.forEach((t) => { out[t] = total ? Math.round((cnt[t] || 0) / total * 1000) / 10 : 0; });
  return out;
}

const TEAM_PROFILES = {};
Object.keys(team).forEach((name) => {
  const b = team[name];
  if (b.games < 8) return;
  const picks = b.picks;
  const topPicks = Object.keys(picks).sort((x, y) => picks[y] - picks[x]).slice(0, 14)
    .map((id) => [id, picks[id]]);
  const topBans = Object.keys(b.bans).sort((x, y) => b.bans[y] - b.bans[x]).slice(0, 10)
    .map((id) => [id, b.bans[id]]);
  const topBanned = Object.keys(b.banned).sort((x, y) => b.banned[y] - b.banned[x]).slice(0, 10)
    .map((id) => [id, b.banned[id]]);
  const sideOut = {};
  ['blue', 'red'].forEach((sd) => {
    const s = b.side[sd];
    sideOut[sd] = { g: s.g, w: s.w, wr: s.g ? Math.round((s.w / s.g) * 1000) / 10 : 0 };
  });
  TEAM_PROFILES[name] = {
    games: b.games,
    wr: Math.round((b.wins / b.games) * 1000) / 10,
    dur: b.durN ? Math.round(b.durSum / b.durN) : 0,
    picks: picks,
    topPicks: topPicks,
    topBans: topBans,
    topBanned: topBanned,
    tags: tagShares(picks),
    side: sideOut,
  };
});

// 红蓝边胜率（独立输出，方便前端按队伍读取；只保留样本 >= 6 的队伍）
const TEAM_SIDE = {};
Object.keys(TEAM_PROFILES).forEach((name) => {
  const t = TEAM_PROFILES[name];
  if (!t.side) return;
  if ((t.side.blue.g + t.side.red.g) < 6) return;
  TEAM_SIDE[name] = t.side;
});

const out = {
  updated: new Date().toISOString().slice(0, 10),
  sample: { games, seasons: bySeason, teams: Object.keys(TEAM_PROFILES).length },
  PRO_ROLES,
  TEAM_PROFILES,
};
const body = 'window.PRO_ROLES = ' + JSON.stringify(out.PRO_ROLES) + ';\n' +
  'window.PRO_PROFILE_META = ' + JSON.stringify({ updated: out.updated, sample: out.sample }) + ';\n' +
  'window.TEAM_PROFILES = ' + JSON.stringify(out.TEAM_PROFILES) + ';\n' +
  'window.TEAM_SIDE = ' + JSON.stringify(TEAM_SIDE) + ';\n';
fs.writeFileSync(path.join(ROOT, 'js/data/profiles.js'), body);
console.log('games', games, JSON.stringify(bySeason), 'champs with pro roles', Object.keys(PRO_ROLES).length,
  'teams', Object.keys(TEAM_PROFILES).length, 'sides', Object.keys(TEAM_SIDE).length,
  'size', Math.round(body.length / 1024) + 'KB');
if (unmatched.size) console.log('unmatched teams:', [...unmatched].slice(0, 30).join(' | '));
if (missing.size) console.log('missing champs:', [...missing].slice(0, 20).join(','));
