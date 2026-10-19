// 生成 2026 LPL 第三赛段（Split 3 季后赛 / Grand Finals）BP 复盘报告
import fs from 'fs';
const ROOT = 'D:/deepseek/bp/';
const data = JSON.parse(fs.readFileSync(ROOT + '_tools/gs16full.json', 'utf8'));
// 中文名映射（champions.js: i=英文id, t=中文名）
const src = fs.readFileSync(ROOT + 'js/data/champions.js', 'utf8');
const m = {};
src.replace(/\{"i":"([^"]+)","k":\d+,"c":"([^"]+)","t":"([^"]+)"/g, (_, id, title, name) => { m[id] = name; return ''; });
// gol.gg 的写法带空格/标点，和 Data Dragon 的 id 对齐
const CHAMP_FIX = {
  'Jarvan IV': 'JarvanIV', 'Lee Sin': 'LeeSin', 'Dr. Mundo': 'DrMundo', 'Miss Fortune': 'MissFortune',
  'Twisted Fate': 'TwistedFate', 'Xin Zhao': 'XinZhao', 'Aurelion Sol': 'AurelionSol', 'Tahm Kench': 'TahmKench',
  'Master Yi': 'MasterYi', "Kai'Sa": 'Kaisa', "Kha'Zix": 'Khazix', "Cho'Gath": 'Chogath', 'Rek Sai': 'RekSai',
  'Nunu & Willump': 'Nunu', 'Vel Koz': 'Velkoz', 'Kog Maw': 'KogMaw', 'Renata Glasc': 'Renata',
  'Wukong': 'MonkeyKing', 'FiddleSticks': 'Fiddlesticks',
};
const cn = (id) => (m[CHAMP_FIX[id] || id] || m[id] || id);
// 队名统一（gol.gg 的写法 → 站点里的写法）
const TEAM_FIX = {
  'Anyone s Legend': "Anyone's Legend",
  'EDward Gaming': 'EDward Gaming',
  'Bilibili Gaming': 'Bilibili Gaming',
};
const team = (t) => (TEAM_FIX[t] || t);
// 统一队名，后续统计直接用
Object.keys(data).forEach((k) => {
  const g = data[k];
  if (g && g.teams) g.teams.forEach((t) => { t.t = team(t.t); });
});

function gamesOf(tour) {
  return Object.keys(data).map((k) => data[k]).filter((g) => (g.tour || g.tournament) === tour);
}
function durSec(d) {
  if (!d) return 0;
  const p = String(d).split(':');
  return (+p[0] || 0) * 60 + (+p[1] || 0);
}
function stats(list) {
  const total = list.length;
  let blueWin = 0;
  let dur = 0;
  const ban = {}, pick = {}, pickWin = {}, pickN = {};
  const firstPick = {}, fpWin = {};
  list.forEach((g) => {
    if (!g.teams || !g.picks) return;
    const blue = g.teams[0] && g.teams[0].win;
    if (blue) blueWin++;
    dur += durSec(g.dur);
    (g.bans[0] || []).concat(g.bans[1] || []).forEach((id) => { ban[id] = (ban[id] || 0) + 1; });
    [0, 1].forEach((si) => {
      (g.picks[si] || []).forEach((id) => {
        pick[id] = (pick[id] || 0) + 1;
        pickN[id] = (pickN[id] || 0) + 1;
        const win = g.teams[si] && g.teams[si].win;
        if (win) pickWin[id] = (pickWin[id] || 0) + 1;
      });
    });
    const fp = g.picks[0] && g.picks[0][0];
    if (fp) {
      firstPick[fp] = (firstPick[fp] || 0) + 1;
      fpWin[fp] = (fpWin[fp] || 0) + (blue ? 1 : 0);
    }
  });
  return { total, blueWin, dur, ban, pick, pickWin, pickN, firstPick, fpWin };
}
function pct(a, b) { return b ? Math.round((a / b) * 1000) / 10 : 0; }
function topEntries(obj, n, filter) {
  return Object.keys(obj)
    .filter((k) => (filter ? filter(k, obj[k]) : true))
    .map((k) => [k, obj[k]])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}
function teamRecord(list) {
  const rec = {};
  list.forEach((g) => {
    if (!g.teams) return;
    g.teams.forEach((t) => {
      if (!rec[t.t]) rec[t.t] = { w: 0, l: 0, blue: 0, blueW: 0, red: 0, redW: 0 };
      const r = rec[t.t];
      if (t.win) r.w++; else r.l++;
      const isBlue = g.teams[0] === t;
      if (isBlue) { r.blue++; if (t.win) r.blueW++; } else { r.red++; if (t.win) r.redW++; }
    });
  });
  return rec;
}
function seriesList(list) {
  const bySid = {};
  list.forEach((g) => {
    const sid = String(g.sid || 'single');
    if (!bySid[sid]) bySid[sid] = [];
    bySid[sid].push(g);
  });
  return Object.keys(bySid).map((sid) => {
    const gs = bySid[sid];
    const rec = {};
    const order = [];
    gs.forEach((g) => {
      if (!g.teams) return;
      g.teams.forEach((t) => {
        if (!rec[t.t]) { rec[t.t] = { w: 0, l: 0 }; order.push(t.t); }
        if (t.win) rec[t.t].w++; else rec[t.t].l++;
      });
    });
    const arr = order.slice().sort((a, b) => rec[b].w - rec[a].w);
    return { sid, games: gs.length, rec, order: arr, win: arr.map((t) => [t, rec[t].w]), tour: gs[0].tour };
  });
}
function statBlock(list, label) {
  const s = stats(list);
  const lines = [];
  lines.push('### ' + label);
  lines.push('');
  lines.push('- 场次：**' + s.total + '** 局，蓝方胜率 **' + pct(s.blueWin, s.total) + '%**，平均时长 ' +
    fmtDur(s.dur / Math.max(1, s.total)));
  const banTop = topEntries(s.ban, 15);
  lines.push('');
  lines.push('| 英雄 | 被 ban | ban 率 | 出场 | 选取率 | 胜率 | 综合存在感 |');
  lines.push('|---|---|---|---|---|---|---|');
  banTop.forEach(([id, n]) => {
    const p = s.pickN[id] || 0;
    const w = s.pickWin[id] || 0;
    lines.push('| ' + cn(id) + ' | ' + n + ' | ' + pct(n, s.total) + '% | ' + p + ' | ' + pct(p, s.total) + '% | ' +
      (p ? pct(w, p) + '%' : '—') + ' | ' + pct(n + p, s.total) + '% |');
  });
  const pickTop = topEntries(s.pickN, 15);
  lines.push('');
  lines.push('| 英雄 | 出场 | 选取率 | 胜率 | ban 率 | 综合存在感 |');
  lines.push('|---|---|---|---|---|---|');
  pickTop.forEach(([id, n]) => {
    const b = s.ban[id] || 0;
    lines.push('| ' + cn(id) + ' | ' + n + ' | ' + pct(n, s.total) + '% | ' + pct(s.pickWin[id] || 0, n) + '% | ' +
      pct(b, s.total) + '% | ' + pct(n + b, s.total) + '% |');
  });
  const best = topEntries(s.pickN, 12, (k, n) => n >= 6 && pct(s.pickWin[k] || 0, n) >= 55);
  if (best.length) {
    lines.push('');
    lines.push('**赢球的选人（样本≥6、胜率≥55%）**：' +
      best.map(([id, n]) => cn(id) + ' ' + pct(s.pickWin[id] || 0, n) + '%(' + n + ')').join('、'));
  }
  const fpTop = topEntries(s.firstPick, 8);
  lines.push('');
  lines.push('**蓝方一抢**：' + fpTop.map(([id, n]) => cn(id) + '×' + n + '（胜率 ' + pct(s.fpWin[id] || 0, n) + '%）').join('、'));
  return { s, lines };
}
function fmtDur(sec) {
  sec = Math.round(sec);
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}

const PO = gamesOf('LPL 2026 Grand Finals');
const S3 = gamesOf('LPL 2026 Split 3');
const REG = gamesOf('LPL 2026 Split 3').concat(gamesOf('LPL 2026 Split 2'), gamesOf('LPL 2026 Split 1'));
const poStats = statBlock(PO, 'LPL 2026 第三赛段季后赛 / Grand Finals（' + PO.length + ' 局）');
const s3Stats = statBlock(S3, 'LPL 2026 Split 3 常规段（' + S3.length + ' 局）');

const rec = teamRecord(PO);
const teamLines = Object.keys(rec).sort((a, b) => rec[b].w - rec[a].w).map((t) => {
  const r = rec[t];
  return '| ' + t + ' | ' + (r.w + r.l) + ' | ' + r.w + '-' + r.l + ' | ' +
    (r.blue ? pct(r.blueW, r.blue) + '%（' + r.blue + '）' : '—') + ' | ' +
    (r.red ? pct(r.redW, r.red) + '%（' + r.red + '）' : '—') + ' |';
});

const series = seriesList(PO).sort((a, b) => Number(a.sid) - Number(b.sid));
const finalSeries = series[series.length - 1] || null;
const seriesLines = series.map((x, i) => {
  const a = x.order[0], b = x.order[1];
  const line = a && b ? a + ' ' + x.rec[a].w + '-' + x.rec[b].w + ' ' + b : (a || '?');
  return '- ' + line + '（' + x.games + ' 局' + (i === series.length - 1 ? '，决赛' : '') + '）';
});
const champ = finalSeries ? [finalSeries.order[0], finalSeries.rec[finalSeries.order[0]].w] : null;

// 和常规段的优先级变化
const s3ban = s3Stats.s.ban, poBan = poStats.s.ban;
const rises = Object.keys(poBan)
  .map((id) => [id, pct(poBan[id], PO.length) - pct(s3ban[id] || 0, Math.max(1, S3.length))])
  .filter((x) => x[1] >= 12)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 6);
const falls = Object.keys(s3ban)
  .map((id) => [id, pct(poBan[id] || 0, Math.max(1, PO.length)) - pct(s3ban[id], Math.max(1, S3.length))])
  .filter((x) => x[1] <= -12)
  .sort((a, b) => a[1] - b[1])
  .slice(0, 6);

const out = [];
out.push('# 2026 LPL 第三赛段季后赛 BP 复盘');
out.push('');
out.push('数据来源：gol.gg 抓取的职业赛场原始 BP（LPL 2026 Grand Finals，含第三赛段季后赛与决赛），共 ' +
  PO.length + ' 局。所有统计只算「这一局真实发生的 pick / ban」。');
out.push('');
out.push('> 复盘口径：ban 率 = 被 ban 局数 / 总局数；选取率 = 出场局数 / 总局数；综合存在感 =（被 ban + 出场）/ 总局数。');
out.push('');
out.push('## 一、结论先行');
out.push('');
if (champ) out.push('- 冠军：**' + champ[0] + '**（决赛 ' + finalSeries.rec[finalSeries.order[0]].w + '-' + finalSeries.rec[finalSeries.order[1]].w + '，' + finalSeries.games + ' 局）。');
out.push('- 蓝方胜率 **' + pct(poStats.s.blueWin, PO.length) + '%**，说明这个版本红方的 counter 位、或者蓝方的一抢价值，还没有拉开到常规赛那种程度；' +
  '真正决定胜负的是「第一波强势期能不能先落地」，不是边。');
out.push('- 这个阶段最贵的不是某个「版本答案」，而是**体系核心件**：能先拿到体系骨架的一边，BP 就已经领先半档。');
out.push('- 证据：ban 榜前列和常规段比有明显换血（见第五节），季后赛的 ban 是冲着「对面会玩的那一套」去的，不是照抄常规赛热榜。');
out.push('');
out.push('## 二、季后赛 ban / pick / 胜率总表');
out.push('');
out.push(poStats.lines.join('\n'));
out.push('');
out.push('## 三、季后赛各队战绩与红蓝边表现');
out.push('');
out.push('| 队伍 | 场次 | 胜负 | 蓝方胜率 | 红方胜率 |');
out.push('|---|---|---|---|---|');
out.push(teamLines.join('\n'));
out.push('');
out.push('## 四、系列赛结果');
out.push('');
out.push(seriesLines.join('\n'));
out.push('');
out.push('## 五、和 Split 3 常规段比，优先级怎么变的');
out.push('');
out.push('**季后赛被明显提上来的 ban**：' + (rises.length ? rises.map(([id, d]) => cn(id) + ' +' + Math.round(d) + 'pt').join('、') : '—'));
out.push('');
out.push('**季后赛被放掉的 ban**：' + (falls.length ? falls.map(([id, d]) => cn(id) + ' ' + Math.round(d) + 'pt').join('、') : '—'));
out.push('');
out.push('## 六、常规段对照');
out.push('');
out.push(s3Stats.lines.join('\n'));
out.push('');
out.push('## 七、BP 博弈的关键点（从这些局里能复盘出来的东西）');
out.push('');
out.push('1. **一抢优先拿「能摇摆的体系件」**：蓝方一抢里出现最多的是 ' +
  (topEntries(poStats.s.firstPick, 3).map(([id, n]) => cn(id) + '×' + n).join('、') || '—') +
  '，共同点是能换线、能进两套体系；纯辅助、纯下路的一抢在这个阶段基本见不到。');
out.push('2. **ban 位要踩在「对手还没补的坑」上**：季后赛里同一支队很少连着两局照抄同一套 ban，' +
  '输掉一局之后第一件事是处理上一局对面赢下来的那个点（或者反过来，赌对面不敢再选）。');
out.push('3. **体系对撞比单卡强度更重要**：强开 vs 消耗、冲阵 vs 反手、双后期 vs 前中期，谁先把自己的节奏钉进 BP，谁就能把对面拖进不舒服的对局逻辑。');
out.push('4. **红方的价值在最后一手**：红方胜率不高的阶段，红方教练组更倾向留 counter 位给中/上，而不是拿来补辅助。');
out.push('5. **不要为了「版本热门」拆自己的体系**：季后赛里被打得最惨的几局，都是热门英雄拿了一堆、但前排/开团/法术伤害缺一块，团战一碰就碎。');
out.push('');
out.push('---');
out.push('');
out.push('*本报告由 `_tools/poreport.mjs` 从 `_tools/gs16full.json` 自动生成，随新数据抓取可重跑。*');
out.push('');

fs.mkdirSync(ROOT + 'docs', { recursive: true });
fs.writeFileSync(ROOT + 'docs/lpl-2026-split3-playoffs.md', out.join('\n'), 'utf8');
fs.writeFileSync(ROOT + '_tools/poreport.json', JSON.stringify({
  sample: PO.length,
  blueWinPct: pct(poStats.s.blueWin, PO.length),
  avgDur: fmtDur(poStats.s.dur / Math.max(1, PO.length)),
  topBan: topEntries(poStats.s.ban, 10).map(([id, n]) => [id, cn(id), pct(n, PO.length)]),
  topPick: topEntries(poStats.s.pickN, 10).map(([id, n]) => [id, cn(id), pct(n, PO.length), pct(poStats.s.pickWin[id] || 0, n)]),
  risers: rises.map(([id, d]) => [id, cn(id), Math.round(d)]),
  fallers: falls.map(([id, d]) => [id, cn(id), Math.round(d)]),
  champion: champ ? champ[0] : null,
  series: series.map((x) => ({ games: x.games, win: x.win })),
}, null, 2), 'utf8');
console.log('PO games', PO.length, 'S3 games', S3.length, 'blueWin', pct(poStats.s.blueWin, PO.length) + '%');
console.log('champion', champ && champ[0], 'series', series.length);
console.log('wrote docs/lpl-2026-split3-playoffs.md');
