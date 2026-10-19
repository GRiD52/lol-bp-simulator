// 职业化 BP 模型：按战队风格 / 体系 / 选手熟练度 / 版本数据出职业赛阵容
// 这个文件加载在 draft.js 之后，会把 Draft.aiPlan / aiChoose / suggest / pickDetail /
// banDetail / fits 换成「职业分析师口径」的新实现，旧的简单模型只作兜底。
(function () {
  const D = window.Draft;
  const R = window.RULES;
  const S = window.StyleDB;
  const CH = window.CHAMPIONS || [];
  const BY = {};
  CH.forEach((c) => { BY[c.i] = c; });
  const ROLES = ['top', 'jg', 'mid', 'bot', 'sup'];
  const ROLE_CN = (R && R.ROLE_CN) || { top: '上单', jg: '打野', mid: '中单', bot: '下路', sup: '辅助' };
  const CU = window.ChampUtil || {};

  function ps(id) { return (window.PROSTATS && window.PROSTATS.champs[id]) || null; }
  function name(id) { return (BY[id] && BY[id].n) || id; }
  function tags(id) { return (CU.champTags ? CU.champTags(id) : []); }
  function hasTag(id, t) { return tags(id).indexOf(t) >= 0; }
  function meta() { return window.META || null; }

  // ===== 职业分路 =====
  const PRO_CACHE = {};
  function proRec(id) {
    if (PRO_CACHE[id] !== undefined) return PRO_CACHE[id];
    // AI 只认职业赛真实样本，排位热门/冷门绝活不进入职业阵容
    const v = S && S.proData ? S.proData(id) : null;
    PRO_CACHE[id] = v;
    return v;
  }
  function proRoles(id) {
    const r = proRec(id);
    return r ? r.roles : null;
  }
  function share(id, role) {
    const rs = proRoles(id);
    return rs && rs[role] ? rs[role].share : 0;
  }
  function flexCount(id) {
    const rs = proRoles(id);
    return rs ? Object.keys(rs).length : 0;
  }
  // 只在职业分路内摆位：每个英雄只能去它真实打过的位置
  // roleMap 给了选手时，按「选手熟练度 + 分路占比」挑最优摆法（枚举 120 种组合）
  function assignRoles(ids, roleMap) {
    const list = ids.filter(Boolean);
    if (!list.length) return {};
    if (list.length > 5) return null;
    const opts = {};
    for (let i = 0; i < list.length; i++) {
      const rs = proRoles(list[i]);
      if (!rs) return null;
      const ok = ROLES.filter((r) => rs[r]);
      if (!ok.length) return null;
      opts[list[i]] = ok;
    }
    let bestMap = null;
    let bestScore = -1;
    function go(i, used, res, sum) {
      if (i === list.length) {
        if (sum > bestScore) { bestScore = sum; bestMap = Object.assign({}, res); }
        return;
      }
      const id = list[i];
      const cand = opts[id];
      for (let k = 0; k < cand.length; k++) {
        const r = cand[k];
        if (used[r]) continue;
        const p = roleMap ? roleMap[r] : null;
        const v = share(id, r) * 0.5 + comfortScore(p, id) * 2.2;
        used[r] = 1; res[id] = r;
        go(i + 1, used, res, sum + v);
        delete used[r]; delete res[id];
      }
    }
    go(0, {}, {}, 0);
    return bestMap;
  }

  // ===== 上下文 =====
  const STEP_PICK_ORDER = (R && R.STEPS) || [];
  function sideOf(g, side) { return g[side]; }
  function playerRoleMap(state, side) {
    const g = state.cur;
    const team = g[side];
    const roster = (window.Draft.rosterOf ? D.rosterOf(team) : []) || [];
    const out = {};
    ROLES.forEach((r) => {
      const p = roster.find((x) => x.r === r && !x.sub) || roster.find((x) => x.r === r);
      if (p) out[r] = p;
    });
    return out;
  }
  function ctxOf(state, opts) {
    const g = state.cur;
    const st = D.curStep(state);
    if (!g || !st) return null;
    const side = st.side;
    const team = g[side];
    const style = S ? S.styleOf(team) : null;
    const profile = (opts && opts.profile) || null;
    if (style && profile === 'tempo') style.aggr = Math.min(1, style.aggr + 0.25);
    if (style && profile === 'control') style.aggr = Math.max(-0.6, style.aggr - 0.2);
    const ownPicks = g.picks[side].slice();
    const enemySide = side === 'blue' ? 'red' : 'blue';
    const enemyPicks = g.picks[enemySide].slice();
    const enemyTeam = g[enemySide];
    const enemyStyle = S ? S.styleOf(enemyTeam) : null;
    const ownRoleMap = playerRoleMap(state, side);
    const enemyRoleMap = playerRoleMap(state, enemySide);
    const ownAssign = assignRoles(ownPicks) || {};
    const enemyAssign = assignRoles(enemyPicks) || {};
    const step = g.step;
    const ownPickNo = ownPicks.length;
    const firstOverall = (step === 6);
    return {
      s: state, g: g, st: st, side: side, team: team, enemySide: enemySide, enemyTeam: enemyTeam,
      style: style, enemyStyle: enemyStyle, profile: profile,
      ownPicks: ownPicks, enemyPicks: enemyPicks,
      ownAssign: ownAssign, enemyAssign: enemyAssign,
      ownRoleMap: ownRoleMap, enemyRoleMap: enemyRoleMap,
      step: step, ownPickNo: ownPickNo, firstOverall: firstOverall,
      early: ownPickNo <= 1, last: ownPickNo >= 3,
      banPhase: step < 6 ? 1 : (step >= 12 && step < 16 ? 2 : 0),
    };
  }

  // ===== 选手熟练度 =====
  function comfortScore(p, id) {
    if (!p || !p.s || !p.s.length) return 0;
    if (p.s.indexOf(id) >= 0) {
      const i = p.s.indexOf(id);
      return 13 - i * 0.9 + (i === 0 ? 3 : 0);
    }
    // 英雄池风格相近：和自己招牌英雄共享标签越多越熟
    const tg = tags(id);
    if (!tg.length) return 0;
    let best = 0;
    for (let i = 0; i < p.s.length; i++) {
      const st = tags(p.s[i]);
      if (!st.length) continue;
      let hit = 0;
      for (let j = 0; j < tg.length; j++) if (st.indexOf(tg[j]) >= 0) hit++;
      const v = Math.min(3, hit) * (i < 3 ? 1 : 0.6);
      if (v > best) best = v;
    }
    return best;
  }

  // 选手自身位置评分（和战队页口径一致）
  function playerScore(p) {
    if (!p) return 62;
    return (p.a || 80) * 0.29 + (p.d || 80) * 0.21 + (p.f || 80) * 0.28 + (p.b || 80) * 0.22;
  }

  // ===== 对手体系判断 =====
  function enemyArch(ctx) {
    if (!window.Analyze || !window.Analyze.archFit) return null;
    if (ctx.enemyPicks.length < 3) return null;
    try {
      const prof = window.Analyze.archFit(ctx.enemyPicks);
      if (!prof || !prof.list || !prof.list.length) return null;
      const top = prof.list[0];
      return top[1] >= 62 ? top : null;
    } catch (e) { return null; }
  }

  // ===== pick 评分 =====
  function evalPick(ctx, id) {
    const detail = { id: id, base: 0, why: [], aspects: {} };
    const own = ctx.ownPicks.concat([id]);
    const assign = assignRoles(own, ctx.ownRoleMap);
    if (!assign) return null; // 职业分路摆不满，直接排除
    detail.assign = assign;
    const role = assign[id];
    detail.role = role;
    const p = ctx.ownRoleMap[role] || null;
    const q = ps(id);
    let v = 0;

    // 0) 分路可信度：只打过零星几场的位置，职业队不会为了一个人改分路
    const rp = proRoles(id);
    const rShare = rp && rp[role] ? (rp[role].share || 0) : 0;
    if (rShare > 0 && rShare < 10) {
      v -= 9.0;
      detail.aspects.offRole = rShare;
    } else if (rShare > 0 && rShare < 20) {
      v -= 3.4;
    }

    // 1) 选手强度 + 熟练度
    const rating = playerScore(p);
    v += rating * 0.42;
    const com = comfortScore(p, id);
    v += com;
    if (p && p.s) {
      if (p.s.indexOf(id) === 0) {
        detail.aspects.sig = '招牌';
        detail.why.push('选手：' + p.n + ' 的招牌英雄（队内第一熟练度）');
      } else if (p.s.indexOf(id) > 0) {
        detail.aspects.sig = '绝活';
        detail.why.push('选手：' + p.n + ' 的英雄池主选，拿出来就有底气');
      } else if (com >= 2) {
        detail.aspects.sig = '池内';
        detail.why.push('选手：' + p.n + ' 英雄池里风格相近的选择，能掏');
      }
    }

    // 2) 队伍舒适区（本季真实选用）
    const tp = S ? S.teamPickCount(ctx.team, id) : 0;
    if (tp > 0) {
      v += Math.min(11, tp * 0.75);
      detail.aspects.team = tp;
    }
    if (S) {
      const prof = S.teamProfile(ctx.team);
      if (prof && prof.topPicks && prof.topPicks[0] && prof.topPicks[0][0] === id) {
        v += 3.2;
        detail.why.push('队伍：' + ctx.team + ' 本季第一顺位常用（' + tp + ' 次选用）');
      }
    }
    if (ctx.style && ctx.style.sig && ctx.style.sig.indexOf(id) >= 0) {
      v += 6.2;
      detail.why.push('队伍：' + ctx.team + ' 的体系舒适区，这套阵容里跑过很多次');
    }
    // 体系骨架还没拿到时，优先补齐核心件
    if (ctx.style && ctx.style.star && ctx.style.star.indexOf(id) >= 0) {
      const hasStar = ctx.ownPicks.some((x) => ctx.style.star.indexOf(x) >= 0);
      if (!hasStar) {
        v += 4.0;
        detail.why.push('体系：这套' + ctx.style.cn + '还缺一个骨架，先把它拿下来');
      }
    }

    // 3) 版本（S16 真实胜率 + BP 率；小样本按置信度收缩，避免 5 场 100% 的假热门）
    if (q) {
      const conf = Math.min(1, q.p / 25);
      v += (q.wr - 50) * 0.42 * conf + Math.min(4, q.pr * 0.08);
      if (q.p < 8) v -= 2.2;
      detail.aspects.wr = q.wr;
      detail.aspects.pr = q.pr;
    }

    // 4) 体系契合
    const styleFit = S ? S.slotFit(ctx.style, role, id) : 0;
    v += styleFit * 2.1;
    if (styleFit >= 2) {
      const cn = (ctx.style && ctx.style.cn) || '体系';
      detail.why.push('搭配：' + cn + ' 的 ' + ROLE_CN[role] + ' 位缺的就是这种功能');
    }

    // 5) 摇摆价值 / 先抢后抢
    const flex = flexCount(id);
    v += (ctx.early || ctx.firstOverall ? 2.8 : 1.0) * Math.max(0, flex - 1);
    // 一抢不亮纯辅助/纯下路：职业赛里这两个位置留到后面补
    const pk = proRoleKeys(id);
    if (ctx.early && pk.length === 1 && pk[0] === 'sup') v -= 8.6;
    if (ctx.early && pk.length === 1 && pk[0] === 'bot') v -= 2.2;
    if (ctx.early && flex <= 1 && role === 'top' && id !== 'Renekton') v -= 1.2;
    if (ctx.firstOverall && flex >= 2) {
      detail.why.push('顺序：一抢拿摇摆位，逼对手先暴露分路');
    }

    // 6) 对位与克制：敌方已亮英雄
    let cnt = 0;
    let cntWhy = '';
    for (let i = 0; i < ctx.enemyPicks.length; i++) {
      const e = ctx.enemyPicks[i];
      const er = ctx.enemyAssign[e];
      if (!er) continue;
      const m = meta();
      if (m && m.counter) {
        const c = m.counter(id, e);
        if (c > 0) { cnt += c * 1.1; if (!cntWhy) cntWhy = m.counterWhy ? (m.counterWhy(id, e) || '') : ''; }
      }
      if (er === role && window.PROSTATS && window.PROSTATS.counters) {
        const rec = window.PROSTATS.counters[id + '>' + e];
        if (rec && rec.n >= 5 && rec.wr >= 55) { cnt += (rec.wr - 50) * 0.45; if (!cntWhy) cntWhy = '同位置交手数据占优'; }
      }
    }
    if (cnt > 0) {
      v += cnt * (ctx.last ? 1.55 : 1);
      detail.aspects.counter = cnt;
      detail.why.push('克制：' + (cntWhy || '这手对敌方已亮阵容有直接针对') );
    }

    // 7) 组合协同
    let syn = 0;
    let synWhy = '';
    const m2 = meta();
    if (m2 && m2.synergy) {
      for (let i = 0; i < ctx.ownPicks.length; i++) {
        const sp = m2.synergy(id, ctx.ownPicks[i]);
        if (sp > 0) {
          syn += sp * 0.55;
          if (!synWhy) {
            const duo = m2.duo(id, ctx.ownPicks[i]);
            if (duo) synWhy = (duo[2] || '') + ' 组合';
            else synWhy = '和 ' + name(ctx.ownPicks[i]) + ' 的联动';
          }
        }
      }
    }
    if (syn > 0) {
      v += syn;
      detail.aspects.syn = syn;
      detail.why.push('联动：' + (synWhy || '和已有英雄能打配合'));
    }

    // 8) 见招拆招：敌方体系明显时优先拿 ANSWER
    const ea = enemyArch(ctx);
    if (ea && m2 && m2.ANSWER) {
      const ans = m2.ANSWER[ea[0]] || [];
      if (ans.indexOf(id) >= 0) {
        v += 8 + (ea[1] - 62) * 0.35;
        detail.why.push('拆招：直接拆敌方「' + archCn(ea[0]) + '」，不让他舒服展开');
      }
    }
    // 8.5) 反体系的功能位：对面想打团，我们就要反手/强边线
    if (ea) {
      const tb = archTagBoost(id, ea[0]);
      if (tb > 0) {
        v += tb;
        detail.why.push('拆招：对面这套' + archCn(ea[0]) + '最怕这种功能，先拿在自己手里');
      }
    }
    // 8.6) 抢掉对手组合的另一半（见招拆招的另一面：不给他凑齐）
    if (m2 && m2.synergy) {
      for (let i = 0; i < ctx.enemyPicks.length; i++) {
        const sp2 = m2.synergy(id, ctx.enemyPicks[i]);
        if (sp2 >= 6) {
          v += 2.4;
          detail.why.push('针对：这手和对面已亮的 ' + name(ctx.enemyPicks[i]) + ' 是绝配，先抢掉不给他凑齐');
          break;
        }
      }
    }

    // 9) 阵容底线：前排 / 法术伤害 / 不要同功能堆叠（不做成数值游戏，做阵容逻辑）
    const allTags = [];
    for (let i = 0; i < own.length; i++) {
      const tg = tags(own[i]);
      for (let j = 0; j < tg.length; j++) allTags.push(tg[j]);
    }
    const hasFront = allTags.indexOf('front') >= 0 || allTags.indexOf('engage') >= 0;
    const hasAp = own.some((x) => CU.champDmg(x) === 'P');
    const hasAd = own.some((x) => CU.champDmg(x) === 'A');
    if (ctx.ownPicks.length >= 2) {
      const myTg = tags(id);
      if (!hasFront && (myTg.indexOf('front') >= 0 || myTg.indexOf('engage') >= 0)) {
        v += 3.0;
        detail.why.push('阵容：前排还没人站，这手补上才有团战底线');
      }
      if (!hasAp && CU.champDmg(id) === 'P' && ctx.ownPickNo) {
        v += 2.6;
        detail.why.push('阵容：清一色物理输出，得补一手法术伤害');
      }
      if (!hasAd && CU.champDmg(id) === 'A') v += 1.6;
      // 已经有三个纯后排输出，再选脆皮就是乱配
      const backline = own.filter((x) => {
        const tg2 = tags(x);
        return tg2.indexOf('poke') >= 0 || tg2.indexOf('burst') >= 0 || tg2.indexOf('range') >= 0;
      }).length;
      if (backline >= 3 && myTg.indexOf('front') < 0) v -= 1.8;
    }

    // 10) 敌方 ban 位针对：自己的绝活被 ban 掉时，补同风格
    detail.score = v;
    return detail;
  }

  function archCn(k) {
    const M = window.META;
    if (M && M.ARCH_BY_K && M.ARCH_BY_K[k]) return M.ARCH_BY_K[k].cn || k;
    const S2 = S && S.STYLES && S.STYLES[k];
    return S2 ? S2.cn : k;
  }

  function rankIn(arr, id) {
    if (!arr) return -1;
    for (let i = 0; i < arr.length && i < 6; i++) {
      if (arr[i] && arr[i][0] === id) return i;
    }
    return -1;
  }

  // 对面哪些位置已经锁好了（位置维度：别再往已锁的位置浪费 ban）
  function filledRoles(picks, assign) {
    const out = {};
    picks.forEach((id) => { const r = assign && assign[id]; if (r) out[r] = id; });
    return out;
  }
  function proRoleKeys(id) {
    const r = proRoles(id);
    if (!r) return [];
    return Object.keys(r).filter((k) => (r[k].share || 0) >= 12);
  }
  // 系列赛记忆：这个英雄之前几局被双方怎么处理过（避免一套 ban 重复到死）
  function seriesMemory(ctx, id) {
    const games = (ctx.s && ctx.s.games) || [];
    const mem = { games: games.length, banByUs: 0, pickByUs: 0, pickByEnemy: 0, lostLast: false, enemyLastPicks: [] };
    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      if (!g || !g.picks || !g.bans) continue;
      const side = (g.blue === ctx.team) ? 'blue' : 'red';
      const enemy = side === 'blue' ? 'red' : 'blue';
      if ((g.bans[side] || []).indexOf(id) >= 0) mem.banByUs++;
      if ((g.picks[side] || []).indexOf(id) >= 0) mem.pickByUs++;
      if ((g.picks[enemy] || []).indexOf(id) >= 0) mem.pickByEnemy++;
    }
    const last = games[games.length - 1];
    if (last && last.winner) {
      const side = (last.blue === ctx.team) ? 'blue' : 'red';
      const enemy = side === 'blue' ? 'red' : 'blue';
      mem.lostLast = last.winner !== side;
      if (mem.lostLast) mem.enemyLastPicks = (last.picks[enemy] || []).slice();
    }
    return mem;
  }

  // 敌方体系 → 我们该拿什么类型的英雄去拆（强边线 vs 团战 vs 消耗）
  const ARCH_TAGS = {
    wombo: ['disengage', 'peel', 'range'],
    dive: ['disengage', 'peel', 'shield'],
    scale: ['lane', 'tempo', 'early'],
    poke: ['engage', 'hardengage', 'front'],
    split: ['engage', 'front', 'tempo'],
    aegis: ['scale', 'late', 'lane'],
    protect: ['dive', 'burst', 'assassin'],
    tempo: ['scale', 'waveclear', 'disengage'],
    control: ['tempo', 'lane', 'pick'],
  };
  function archTagBoost(id, k) {
    const want = ARCH_TAGS[k];
    if (!want) return 0;
    const tg = tags(id);
    let hit = 0;
    for (let i = 0; i < want.length; i++) if (tg.indexOf(want[i]) >= 0) hit++;
    return Math.min(2, hit) * 1.6;
  }

  // ===== ban 评分 =====
  function evalBan(ctx, id) {
    const q = ps(id);
    const why = [];
    let v = 0;
    let src = [];
    // 对方选手绝活
    ROLES.forEach((r) => {
      const p = ctx.enemyRoleMap[r];
      if (!p || !p.s) return;
      const i = p.s.indexOf(id);
      if (i < 0) return;
      const rating = playerScore(p);
      v += (i === 0 ? 9 : 6.2) * (0.55 + rating / 100);
      src.push(p.n + ' 的' + (i === 0 ? '招牌' : '绝活'));
    });
    // 对方队伍本季高频
    const tp = S ? S.teamPickCount(ctx.enemyTeam, id) : 0;
    if (tp > 0) { v += Math.min(7.5, tp * 0.5); src.push(ctx.enemyTeam + ' 本季常用'); }
    // 对方体系核心
    if (ctx.enemyStyle && ctx.enemyStyle.star && ctx.enemyStyle.star.indexOf(id) >= 0) {
      v += 3.4;
      src.push(ctx.enemyStyle.cn + ' 的核心');
    }
    // 教练习惯：对手本季被 ban 最多的点（他们最舒服的英雄）
    // 以及自己队伍本季爱 ban 的名单（保持队伍风格）
    if (S) {
      const en = S.teamProfile(ctx.enemyTeam);
      if (en && en.topBanned) {
        const k = rankIn(en.topBanned, id);
        if (k >= 0) {
          v += [6.0, 4.8, 3.8, 3.0, 2.4][k] || 1.8;
          src.push(ctx.enemyTeam + ' 最舒服的点');
        }
      }
      const own = S.teamProfile(ctx.team);
      if (own && own.topBans) {
        const k = rankIn(own.topBans, id);
        if (k >= 0) {
          v += [5.0, 4.0, 3.2, 2.6, 2.0][k] || 1.6;
          why.push('习惯：' + ctx.team + ' 本季一轮经常处理这个点');
        }
      }
    }
    // 版本 OP：胜率要按样本量收缩，几场 100% 的低样本不该当成答案
    if (q) {
      const conf = Math.min(1, (q.p || 0) / 24);
      v += Math.max(0, q.wr - 52) * 0.32 * conf + Math.min(4.2, q.pr * 0.08);
      if (q.pr >= 18) src.push('版本 BP 率 ' + q.pr + '%');
      if (q.wr >= 54 && q.p >= 12) src.push('本季胜率 ' + q.wr + '%（' + q.p + ' 场）');
      if (q.p < 8) v -= 2.0;
    }
    // 对位威胁：能打我方已亮英雄
    const m = meta();
    if (m && m.counter) {
      for (let i = 0; i < ctx.ownPicks.length; i++) {
        const c = m.counter(id, ctx.ownPicks[i]) + m.counter(id, ctx.ownPicks[i]) * 0;
        if (c > 0) v += c * 0.55;
      }
    }
    // 不要 ban 对手根本不玩的英雄
    if (tp === 0 && !src.length) v -= 4.5;
    // 不要浪费 ban 在自己队伍想要的英雄上（自己绝活/本季常用）
    ROLES.forEach((r) => {
      const p = ctx.ownRoleMap[r];
      if (!p || !p.s) return;
      const i = p.s.indexOf(id);
      if (i < 0) return;
      v -= i === 0 ? 8.0 : 5.8;
    });
    if (S) {
      const ownProf = S.teamProfile(ctx.team);
      if (ownProf && ownProf.topPicks && ownProf.topPicks.slice(0, 4).some((t) => t[0] === id)) v -= 3.4;
    }
    // ===== 位置维度：对面已经锁好的位置就别再浪费 ban 位 =====
    const filled = filledRoles(ctx.enemyPicks, ctx.enemyAssign);
    const prKeys = proRoleKeys(id);
    if (ctx.enemyPicks.length && prKeys.length) {
      const open = prKeys.filter((r) => !filled[r]);
      if (!open.length) {
        v -= 5.6;
        why.push('位置：对面 ' + prKeys.map((r) => ROLE_CN[r]).join('/') + ' 都已经锁好人了，这个 ban 位花在他上不了场的位置上，性价比很差');
      } else if (open.length < prKeys.length) {
        v += 1.1;
      }
    }
    // ===== 拆组合：对面已经亮出来的搭档，按掉剩下那一半 =====
    let comboDeny = 0;
    for (let i = 0; i < ctx.enemyPicks.length; i++) {
      const e = ctx.enemyPicks[i];
      const syn = (m && m.synergy) ? m.synergy(id, e) : 0;
      if (syn >= 4) {
        comboDeny += syn * 0.42;
        if (i === 0) why.push('拆组合：' + D.champName(e) + ' 一亮出来，这手就是它最舒服的搭档');
      }
    }
    if (comboDeny) v += Math.min(5.2, comboDeny);
    // 第二轮 ban：护住自己的阵容
    if (ctx.banPhase === 2) {
      for (let i = 0; i < ctx.ownPicks.length; i++) {
        if (m && m.counter && m.counter(id, ctx.ownPicks[i]) > 0) v += 1.2;
      }
    }
    // ===== 系列赛记忆：同一套 ban 不要反复按，B2/B3 要见招拆招 =====
    const mem = seriesMemory(ctx, id);
    if (mem.games) {
      if (mem.banByUs && mem.pickByEnemy === 0) {
        // 按过、对面一次都没拿：连着按同一套是最容易被针对的公式化做法
        v -= (mem.banByUs >= 2 ? 5.2 : 3.0);
        why.push('记忆：这手前 ' + mem.banByUs + ' 局已经按过，对面一次没拿，B' + (mem.games + 1) + ' 该换个口子');
      }
      if (mem.lostLast && mem.enemyLastPicks.indexOf(id) >= 0) {
        // 上一局输在谁身上：前两手（核心）优先处理，后面的给个中等权重
        const slot = mem.enemyLastPicks.indexOf(id);
        v += slot <= 1 ? 6.4 : 4.4;
        why.push('记忆：上一局对面就是赢在这手（第 ' + (slot + 1) + ' 手），B' + (mem.games + 1) + ' 不能再给');
      }
      if (mem.pickByUs && mem.pickByEnemy) v -= 1.6; // 双方都能用，先别自己按掉
    }
    return { id: id, score: v, why: why.concat(src.length ? ['针对：' + src.slice(0, 2).join(' / ')] : []) };
  }

  // ===== 主流程 =====
  function candidates(state) {
    const list = (window.Draft.availList ? D.availList(state) : []) || [];
    return list.map((c) => c.i);
  }
  function pickCandidates(state, ctx) {
    const all = candidates(state);
    const out = [];
    for (let i = 0; i < all.length; i++) {
      const id = all[i];
      const own = ctx.ownPicks.concat([id]);
      if (!assignRoles(own)) continue;
      out.push(id);
    }
    return out;
  }
  function banCandidates(state, ctx) {
    return candidates(state);
  }

  function plan(state, opts) {
    const ctx = ctxOf(state, opts);
    if (!ctx) return null;
    if (ctx.st.type === 'ban') return banPlan(state, ctx);
    return pickPlan(state, ctx);
  }

  function pickPlan(state, ctx) {
    const ids = pickCandidates(state, ctx);
    if (!ids.length) return fallbackPick(state, ctx);
    const ranked = [];
    for (let i = 0; i < ids.length; i++) {
      const d = evalPick(ctx, ids[i]);
      if (!d) continue;
      d.score += (Math.random() - 0.5) * 2.6; // 同分抖动，避免每把完全一样
      ranked.push(d);
    }
    ranked.sort((a, b) => b.score - a.score);
    if (!ranked.length) return fallbackPick(state, ctx);
    const best = ranked[0];
    const why = [];
    why.push('位置：' + ROLE_CN[best.role] + ' · ' + (ctx.ownRoleMap[best.role] ? ctx.ownRoleMap[best.role].n : '') +
      '（' + Math.round(playerScore(ctx.ownRoleMap[best.role])) + ' 分）');
    const bullets = best.why.slice(0, 3);
    for (let i = 0; i < bullets.length; i++) why.push(bullets[i]);
    if (ctx.style) why.push('体系：' + ctx.style.cn + ' —— ' + ctx.style.note);
    const flexBest = ROLES.filter((r) => fits(best.id, r)).length;
    why.push('顺序：' + (ctx.firstOverall
      ? (flexBest >= 2 ? '这手是一抢，先拿摇摆位，逼对面先暴露分路' : '一抢先定队伍最熟的点，后面再补摇摆')
      : ctx.ownPickNo === 0 ? '本队第一手，先把最稳的点位定下来' :
        ctx.last ? '末位拿克制，敌方阵容已经亮了大半' :
          '中段补位，优先能摇摆、不被针对的英雄'));
    return {
      id: best.id, side: ctx.side, role: best.role, score: best.score,
      why: why, sidePlan: ctx.team + ' · ' + (ctx.style ? ctx.style.cn + '：' + ctx.style.note : '按版本选'),
      team: ctx.team,
    };
  }

  function fallbackPick(state, ctx) {
    const ids = candidates(state);
    if (!ids.length) return null;
    const id = ids[Math.floor(Math.random() * ids.length)];
    return {
      id: id, side: ctx.side, why: ['位置：按英雄池凑满阵容（职业数据不足的替补方案）'],
      sidePlan: ctx.team, team: ctx.team,
    };
  }

  function banPlan(state, ctx) {
    const ids = banCandidates(state, ctx);
    if (!ids.length) return null;
    const ranked = [];
    for (let i = 0; i < ids.length; i++) {
      const d = evalBan(ctx, ids[i]);
      d.score += (Math.random() - 0.5) * 1.6;
      ranked.push(d);
    }
    ranked.sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const why = best.why.slice(0, 4);
    if (ctx.enemyStyle) why.push('体系：' + ctx.enemyTeam + ' 打 ' + ctx.enemyStyle.cn + '，先拆他的关键件');
    why.push('顺序：' + (ctx.banPhase === 1 ? '一轮 ban 先处理对面最舒服的点' : '二轮 ban 针对已经亮出来的组合'));
    return {
      id: best.id, side: ctx.side, score: best.score, why: why,
      sidePlan: ctx.team + ' · ' + (ctx.style ? ctx.style.cn : '') + ' → 拆 ' + ctx.enemyTeam,
      team: ctx.team,
    };
  }

  // 给人类玩家的推荐
  function suggest(state, n) {
    const ctx = ctxOf(state, null);
    if (!ctx) return [];
    const ids = ctx.st.type === 'ban' ? banCandidates(state, ctx) : pickCandidates(state, ctx);
    const arr = [];
    for (let i = 0; i < ids.length; i++) {
      const d = ctx.st.type === 'ban' ? evalBan(ctx, ids[i]) : evalPick(ctx, ids[i]);
      if (d) arr.push(d);
    }
    arr.sort((a, b) => b.score - a.score);
    return arr.slice(0, n || 6).map((x) => x.id);
  }

  // 兼容旧接口
  function pickDetail(state) {
    const ctx = ctxOf(state, null);
    if (!ctx) return null;
    const p = pickPlan(state, ctx);
    return p;
  }
  function banDetail(state) {
    const ctx = ctxOf(state, null);
    if (!ctx) return null;
    return banPlan(state, ctx);
  }
  function aiChoose(state) {
    const p = plan(state, null);
    return p && p.id ? p.id : null;
  }
  // 职业口径的位置判断：analysis / 编辑器 / 提示都用它
  function fits(id, role) { return !!(S && S.fitsRole ? S.fitsRole(id, role) : (proRoles(id) && proRoles(id)[role])); }

  // 覆盖 Draft 的旧实现
  Object.assign(window.Draft, {
    aiPlan: plan, aiChoose: aiChoose, suggest: suggest,
    pickDetail: pickDetail, banDetail: banDetail,
    playerScore: playerScore, fits: fits,
    proRoles: proRoles, assignRoles: assignRoles,
  });
  window.AIBP = {
    plan: plan, pickPlan: pickPlan, banPlan: banPlan, evalPick: evalPick, evalBan: evalBan,
    suggest: suggest, assignRoles: assignRoles, proRoles: proRoles, fits: fits,
    playerScore: playerScore, comfortScore: comfortScore, ctxOf: ctxOf,
  };
})();
