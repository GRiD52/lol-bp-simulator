// 校验系列赛层面：B2/B3 的 ban 不能照抄 B1（全局 BP 不能公式化）
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
const AIBP = window.AIBP;
let fail = 0;
const bad = (m) => { console.log('FAIL ' + m); fail++; };

function playGame(s, seed) {
  let x = seed;
  Math.random = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
  while (!D.bpComplete(s)) {
    const st = D.curStep(s);
    const prof = st.side === 'blue' ? 'control' : 'tempo';
    const p = AIBP.plan(s, { profile: prof });
    if (!p || !p.id) { bad('AI 没选出 step=' + s.cur.step); break; }
    if (!D.commit(s, p.id)) { bad('commit 失败 ' + p.id); break; }
  }
  return s.cur;
}

const pairs = [['Gen.G Esports', 'Bilibili Gaming', 101], ['T1', 'Hanwha Life Esports', 202]];
pairs.forEach(([ta, tb, seed]) => {
  const s = D.newSeries({ mode: 'BO3', fearless: true, banCarry: false, timer: 0 });
  s.teams = { blue: ta, red: tb };
  D.startGame(s, ta, tb);
  const g1 = playGame(s, seed);
  const b1 = { blue: g1.bans.blue.slice(), red: g1.bans.red.slice() };
  D.finishGame(s, 'blue', null);

  // 败方选边：红方（输）选蓝，蓝方去红
  D.startGame(s, tb, ta);
  const g2 = playGame(s, seed + 7);
  const b2 = { blue: g2.bans.blue.slice(), red: g2.bans.red.slice() };

  console.log('\n== ' + ta + ' vs ' + tb + '（B1 蓝 ' + ta + '，B2 蓝 ' + tb + '）');
  console.log('  B1 蓝ban ' + b1.blue.join(','));
  console.log('  B1 红ban ' + b1.red.join(','));
  console.log('  B2 蓝ban ' + b2.blue.join(','));
  console.log('  B2 红ban ' + b2.red.join(','));

  // 同一支队伍连续两局在同一侧？这里 B1 的蓝 = B2 的红，所以按队伍对齐
  const teamA1 = b1.blue, teamA2 = b2.red; // ta 两局
  const teamB1 = b1.red, teamB2 = b2.blue; // tb 两局
  const diffA = teamA1.filter((x) => teamA2.indexOf(x) < 0).length;
  const diffB = teamB1.filter((x) => teamB2.indexOf(x) < 0).length;
  console.log('  换掉的 ban：' + ta + ' ' + diffA + ' 个，' + tb + ' ' + diffB + ' 个');
  if (diffA < 1) bad(ta + ' B2 完全照抄 B1 的 ban');
  if (diffB < 1) bad(tb + ' B2 完全照抄 B1 的 ban');

  // 全局 BP：B1 选过的英雄 B2 不能再选
  const picked1 = g1.picks.blue.concat(g1.picks.red);
  const picked2 = g2.picks.blue.concat(g2.picks.red);
  const dup = picked2.filter((x) => picked1.indexOf(x) >= 0);
  if (dup.length) bad('B2 重复选到了 B1 的英雄：' + dup.join(','));
  else console.log('  无畏征召 OK：B2 没有重复 B1 的选用英雄');

  // 无畏征召下，上一局胜方选过的英雄本来就已经进了全局池，不需要再 ban
  const winSide1 = 'blue';
  const keyChamps = g1.picks[winSide1].slice(0, 3);
  const stillOpen = keyChamps.filter((c) => picked1.indexOf(c) < 0);
  console.log('  B1 胜方前三手 ' + keyChamps.join(',') + '（已进全局池，B2 无需再 ban）');
  if (stillOpen.length) console.log('  NOTE 仍在英雄池里的胜方关键手：' + stillOpen.join(','));

  // 同一套 ban 不要照抄：每个队 B2 至少换掉 1 个；五个全一样才算公式化
  const repA = teamA1.filter((x) => teamA2.indexOf(x) >= 0).length;
  const repB = teamB1.filter((x) => teamB2.indexOf(x) >= 0).length;
  console.log('  保留的 ban：' + ta + ' ' + repA + ' 个，' + tb + ' ' + repB + ' 个');
  if (repA >= 5) bad(ta + ' B2 五个 ban 和 B1 一模一样');
  if (repB >= 5) bad(tb + ' B2 五个 ban 和 B1 一模一样');
});

console.log(fail ? '\nFAILED ' + fail : '\nALL OK');
process.exitCode = fail ? 1 : 0;
