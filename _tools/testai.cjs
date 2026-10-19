// AI 自测：跑满一整场 BP（AI 对 AI），检查位置覆盖、无重复、并输出体系/评分
const path = require('path');
const root = path.join(__dirname, '..');
global.window = {};
const load = (p) => { try { require(path.join(root, p)); } catch (e) { console.error('load fail', p, e.message); } };
load('js/data/champions.js');
load('js/data/champmeta.js');
load('js/data/teams.js');
load('js/data/players.js');
load('js/data/prostats.js');
load('js/core/rules.js');
load('js/core/meta.js');
load('js/core/draft.js');
load('js/core/analysis.js');

const W = window;
const R = W.RULES;
const D = W.Draft;
const A = W.Analyze;
const TEAMS = W.TEAMS;
const CN = {};
W.CHAMPIONS.forEach((c) => { CN[c.i] = c.t; });

function names(ids) { return ids.map((id) => CN[id] || id).join(' / '); }

let problems = 0;
function fail(msg) { problems++; console.log('  !! ' + msg); }

function draftOnce(bt, rt, seed) {
  const s = D.newSeries({ mode: 'BO3', fearless: true, banCarry: false });
  D.startGame(s, bt, rt);
  let guard = 0;
  while (!D.bpComplete(s) && guard++ < 40) {
    const st = D.curStep(s);
    const id = D.aiChoose(s);
    if (!id) { fail('AI 无子可落 step ' + s.cur.step); break; }
    D.commit(s, id);
  }
  return s.cur;
}

function checkRoles(g, side) {
  const picked = g.picks[side];
  if (picked.length !== 5) fail(side + ' 只选了 ' + picked.length + ' 个');
  const uniq = new Set(picked);
  if (uniq.size !== picked.length) fail(side + ' 选人重复');
  // 自顶向下贪心分配，必须能 5 位置全覆盖
  const used = [];
  const assign = {};
  const tryAssign = (i) => {
    if (i === 5) return true;
    for (let r = 0; r < R.ROLES.length; r++) {
      const role = R.ROLES[r];
      if (used[r]) continue;
      if (!D.fits(picked[i], role)) continue;
      used[r] = true; assign[role] = picked[i];
      if (tryAssign(i + 1)) return true;
      used[r] = false;
    }
    return false;
  };
  if (!tryAssign(0)) fail(side + ' 的 5 个英雄无法分配满 5 个位置：' + names(picked));
  return assign;
}

function analyzePair(bt, rt, g) {
  const ba = checkRoles(g, 'blue') || A.autoAssign(g.picks.blue);
  const ra = checkRoles(g, 'red') || A.autoAssign(g.picks.red);
  const m = {
    blue: { team: bt, assign: ba, players: null },
    red: { team: rt, assign: ra, players: null },
  };
  R.ROLES.forEach((r) => {
    m.blue.players = m.blue.players || {};
    m.red.players = m.red.players || {};
    m.blue.players[r] = D.playerOf(bt, r);
    m.red.players[r] = D.playerOf(rt, r);
  });
  return A.analyze(m);
}

const pairs = [
  ['T1', 'Gen.G Esports'],
  ['Bilibili Gaming', 'JD Gaming'],
  ['Hanwha Life Esports', 'Weibo Gaming'],
  ['Top Esports', 'KT Rolster'],
  ['G2 Esports', 'Fnatic'],
  ['Anyones Legend', 'Dplus KIA'],
];

pairs.forEach(([b, r]) => {
  const bt = (TEAMS.find((t) => t.t === b) || TEAMS[0]).t;
  const rt = (TEAMS.find((t) => t.t === r) || TEAMS[1]).t;
  const g = draftOnce(bt, rt);
  console.log('\n=== ' + bt + ' (蓝) vs ' + rt + ' (红) ===');
  console.log('ban 蓝 ' + names(g.bans.blue));
  console.log('ban 红 ' + names(g.bans.red));
  console.log('pick 蓝 ' + names(g.picks.blue));
  console.log('pick 红 ' + names(g.picks.red));
  const an = analyzePair(bt, rt, g);
  console.log('prob ' + an.prob.blue + '% / ' + an.prob.red + '%  rating ' + an.rating.blue + ' / ' + an.rating.red);
  console.log('arch 蓝 ' + an.arch.blue.slice(0, 2).map((x) => x.cn + x.score).join(' ') + ' | 红 ' + an.arch.red.slice(0, 2).map((x) => x.cn + x.score).join(' '));
  console.log('notes:');
  an.notes.slice(0, 6).forEach((n) => console.log('  [' + n.side + '/' + n.t + '] ' + n.text.slice(0, 100)));
});

// 无畏征召：同一系列 3 局内，前一局选用过的英雄不能再出现
console.log('\n=== 无畏征召连续性自测 ===');
{
  const bt = 'T1', rt = 'Gen.G Esports';
  const s = D.newSeries({ mode: 'BO3', fearless: true, banCarry: false });
  D.startGame(s, bt, rt);
  const seen = new Set();
  for (let game = 1; game <= 3; game++) {
    if (game > 1) D.startGame(s, game % 2 === 0 ? rt : bt, game % 2 === 0 ? bt : rt);
    let guard = 0;
    while (!D.bpComplete(s) && guard++ < 40) {
      const id = D.aiChoose(s);
      if (!id) break;
      D.commit(s, id);
    }
    const cur = s.cur;
    cur.picks.blue.concat(cur.picks.red).forEach((id) => {
      if (seen.has(id)) fail('第 ' + game + ' 局重复选用了全局池英雄 ' + id);
      seen.add(id);
    });
    D.finishGame(s, 'blue', null);
  }
  console.log('3 局共选用 ' + seen.size + ' 个不重复英雄，锁池 ' + s.lockedPicks.length);
}

console.log(problems ? '\nAI PROBLEMS: ' + problems : '\nAI OK');
