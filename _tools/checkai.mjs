// 验证 AI 的「见招拆招」：给定敌方阵容，看推荐里有没有对应的解
import fs from 'fs';
import path from 'path';
const root = path.resolve(import.meta.dirname, '..');
const ctx = {};
function load(rel) {
  const code = fs.readFileSync(path.join(root, rel), 'utf8');
  new Function('window', code)(ctx);
}
['js/data/champions.js', 'js/data/champmeta.js', 'js/data/teams.js', 'js/data/photos.js',
 'js/data/players.js', 'js/data/prostats.js', 'js/core/rules.js', 'js/core/draft.js',
 'js/core/meta.js', 'js/core/analysis.js'].forEach(load);
const W = ctx;
const CH = W.CHAMPIONS;
const nameOf = {};
CH.forEach((c) => { nameOf[c.i] = c.t; nameOf[c.i.toLowerCase()] = c.t; });
const norm = {};
CH.forEach((c) => { norm[c.i.toLowerCase().replace(/[^a-z0-9]/g, '')] = c; });
function idOf(q) {
  const hit = norm[q.toLowerCase().replace(/[^a-z0-9]/g, '')];
  if (!hit) throw new Error('unknown champion: ' + q);
  return hit.i;
}

// 直接构造 series 状态，塞入敌方已选
function setup(enemyPicks) {
  const D = W.Draft;
  const s = D.newSeries({ mode: 'BO1', fearless: true, banCarry: false, timer: 0 });
  D.startGame(s, 'T1', 'Gen.G Esports');
  const g = s.cur;
  g.picks.red = enemyPicks.slice();
  // 走到第一次选人（前面是 6 个 ban）
  g.step = 6;
  return { s, g };
}

const cases = [
  { t: '敌方冲阵突脸（Camille/Vi/Ahri/KaiSa/Rakan）', e: ['Camille', 'Vi', 'Ahri', "KaiSa", 'Rakan'],
    want: ['Janna', 'Poppy', 'Taric', 'Lulu', 'Milio', 'Morgana'] },
  { t: '敌方消耗拉扯（Jayce/Nidalee/Zoe/Ezreal/Karma）', e: ['Jayce', 'Nidalee', 'Zoe', 'Ezreal', 'Karma'],
    want: ['Sivir', 'Soraka', 'Yuumi', 'Nami', 'Seraphine', 'Malphite', 'Amumu', 'Leona', 'Nautilus', 'Vi'] },
  { t: '敌方大肉前排（Ornn/Sejuani/Sion/Malphite/Braum）', e: ['Ornn', 'Sejuani', 'Sion', 'Malphite', 'Braum'],
    want: ['Vayne', 'KogMaw', 'Gwen', 'Fiora', 'Trundle', 'Camille'] },
  { t: '敌方强开团（Malphite/Orianna/Amumu/MissFortune/Leona）', e: ['Malphite', 'Orianna', 'Amumu', "MissFortune", 'Leona'],
    want: ['Janna', 'Poppy', 'Milio', 'Morgana', 'Taric', 'Braum'] },
];

let pass = 0;
const rnd = Math.random;
Math.random = () => 0.5; // 固定随机项，结果可复现
for (const c of cases) {
  const enemy = c.e.map(idOf);
  const { s } = setup(enemy);
  const top = W.Draft.suggest(s, 12).map((id) => id);
  const topNames = top.map((id) => nameOf[id] || id);
  const hit = top.filter((id) => c.want.some((w) => idOf(w) === id)).map((id) => nameOf[id] || id);
  const ok = hit.length >= 2;
  if (ok) pass++;
  console.log(`${ok ? '✅' : '❌'} ${c.t}`);
  console.log('   推荐: ' + topNames.join(' / '));
  console.log('   命中解: ' + (hit.join(' / ') || '（无）'));
}
console.log(`\n${pass}/${cases.length} 组见招拆招命中`);
Math.random = rnd;
if (pass < cases.length) process.exitCode = 1;
