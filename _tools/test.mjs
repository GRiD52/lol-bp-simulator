// 端到端校验：数据完整性 + 无头跑一场完整 BP / 分析 / 模拟
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const win = {};
const ctx = vm.createContext({ window: win, console, Math, JSON, Date });
function load(rel) {
  const code = fs.readFileSync(path.join(root, rel), 'utf8');
  vm.runInContext(code, ctx, { filename: rel });
}
['js/data/champions.js', 'js/data/champmeta.js', 'js/data/teams.js', 'js/data/photos.js', 'js/data/players.js',
  'js/data/prostats.js', 'js/data/profiles.js', 'js/core/rules.js', 'js/core/style.js', 'js/core/meta.js',
  'js/core/draft.js', 'js/core/analysis.js', 'js/core/sim.js'].forEach(load);

const W = win;
let errors = 0;
const err = (m) => { console.log('  ✗ ' + m); errors++; };
const ok = (m) => console.log('  ✓ ' + m);

console.log('\n=== 1. 基础数据 ===');
const CH = W.CHAMPIONS;
const META = W.CHAMP_META;
const TEAMS = W.TEAMS;
const PL = W.PLAYERS;
ok('英雄 ' + CH.length + ' 条 / 战队 ' + TEAMS.length + ' 支 / 选手 ' + PL.length + ' 人 / 版本 ' + W.PATCH_VERSION);

const ids = new Set(CH.map((c) => c.i));
if (ids.size !== CH.length) err('英雄 ID 有重复');
let metaMiss = 0;
CH.forEach((c) => { if (!META[c.i]) { metaMiss++; err('缺少英雄元数据：' + c.i); } });
Object.keys(META).forEach((k) => { if (!ids.has(k)) err('元数据里有不存在的英雄：' + k); });
ok('英雄元数据覆盖 ' + (CH.length - metaMiss) + '/' + CH.length);

console.log('\n=== 2. 选手数据 ===');
let sigBad = 0;
PL.forEach((p) => {
  (p.s || []).forEach((id) => { if (!ids.has(id)) { err('选手 ' + p.n + ' 的擅长英雄不存在：' + id); sigBad++; } });
  ['a', 'd', 'f', 'b', 'p'].forEach((k) => {
    if (!(p[k] >= 1 && p[k] <= 99)) err('选手 ' + p.n + ' 的 ' + k + ' 越界：' + p[k]);
  });
});
ok('擅长英雄引用全部有效' + (sigBad ? '' : '（' + PL.reduce((s, p) => s + p.s.length, 0) + ' 条）'));

TEAMS.forEach((t) => {
  const list = PL.filter((p) => p.t === t.t);
  const starters = list.filter((p) => !p.sub);
  const roles = ['top', 'jg', 'mid', 'bot', 'sup'];
  const missing = roles.filter((r) => !starters.some((p) => p.r === r));
  if (missing.length) err(t.t + ' 缺首发位置：' + missing.join(','));
  const dup = roles.filter((r) => starters.filter((p) => p.r === r).length > 1);
  if (dup.length) err(t.t + ' 首发位置重复：' + dup.join(','));
});
ok('24 队首发 5 人齐全且位置唯一');

console.log('\n=== 3. 资源文件 ===');
const missing = [];
CH.forEach((c) => {
  ['assets/champ/tile/' + c.i + '.png', 'assets/champ/splash/' + c.i + '.jpg'].forEach((f) => {
    if (!fs.existsSync(path.join(root, f))) missing.push(f);
  });
});
if (missing.length) err('缺英雄美术 ' + missing.length + ' 个，例：' + missing.slice(0, 3).join(', '));
else ok('英雄美术 346 个文件齐全');

const photoEntries = Object.entries(W.PHOTOS);
let pMiss = 0;
photoEntries.forEach(([k, v]) => { if (!fs.existsSync(path.join(root, v))) { pMiss++; err('缺选手头像文件：' + v); } });
ok('选手头像 ' + (photoEntries.length - pMiss) + '/' + photoEntries.length + ' 文件存在');

const logoEntries = Object.entries(W.TEAM_LOGOS);
let lMiss = 0;
logoEntries.forEach(([k, v]) => { if (!fs.existsSync(path.join(root, v))) { lMiss++; err('缺战队 logo：' + v); } });
ok('战队 logo ' + (logoEntries.length - lMiss) + '/' + logoEntries.length + ' 文件存在（其余用字母兜底）');

console.log('\n=== 4. 无头跑一场 BO5（含无畏征召） ===');
const R = W.RULES, D = W.Draft, A = W.Analyze, S = W.Sim;
const s = D.newSeries({ mode: 'BO5', fearless: true, timer: 0 });
D.startGame(s, 'T1', 'Gen.G Esports');

let guard = 0;
while (D.curStep(s) && guard++ < 100) {
  const id = D.aiChoose(s);
  if (!id) break;
  if (!D.available(s, id)) { err('AI 选择了不可用英雄 ' + id); break; }
  D.commit(s, id);
}
if (guard >= 100) err('BP 死循环');
const g = s.cur;
ok('BP 完成，蓝方 picks=' + g.picks.blue.length + ' bans=' + g.bans.blue.length +
  '+ 红方 picks=' + g.picks.red.length + ' bans=' + g.bans.red.length);

const assignB = A.autoAssign(g.picks.blue);
const assignR = A.autoAssign(g.picks.red);
const match = {
  blue: { team: g.blue, assign: assignB, players: {} },
  red: { team: g.red, assign: assignR, players: {} },
};
['blue', 'red'].forEach((sd) => R.ROLES.forEach((r) => { match[sd].players[r] = D.playerOf(match[sd].team, r); }));

const an = A.analyze(match);
ok('分析：蓝 ' + an.prob.blue + '% vs 红 ' + an.prob.red + '%（综合 ' + an.total.blue + ' / ' + an.total.red + '）');
ok('维度 ' + an.dims.length + ' 项，分路 ' + an.lanes.length + ' 条，点评 ' + an.notes.length + ' 条');
console.log('  预测：' + an.verdict.text);

const res = S.run(match, an, { seed: 12345 });
ok('模拟完成：' + res.duration + '，' + (res.winner === 'blue' ? '蓝方' : '红方') + '胜，比分 ' + res.kills.blue + ':' + res.kills.red);
ok('解说 ' + res.events.length + ' 条，MVP ' + res.mvp.n + '（' + res.mvp.champ + ' ' + res.mvp.k + '/' + res.mvp.d + '/' + res.mvp.a + '）');
const times = res.events.map((e) => e.t);
console.log('  首条：' + res.events[0].t + ' ' + res.events[0].text.slice(0, 40) + '…');
console.log('  末条：' + res.events[res.events.length - 1].t + ' ' + res.events[res.events.length - 1].text);

// 新增：走势图 / 资源 / 评分 / 网友评论
const tl = res.timeline || [];
ok('时间轴 ' + tl.length + ' 个采样点，末点经济差 ' + (tl.length ? tl[tl.length - 1].g.toFixed(1) : '-'));
const objs = res.objectives || [];
const kinds = {};
objs.forEach((o) => { kinds[o.kind] = (kinds[o.kind] || 0) + 1; });
ok('资源事件 ' + objs.length + ' 个（' + Object.keys(kinds).map((k) => k + '=' + kinds[k]).join(' ') + '）');
['grub', 'herald', 'dragon', 'baron'].forEach((k) => { if (!kinds[k]) err('缺少资源事件 ' + k); });
if ((res.souls.blue || res.souls.red) && !kinds.soul) err('有龙魂却缺少龙魂事件');

const allStats = res.stats.blue.concat(res.stats.red);
const badRating = allStats.filter((s) => !(s.rating >= 3 && s.rating <= 9.9) || !/^[SABCD]$/.test(s.grade));
if (badRating.length) err('评分/等级异常：' + badRating.map((s) => s.n + ' ' + s.rating + ' ' + s.grade).join(', '));
ok('10 名选手评分 ' + allStats.map((s) => s.grade).join('') + '（最低 ' + Math.min.apply(null, allStats.map((s) => s.rating)).toFixed(1) + '）');

const cms = res.comments || [];
if (cms.length !== 10) err('网友评论应覆盖 10 名选手，实际 ' + cms.length);
let cCount = 0, cFlame = 0, cPraise = 0, cBadTone = 0;
cms.forEach((p) => {
  if (!p.comments || !p.comments.length) err(p.n + ' 没有评论');
  p.comments.forEach((c) => {
    cCount++;
    if (c.tone === 'flame') cFlame++;
    else if (c.tone === 'praise') cPraise++;
    else cBadTone++;
    if (!c.u || !c.text || !(c.likes >= 0)) err('评论字段缺失：' + p.n);
  });
});
if (cBadTone) err('存在未知 tone 的评论 ' + cBadTone + ' 条');
ok('网友评论 ' + cCount + ' 条（好评 ' + cPraise + ' / 黑榜 ' + cFlame + '）');

// 事件时间必须单调
let bad = 0;
for (let i = 1; i < times.length; i++) {
  const a = times[i - 1].split(':').reduce((x, y) => x * 60 + +y, 0);
  const b = times[i].split(':').reduce((x, y) => x * 60 + +y, 0);
  if (b < a) bad++;
}
if (bad) err('解说时间轴有 ' + bad + ' 处倒流'); else ok('时间轴单调递增');

console.log('\n=== 5. 无畏征召继承 ===');
D.finishGame(s, 'blue');
D.startGame(s, g.red, g.blue);
const locked = s.lockedPicks.length;
ok('第 2 局开始，全局池已锁定 ' + locked + ' 个英雄');
const old = g.picks.blue.concat(g.picks.red)[0];
if (D.available(s, old)) err('被选过的 ' + old + ' 仍然可选'); else ok('已选用英雄 ' + old + ' 正确禁用');


console.log('\n=== 6. 完整 BO3：换边 + 按队伍计分 ===');
const s3 = D.newSeries({ mode: 'BO3', fearless: true, timer: 0 });
let TB = 'Bilibili Gaming', TR = 'Top Esports';
D.startGame(s3, TB, TR);
const winners = [];
for (let gi = 0; gi < 3 && !s3.over; gi++) {
  let gd = 0;
  while (D.curStep(s3) && gd++ < 100) { const id = D.aiChoose(s3); if (!id) break; D.commit(s3, id); }
  const gg = s3.cur;
  const mm = {
    blue: { team: gg.blue, assign: A.autoAssign(gg.picks.blue), players: {} },
    red: { team: gg.red, assign: A.autoAssign(gg.picks.red), players: {} },
  };
  ['blue', 'red'].forEach((sd) => R.ROLES.forEach((r) => { mm[sd].players[r] = D.playerOf(mm[sd].team, r); mm[sd].bans = gg.bans[sd]; }));
  const an3 = A.analyze(mm);
  const r3 = S.run(mm, an3, { seed: 1000 + gi });
  D.finishGame(s3, r3.winner);
  winners.push(mm[r3.winner].team);
  const loserTeam = r3.winner === 'blue' ? mm.red.team : mm.blue.team;
  const winTeam = r3.winner === 'blue' ? mm.blue.team : mm.red.team;
  if (!s3.over) D.startGame(s3, loserTeam, winTeam);
}
ok('BO3 打了 ' + s3.games.length + ' 局，胜者依次：' + winners.join(' → '));
if (!s3.over) err('BO3 未结束');
if (typeof s3.winner !== 'string' || !winners.includes(s3.winner)) err('系列赛 winner 不是队伍名：' + s3.winner);
else ok('系列赛冠军 = ' + s3.winner);
const keys = Object.keys(s3.score);
if (keys.some((k) => k === 'blue' || k === 'red')) err('比分仍按边统计：' + JSON.stringify(s3.score));
else ok('比分按队伍记录：' + JSON.stringify(s3.score));
const total = Object.values(s3.score).reduce((a, b) => a + b, 0);
if (total !== s3.games.length) err('比分总和 ' + total + ' ≠ 局数 ' + s3.games.length);
else ok('比分总和与局数一致');
if ((s3.score[s3.winner] || 0) !== 2) err('BO3 冠军应为 2 胜');
else ok('冠军拿到 2 胜');

console.log('\n=== 7. 英雄分路解析 ===');
const CU = W.ChampUtil;
const letterOk = ['t', 'j', 'm', 'b', 's'];
let posBad = 0;
CH.forEach((c) => {
  const pos = CU.champPos(c.i);
  if (!pos.length) { err('英雄没有分路：' + c.i); posBad++; return; }
  pos.forEach((p) => { if (letterOk.indexOf(p) < 0) { err('英雄 ' + c.i + ' 分路字母异常：' + p); posBad++; } });
  if (pos.indexOf(',') >= 0) err('英雄 ' + c.i + ' 分路里混进了逗号');
});
if (!posBad) ok('全部 ' + CH.length + ' 个英雄的分路都解析成了字母');
const sk = CU.champPos('Skarner');
if (sk.join(',') !== 'j,t') err('斯卡纳应是打野/上单，实际 ' + sk.join(','));
else if (!CU.fits('Skarner', 'jg') || !CU.fits('Skarner', 'top') || CU.fits('Skarner', 'mid')) err('斯卡纳分路判定不对');
else ok('多分路英雄解析正确（斯卡纳 = 打野/上单）');
let proBad = 0;
Object.keys(W.PRO_ROLES || {}).forEach((id) => {
  const rs = W.PRO_ROLES[id].roles || {};
  Object.keys(rs).forEach((k) => { if (R.ROLES.indexOf(k) < 0) { err('英雄 ' + id + ' 有非法分路：' + k); proBad++; } });
});
if (!proBad) ok('职业分路数据里的位置全部合法（' + Object.keys(W.PRO_ROLES || {}).length + ' 个英雄）');
const neeko = W.PRO_ROLES && W.PRO_ROLES.Neeko;
if (neeko && Object.keys(neeko.roles).join(',') === 'sup') ok('妮蔻只记录到辅助位（职业赛 2026 没打过中单）');
else if (neeko) err('妮蔻的分路不是只有辅助：' + Object.keys(neeko.roles).join(','));

console.log('\n' + (errors ? '❌ ' + errors + ' 个问题' : '✅ 全部通过'));
process.exit(errors ? 1 : 0);
