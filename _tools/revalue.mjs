// 重新评估选手评分：以 2026 赛季队伍战绩 + 现有评分为基础，按位置调整五项数值
import fs from 'fs';
const ROOT = 'D:/deepseek/bp/';
const win = {};
global.window = win;
eval(fs.readFileSync(ROOT + 'js/data/players.js', 'utf8'));
const PLAYERS = win.PLAYERS;
eval(fs.readFileSync(ROOT + 'js/data/profiles.js', 'utf8'));
const TP = win.TEAM_PROFILES || {};

// 世界级选手：个人能力高于队伍平均
const STAR = {
  Faker: 4.0, Chovy: 3.5, Ruler: 3.5, Viper: 3.0, knight: 2.6, Kiin: 2.6, Canyon: 2.6,
  Zeus: 2.6, Bdd: 2.2, Keria: 2.4, Tarzan: 2.2, Scout: 2.0, ShowMaker: 1.8, Bin: 2.0,
  GALA: 2.0, Kanavi: 1.8, Zeka: 1.8, Gumayusi: 1.8, TheShy: 1.8, Rookie: 1.8, Meiko: 1.8,
  JackeyLove: 1.8, Peyz: 2.0, ON: 1.4, Delight: 1.2, Xiaohu: 1.2, Elk: 1.2, Hope: 1.2,
  Tian: 1.4, Shanks: 1.2, Breathe: 1.0, Doran: 1.0, Oner: 1.4, Crisp: 1.0,
};

function teamBase(team) {
  const p = TP[team];
  if (!p || !p.games) return null;
  return 76 + 16 * Math.max(0, Math.min(1, (p.wr - 20) / 58));
}

const byTeam = {};
PLAYERS.forEach((p) => (byTeam[p.t] = byTeam[p.t] || []).push(p));
const mean = (p) => (p.a + p.d + p.f + p.b) / 4;

const roleShape = {
  top: { a: 1.5, d: 1.0, f: 0.5, b: -3.0 },
  jg: { a: 1.5, d: 0.0, f: 1.5, b: 0.5 },
  mid: { a: 2.0, d: 0.0, f: 1.5, b: -1.0 },
  bot: { a: 3.0, d: 1.0, f: 2.5, b: -2.5 },
  sup: { a: -5.0, d: -0.5, f: 2.0, b: 1.5 },
};

const rows = [];
PLAYERS.forEach((pl) => {
  const cur = mean(pl);
  const tbRaw = teamBase(pl.t);
  const teamMean = byTeam[pl.t].reduce((n, x) => n + mean(x), 0) / byTeam[pl.t].length;
  const tb = tbRaw == null ? teamMean : tbRaw;
  const star = STAR[pl.n] || 0;
  let target = 0.45 * cur + 0.35 * tb + 0.2 * teamMean + star;
  if (pl.sub) target -= 2.2;
  target = Math.max(70, Math.min(97, target));
  const shape = roleShape[pl.r] || roleShape.mid;
  const out = {};
  ['a', 'd', 'f', 'b'].forEach((k) => {
    out[k] = Math.round(Math.max(68, Math.min(98, target + shape[k] * 0.6 + (pl[k] - cur) * 0.55)));
  });
  out.pool = Math.round(Math.max(72, Math.min(96, target - 1.5 + ((pl.s || []).length - 4) * 1.2)));
  rows.push({ pl: pl, a: out.a, d: out.d, f: out.f, b: out.b, pool: out.pool, target: target });
});

const order = [];
PLAYERS.forEach((p) => { if (order.indexOf(p.t) < 0) order.push(p.t); });

const head = '// 选手数据：a=进攻 d=防守 f=团战 b=运营 p=英雄池 s=擅长英雄(ID)\n' +
  '// 阵容与英雄池基于 2026 赛季 LPL / LCK 主流首发；数值按 2026 战绩 + 个人表现重新评估（可在编辑器里继续改）\n' +
  'window.PLAYERS = [\n';
let body = '';
order.forEach((team) => {
  body += '  // ===== ' + team + ' =====\n';
  rows.filter((r) => r.pl.t === team).forEach((r) => {
    const pl = r.pl;
    const parts = [];
    parts.push("i: '" + pl.i + "'");
    parts.push("n: '" + pl.n + "'");
    parts.push('t: ' + JSON.stringify(pl.t));
    parts.push("r: '" + pl.r + "'");
    parts.push('a: ' + r.a);
    parts.push('d: ' + r.d);
    parts.push('f: ' + r.f);
    parts.push('b: ' + r.b);
    parts.push('p: ' + r.pool);
    if (pl.sub) parts.push('sub: 1');
    if (pl.custom) parts.push('custom: 1');
    parts.push('s: [' + (pl.s || []).map((x) => "'" + x + "'").join(', ') + ']');
    body += '  { ' + parts.join(', ') + ' },\n';
  });
});
fs.writeFileSync(ROOT + 'js/data/players.js', head + body + '];\n', 'utf8');

const sorted = rows.slice().sort((x, y) => y.target - x.target);
console.log('total', rows.length, 'top 18:');
sorted.slice(0, 18).forEach((r) => console.log('  ', r.pl.n.padEnd(12), r.pl.t.padEnd(22), r.pl.r, ((r.a + r.d + r.f + r.b) / 4).toFixed(1), 'AVG', r.target.toFixed(1)));
console.log('\nteam means:');
order.forEach((t) => {
  const arr = rows.filter((r) => r.pl.t === t);
  const m = arr.reduce((n, r) => n + (r.a + r.d + r.f + r.b) / 4, 0) / arr.length;
  console.log('  ', t.padEnd(22), m.toFixed(1), 'wr', (TP[t] && TP[t].wr) || '-');
});
