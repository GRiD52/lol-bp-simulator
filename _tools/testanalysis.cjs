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

function teamOf(name) {
  return TEAMS.find((t) => t.t === name) || TEAMS[0];
}
function playersOf(team) {
  const m = {};
  R.ROLES.forEach((r) => { m[r] = D.playerOf(team, r); });
  return m;
}
function mkMatch(blueName, redName, bluePicks, redPicks, blueAssign, redAssign) {
  const bt = teamOf(blueName), rt = teamOf(redName);
  return {
    blue: { team: bt.t, assign: blueAssign || A.autoAssign(bluePicks), players: playersOf(bt.t) },
    red: { team: rt.t, assign: redAssign || A.autoAssign(redPicks), players: playersOf(rt.t) },
  };
}
function show(title, m) {
  const an = A.analyze(m);
  console.log('\n=== ' + title + ' ===');
  console.log('prob', an.prob.blue + '% / ' + an.prob.red + '%  paper', an.paper.blue, an.paper.red, ' rating', an.rating.blue, an.rating.red, ' bpShare', an.bpShare + '%');
  console.log('arch blue', an.arch.blue.map((a) => a.cn + a.score).join(' '), '| red', an.arch.red.map((a) => a.cn + a.score).join(' '));
  console.log('lanes', an.lanes.map((l) => R.ROLE_CN[l.role] + ' ' + Math.round(l.diff)).join(' '));
  console.log('verdict:', an.verdict.text.slice(0, 260));
  an.notes.slice(0, 8).forEach((n) => console.log(' [' + n.side + '/' + n.t + '] ' + n.text.slice(0, 110)));
  return an;
}

// 1) 正统 vs 乱选
show('T1 正统 vs GenG 正统',
  mkMatch('T1', 'Gen.G Esports',
    ['KSante', 'Vi', 'Ahri', 'Xayah', 'Rakan'],
    ['Gnar', 'Sejuani', 'Orianna', 'Jinx', 'Lulu']));

// 2) 典型不合理 BP：无前排 4 输出
show('不合理：T1 五脆皮 vs GenG 完整体系',
  mkMatch('T1', 'Gen.G Esports',
    ['Jayce', 'Nidalee', 'Zed', 'Ezreal', 'Lux'],
    ['KSante', 'Sejuani', 'Orianna', 'Jinx', 'Rakan']));

// 3) 塞拉斯偷牛头
show('塞拉斯克牛头',
  mkMatch('T1', 'Gen.G Esports',
    ['KSante', 'Sejuani', 'Sylas', 'Jinx', 'Rakan'],
    ['Gnar', 'Vi', 'Orianna', 'Xayah', 'Alistar']));

// 4) 经典组合：EZ 卡尔玛 / 卢米
show('EZ 卡尔玛 vs 卢锡安 米利欧',
  mkMatch('T1', 'Gen.G Esports',
    ['KSante', 'Vi', 'Orianna', 'Ezreal', 'Karma'],
    ['Gnar', 'Sejuani', 'Ahri', 'Lucian', 'Milio']));
