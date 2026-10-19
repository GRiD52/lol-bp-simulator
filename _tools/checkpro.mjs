// 校验新 AI 模型：职业分路、体系、抢 ban 顺序、Neeko/Fizz 不再打中单
import fs from 'fs';
const ROOT = 'D:/deepseek/bp/';
function load(f) { eval(fs.readFileSync(ROOT + f, 'utf8')); }
global.window = global;
global.document = { addEventListener() { } };
load('js/data/champions.js');
load('js/data/champmeta.js');
load('js/data/teams.js');
load('js/data/photos.js');
load('js/data/players.js');
load('js/data/prostats.js');
load('js/data/profiles.js');
load('js/data/nicknames.js');
load('js/core/rules.js');
load('js/core/style.js');
load('js/core/draft.js');
load('js/core/meta.js');
load('js/core/aibp.js');
load('js/core/analysis.js');

const D = window.Draft;
const R = window.RULES;
const AIBP = window.AIBP;
let fail = 0;
function bad(m) { console.log('FAIL ' + m); fail++; }

// 1) Neeko / Fizz 的分路
[['Neeko', 'mid'], ['Fizz', 'mid']].forEach(([id, wrong]) => {
  const roles = AIBP.proRoles(id);
  if (!roles) { console.log('OK ' + id + ' 无职业样本，AI 不会选'); return; }
  if (roles[wrong]) bad(id + ' 仍然能打 ' + wrong + '：' + JSON.stringify(roles));
  else console.log('OK ' + id + ' 职业分路 ' + Object.keys(roles).join('/') + '，不会走 ' + wrong);
});

// 2) 按体系模拟 4 队各 1 局（AI 双方），检查阵容与 why
function playGame(blue, red, seed) {
  let x = seed;
  const rnd = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
  const realRandom = Math.random;
  Math.random = rnd;
  const s = D.newSeries({ mode: 'BO1', fearless: false, banCarry: false, timer: 0 });
  s.teams = { blue: blue, red: red };
  D.startGame(s, blue, red);
  const log = [];
  while (!D.bpComplete(s)) {
    const st = D.curStep(s);
    const ctx = AIBP.ctxOf(s, { profile: st.side === 'blue' ? 'control' : 'tempo' });
    const p = AIBP.plan(s, { profile: st.side === 'blue' ? 'control' : 'tempo' });
    if (!p || !p.id) { bad('AI 没选出英雄 step=' + s.cur.step); break; }
    const bucket = st.type === 'ban' ? s.cur.bans : s.cur.picks;
    const before = bucket[st.side].length;
    const ok = D.commit(s, p.id);
    if (!ok) { bad('commit 失败 ' + p.id); break; }
    log.push({ side: st.side, type: st.type, id: p.id, role: p.role, why: p.why });
    if (bucket[st.side].length !== before + 1) { bad('提交后数量不对'); }
  }
  Math.random = realRandom;
  // 校验：阵容能按职业分路摆满
  const bp = s.cur.picks.blue, rp = s.cur.picks.red;
  const ab = D.assignRoles(bp), ar = D.assignRoles(rp);
  if (!ab || Object.keys(ab).length !== 5) bad(blue + ' 阵容摆不满：' + JSON.stringify(bp) + ' ' + JSON.stringify(ab));
  if (!ar || Object.keys(ar).length !== 5) bad(red + ' 阵容摆不满：' + JSON.stringify(rp) + ' ' + JSON.stringify(ar));
  // 英雄不可重复
  const all = bp.concat(rp);
  if (new Set(all).size !== all.length) bad('出现重复英雄');
  return { s, log, ab, ar };
}

const pairs = [
  ['Gen.G Esports', 'Bilibili Gaming', 11],
  ['T1', 'Hanwha Life Esports', 23],
  ['Top Esports', 'Invictus Gaming', 37],
  ['KT Rolster', 'Dplus', 41],
];
pairs.forEach(([b, r, seed]) => {
  const g = playGame(b, r, seed);
  const ab = g.ab, ar = g.ar;
  console.log('\n== ' + b + ' vs ' + r);
  console.log('  蓝 ' + g.s.cur.history.filter((h) => h.type === 'pick' && h.side === 'blue').map((h) => h.id + '(' + ab[h.id] + ')').join(' '));
  console.log('  红 ' + g.s.cur.history.filter((h) => h.type === 'pick' && h.side === 'red').map((h) => h.id + '(' + ar[h.id] + ')').join(' '));
  const p1 = g.log.filter((l) => l.type === 'pick')[0];
  console.log('  第一手：' + p1.id + ' → ' + p1.why.join(' | '));
  const ban = g.log.filter((l) => l.type === 'ban')[0];
  console.log('  一 ban：' + ban.id + ' → ' + ban.why.join(' | '));
  // 体系落地：检查队伍是否拿到体系核心
  const style = window.StyleDB.styleOf(b);
  if (!g.s.cur.picks.blue.some((id) => style.star.indexOf(id) >= 0)) console.log('  NOTE ' + b + ' 没有拿到体系核心（' + style.cn + '）：' + style.star.slice(0, 6).join('/'));
});

console.log(fail ? '\nFAILED ' + fail : '\nALL OK');
process.exitCode = fail ? 1 : 0;
