// 解说模式：对每一手 pick / ban 给出职业向的评价，可开关
// 依赖：RULES / Draft / AIBP / META / PROSTATS / StyleDB / NickUtil
(function () {
  const R = window.RULES;
  const ROLE_CN = R.ROLE_CN;

  function S() { return window.StyleDB || null; }
  function M() { return window.META || null; }
  function A() { return window.AIBP || null; }
  function D() { return window.Draft || null; }
  function P() { return window.PROSTATS || null; }
  function champ(id) { return window.Draft && Draft.champName ? Draft.champName(id) : id; }
  function pdata(id) { const p = P(); return p && p.champs ? p.champs[id] : null; }
  function roles(id) { const d = D(); return d && d.proRoles ? (d.proRoles(id) || null) : null; }
  function nickOf(name) {
    return (window.NickUtil && NickUtil.pick) ? NickUtil.pick(name) : name;
  }
  function tagsOf(id) {
    const d = D();
    return d && d.champTags ? d.champTags(id) : [];
  }
  function primaryRole(id) {
    const r = roles(id);
    if (!r) return null;
    let best = null;
    Object.keys(r).forEach((k) => {
      if (!best || (r[k].share || 0) > (r[best].share || 0)) best = k;
    });
    return best;
  }
  function filledRoles(picks, assign) {
    const out = {};
    picks.forEach((id) => { const r = assign && assign[id]; if (r) out[r] = id; });
    return out;
  }

  // 找出这一手在当前局面下的“最佳参照分”，用于判断妙手 / 疑问手
  // 只抽样看一批版本热门 + 本队舒适位，避免 170 个英雄全量评分拖慢界面
  function gradeOf(state, ctx, id, type) {
    const a = A();
    if (!a) return { tag: '常规', ratio: 1, d: null };
    const pool = (D().availList ? D().availList(state) : []).map((c) => c.i);
    const pres = (x) => {
      const pd = pdata(x);
      const tp = S() ? S().teamPickCount(ctx.team, x) : 0;
      return (pd ? pd.pr + pd.p * 0.6 : 0) + tp * 1.5;
    };
    pool.sort((x, y) => pres(y) - pres(x));
    const pick = pool.slice(0, 22);
    if (pick.indexOf(id) < 0) pick.unshift(id);
    let top = -1e9;
    const mine = type === 'pick' ? a.evalPick(ctx, id) : a.evalBan(ctx, id);
    if (!mine) return { tag: '疑问手', ratio: 0, d: null };
    top = mine.score;
    for (let i = 0; i < pick.length; i++) {
      const x = pick[i];
      const d = type === 'pick' ? a.evalPick(ctx, x) : a.evalBan(ctx, x);
      if (d && d.score > top) top = d.score;
    }
    const gap = top - mine.score;
    let tag = '常规';
    if (gap <= 0.9) tag = '妙手';
    else if (gap <= 2.5) tag = '好手';
    else if (gap <= 6) tag = '一般';
    else tag = '疑问手';
    // 选人：最优解也分段位——早期拿招牌是妙手，末位补位只是常规完成度
    if (type === 'pick') {
      const ownN = (ctx.ownPicks || []).length;
      const pr = primaryRole(id);
      const p = pr && ctx.ownRoleMap ? ctx.ownRoleMap[pr] : null;
      const sig = !!(p && p.s && p.s.indexOf(id) >= 0);
      if (tag === '妙手' && ownN >= 3) tag = '常规';
      else if (tag === '妙手' && !sig && ownN >= 1) tag = '好手';
      else if (tag === '好手' && sig && ownN <= 1) tag = '妙手';
    } else if (tag === '妙手') {
      // ban：干净利落是应该的，只有拆到对面体系核心才算妙手
      const es = S() ? S().styleOf(ctx.enemyTeam) : null;
      tag = (es && es.star && es.star.indexOf(id) >= 0) ? '妙手' : '好手';
    }
    return { tag: tag, ratio: mine.score, d: mine, gap: gap };
  }

  function pct(n) { return Math.round(n); }

  // 为什么这手 ban 值 / 不值：位置维度
  function banPositionNote(ctx, id) {
    const r = roles(id);
    if (!r) return null;
    const enemyFilled = filledRoles(ctx.enemyPicks, ctx.enemyAssign);
    const keys = Object.keys(r).filter((k) => (r[k].share || 0) >= 12);
    if (!keys.length) return null;
    const allFilled = keys.every((k) => enemyFilled[k]);
    if (allFilled) {
      return '对面 ' + keys.map((k) => ROLE_CN[k]).join('/') + ' 位已经锁好了，这个 ban 位花在他不上的位置上，性价比一般';
    }
    const open = keys.filter((k) => !enemyFilled[k]);
    // 对面还没开始亮人时，别硬说「往他要补的坑上踩」
    if (open.length === 1 && (ctx.enemyPicks || []).length >= 2) {
      return '对面 ' + ROLE_CN[open[0]] + ' 位还没定，这手 ban 是往他要补的坑上踩';
    }
    return null;
  }

  // 系列赛记忆：同一套 ban 不要从 B1 复制到 B3
  function seriesNote(state, team, id) {
    const games = (state && state.games) || [];
    if (!games.length) return null;
    let banByUs = 0, banByThem = 0, pickByEnemy = 0, lastEnemyWinPick = false;
    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      if (!g || !g.picks) continue;
      const side = (g.blue === team) ? 'blue' : 'red';
      const enemy = side === 'blue' ? 'red' : 'blue';
      if ((g.bans[side] || []).indexOf(id) >= 0) banByUs++;
      if ((g.bans[enemy] || []).indexOf(id) >= 0) banByThem++;
      if ((g.picks[enemy] || []).indexOf(id) >= 0) pickByEnemy++;
      if (i === games.length - 1 && g.winner && g.winner !== side && (g.picks[enemy] || []).indexOf(id) >= 0) lastEnemyWinPick = true;
    }
    if (lastEnemyWinPick) return '上一局对面就赢在这手，B' + (games.length + 1) + ' 不能再放同一个口子';
    if (banByUs >= 1 && pickByEnemy === 0) return '前几局按过它，对面一直没拿，这手可以先省下来换个点';
    if (banByThem >= 2) return '对面连着两局都在处理这个点，说明他们怕，可以当筹码用';
    return null;
  }

  function seriesPickNote(state, team, id) {
    const games = (state && state.games) || [];
    if (!games.length) return null;
    let banByThem = 0;
    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      if (!g || !g.bans) continue;
      const side = (g.blue === team) ? 'blue' : 'red';
      const enemy = side === 'blue' ? 'red' : 'blue';
      if ((g.bans[enemy] || []).indexOf(id) >= 0) banByThem++;
    }
    if (banByThem >= 1) return '对面前面已经按过它 ' + banByThem + ' 次，说明这手他们处理不了，现在放出来正好顺势拿';
    return null;
  }

  function pickLine(state, side, id, step) {
    const a = A();
    const team = state.cur[side];
    const g = state.cur;
    const teamSide = side === 'blue' ? '蓝' : '红';
    const pre = {
      cfg: state.cfg, score: state.score, games: state.games,
      lockedPicks: state.lockedPicks, lockedBans: state.lockedBans,
      cur: {
        no: g.no, blue: g.blue, red: g.red, step: step,
        picks: { blue: g.picks.blue.slice(), red: g.picks.red.slice() },
        bans: { blue: g.bans.blue.slice(), red: g.bans.red.slice() },
        history: g.history, over: false, winner: null,
      },
    };
    const arr = pre.cur.picks[side];
    const idx = arr.lastIndexOf(id);
    if (idx >= 0) arr.splice(idx, 1);
    const picksBefore = arr.slice();
    const ctx = a ? a.ctxOf(pre, null) : null;
    let role = null, p = null, com = 0;
    if (ctx) {
      const asg = a.assignRoles(picksBefore.concat([id]), ctx.ownRoleMap);
      if (asg) { role = asg[id]; p = ctx.ownRoleMap[role] || null; }
      com = p ? a.comfortScore(p, id) : 0;
    }
    if (!role) role = primaryRole(id);
    const pd = pdata(id);
    const st = S() ? S().styleOf(team) : null;
    const tm = S() ? S().teamProfile(team) : null;
    const pickNo = picksBefore.length + 1;

    const bits = [];
    let tag = pickNo === 1 ? '一抢' : pickNo === 5 ? '末位补位' : '第 ' + pickNo + ' 手';

    if (p && p.s) {
      const i = p.s.indexOf(id);
      if (i === 0) bits.push(p.n + ' 的招牌，敢在这个时候亮出来，说明训练赛是有底的');
      else if (i > 0 && i < 4) bits.push(p.n + ' 的英雄池主力，拿出来就是打自己最熟那套');
      else if (com >= 2) bits.push('和 ' + p.n + ' 的英雄池风格接近，能掏但不是第一选择');
    }
    if (role) bits.push('定位在' + ROLE_CN[role] + (pd && pd.wr ? '，本季职业赛场胜率 ' + pct(pd.wr) + '%' : ''));
    if (st) bits.push(team + ' 打的是' + st.cn + '，这手' + (S().slotFit(st, role, id) >= 2 ? '正好补在体系的缺口上' : '偏功能性，得靠后面几手补齐体系'));
    if (tm && tm.picks && tm.picks[id] >= 2) bits.push('本季 ' + team + ' 用过 ' + tm.picks[id] + ' 次，是自己舒适区里的英雄');
    if (pd && pd.pr >= 20) bits.push('版本 BP 率 ' + pct(pd.pr) + '%，属于对面必须处理的热门点');
    if (pd && pd.pr < 4 && pd.p >= 3) bits.push('冷门选择，胜率样本只有 ' + pd.p + ' 场，赌的是对位和熟练度');
    const spn = seriesPickNote(state, team, id);
    if (spn) bits.push(spn);

    const flex = (D().proRoles ? Object.keys(D().proRoles(id) || {}).length : 0);
    if (flex >= 2 && pickNo <= 2) bits.push('能摇摆，先把位置藏住，逼对面先暴露分路');

    // 克制/被克制基于敌方已亮英雄
    if (ctx && M()) {
      const enemy = ctx.enemyPicks;
      let good = 0, bad = 0, ex = '';
      enemy.forEach((e) => {
        const c = M().counter(id, e);
        if (c > 0) { good += c; if (!ex) ex = champ(e); }
        if (c < 0) bad += -c;
      });
      if (good > 0) bits.push('对位上是压着 ' + (ex || '对面已亮英雄') + ' 打的，这条线能拿到主动权');
      else if (bad > 0) bits.push('对位上会被对面反制，得靠打野或者换线帮忙兜');
    }

    // 组合 / 拆招
    if (ctx && M()) {
      const own = picksBefore;
      let syn = 0, synEx = '';
      own.forEach((o) => {
        const v = M().synergy(id, o);
        if (v > 0 && v > syn) { syn = v; synEx = champ(o); }
      });
      if (syn >= 4) bits.push('和 ' + synEx + ' 是成套的，两个一起在场才叫组合');
    }

    const gr = ctx ? gradeOf(pre, ctx, id, 'pick') : { tag: '常规' };
    const nk = p ? nickOf(p.n) : '';
    const head = teamSide + '方 ' + team + ' ' + tag + ' ' + champ(id) +
      (p ? ' · ' + p.n + (nk && nk !== p.n ? '「' + nk + '」' : '') : '');
    return {
      side: side, type: 'pick', id: id, name: champ(id), team: team, who: p ? p.n : '',
      head: head, tag: gr.tag, role: role,
      text: bits.slice(0, 3).join('；') + '。',
      bullets: bits.slice(0, 4),
    };
  }

  function banLine(state, side, id, step) {
    const a = A();
    const g = state.cur;
    const team = g[side];
    const enemySide = side === 'blue' ? 'red' : 'blue';
    const enemyTeam = g[enemySide];
    const pre = {
      cfg: state.cfg, score: state.score, games: state.games,
      lockedPicks: state.lockedPicks, lockedBans: state.lockedBans,
      cur: {
        no: g.no, blue: g.blue, red: g.red, step: step,
        picks: { blue: g.picks.blue.slice(), red: g.picks.red.slice() },
        bans: { blue: g.bans.blue.slice(), red: g.bans.red.slice() },
        history: g.history, over: false, winner: null,
      },
    };
    const barr = pre.cur.bans[side];
    const bi = barr.lastIndexOf(id);
    if (bi >= 0) barr.splice(bi, 1);
    const ctx = a ? a.ctxOf(pre, null) : null;
    const bits = [];
    const pd = pdata(id);
    const enemyProfile = S() ? S().teamProfile(enemyTeam) : null;
    const enemyStyle = S() ? S().styleOf(enemyTeam) : null;
    const ownStyle = S() ? S().styleOf(team) : null;

    // 拆对面绝活
    if (ctx) {
      R.ROLES.forEach((r) => {
        const p = ctx.enemyRoleMap[r];
        if (!p || !p.s) return;
        const i = p.s.indexOf(id);
        if (i === 0) bits.push('先掐 ' + p.n + ' 的招牌，不让他按最舒服的方式打');
        else if (i > 0 && i < 4) bits.push(p.n + ' 的英雄池主力，这手是提前处理他的舒适点');
      });
      // 位置维度
      const posNote = banPositionNote(ctx, id);
      if (posNote) bits.push(posNote);
      // 系列赛记忆
      const sn = seriesNote(state, team, id);
      if (sn) bits.push(sn);
      // 拆组合
      if (M()) {
        let bestV = 0, bestEx = '';
        ctx.enemyPicks.forEach((e) => {
          const v = M().synergy(id, e);
          if (v > bestV) { bestV = v; bestEx = champ(e); }
        });
        if (bestV >= 4) bits.push('拆 ' + champ(id) + ' + ' + bestEx + ' 的组合，不让对面这套团战成形');
      }
      // 敌方体系针对
      if (enemyStyle && enemyStyle.star && enemyStyle.star.indexOf(id) >= 0) {
        bits.push(enemyTeam + ' 的' + enemyStyle.cn + '核心件，拆掉之后他们的开团链条会断一截');
      }
    }
    if (pd && pd.pr >= 22) bits.push('版本 BP 率 ' + pct(pd.pr) + '%，这手是处理版本答案，谁都不想放');
    if (enemyProfile && enemyProfile.picks && enemyProfile.picks[id] >= 3) {
      bits.push(enemyTeam + ' 本季用了 ' + enemyProfile.picks[id] + ' 次，明显是他们的常用点');
    }
    // 自己爱用/对手不玩 的警告
    if (ctx) {
      let ownSig = null;
      R.ROLES.forEach((r) => {
        const p = ctx.ownRoleMap[r];
        if (p && p.s && p.s.indexOf(id) >= 0 && !ownSig) ownSig = p.n;
      });
      if (ownSig) bits.push('注意：' + ownSig + ' 也吃这个英雄，ban 掉等于把自己的选项一起关了');
    }
    if (!bits.length) {
      if (pd && pd.p >= 30) {
        bits.push('常规的版本线处理，' + champ(id) + ' 本季出场 ' + pct(pd.p) + ' 场、胜率 ' + pct(pd.wr) + '%，算不上非按不可的点');
      } else {
        bits.push('常规处理，先把版本线上可能被对面先拿走的点清掉');
      }
    }

    const gr = ctx ? gradeOf(pre, ctx, id, 'ban') : { tag: '常规' };
    const tSide = side === 'blue' ? '蓝' : '红';
    return {
      side: side, type: 'ban', id: id, name: champ(id), team: team, who: '',
      head: tSide + '方 ' + team + ' 禁用 ' + champ(id),
      tag: gr.tag, text: bits.slice(0, 3).join('；') + '。', bullets: bits.slice(0, 4),
    };
  }

  // 当前局面的一句提示
  function tip(state) {
    if (!state || !state.cur) return '';
    const g = state.cur;
    const st = R.STEPS[g.step];
    if (!st) return '';
    const side = st.side;
    const enemySide = side === 'blue' ? 'red' : 'blue';
    const enemyPicks = g.picks[enemySide];
    const ctx = A() ? A().ctxOf(state, null) : null;
    if (!ctx) return '';
    if (st.type === 'ban') {
      const filled = filledRoles(enemyPicks, ctx.enemyAssign);
      const openRoles = R.ROLES.filter((r) => !filled[r]);
      if (enemyPicks.length >= 3) {
        return '对面已经亮了 ' + enemyPicks.length + ' 手，剩下 ' + openRoles.map((r) => ROLE_CN[r]).join('/') +
          ' 位没定。这个 ban 优先拆他们已经成形的组合，别再往已锁的位置上丢 ban。';
      }
      if (g.step >= 12) return '二轮 ban：此时对面阵容骨架已经出来，ban 要服务于「不让他这套舒服展开」，而不是照着榜单 ban。';
      return '一轮 ban：先把对面选手的招牌和版本答案处理掉，别急着针对分路。';
    }
    const ownNeed = R.ROLES.filter((r) => !filledRoles(g.picks[side], ctx.ownAssign)[r]);
    if (!ownNeed.length) return '五个位置都定了，接下来的选人只看对位和体系补强。';
    return '还差 ' + ownNeed.map((r) => ROLE_CN[r]).join('/') + ' 位没定人' +
      (g.picks[side].length <= 1 ? '，一手优先拿能摇摆、对面不好针对的。' : '，优先补体系缺口，别再拿同定位的重复件。');
  }

  function summarize(moves) {
    if (!moves || !moves.length) return null;
    const scored = moves.filter((m) => m.tag === '妙手' || m.tag === '好手');
    return scored.length ? scored[scored.length - 1] : moves[moves.length - 1];
  }

  window.Caster = {
    pickLine: pickLine, banLine: banLine, tip: tip, summarize: summarize,
    gradeOf: gradeOf, pdata: pdata, roles: roles,
  };
})();
