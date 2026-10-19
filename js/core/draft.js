// BP 引擎：赛制、无畏征召、AI 对手
(function () {
  const R = window.RULES;

  // 英雄可打的位置（来自 CHAMP_META）
  function champPos(id) {
    const m = (window.CHAMP_META || {})[id];
    if (!m) return [];
    return m.split('|')[0].split(',').map((x) => x.trim()).filter(Boolean);
  }
  function champDmg(id) {
    const m = (window.CHAMP_META || {})[id];
    return m ? m.split('|')[1] : 'M';
  }
  function champTags(id) {
    const m = (window.CHAMP_META || {})[id];
    return m ? (m.split('|')[2] || '').split(',').filter(Boolean) : [];
  }
  const POS2ROLE = { t: 'top', j: 'jg', m: 'mid', b: 'bot', s: 'sup' };
  function fits(id, role) {
    return champPos(id).some((p) => POS2ROLE[p] === role);
  }
  window.ChampUtil = { champPos, champDmg, champTags, fits, POS2ROLE };

  function newSeries(cfg) {
    const s = {
      cfg: Object.assign({}, R.DEFAULTS, cfg || {}),
      score: {},   // 按队伍名统计本系列赛胜场
      games: [],
      lockedPicks: [],   // 无双边：此前小局已被选用
      lockedBans: [],    // 硬核模式：此前小局已被禁用
      cur: null,
      over: false,
      winner: null,
      teams: { blue: '', red: '' },
      firstBlue: '',
      firstRed: '',
    };
    return s;
  }

  function startGame(s, blue, red) {
    s.teams = { blue: blue, red: red };
    s.cur = {
      no: s.games.length + 1,
      blue: blue,
      red: red,
      step: 0,
      picks: { blue: [], red: [] },
      bans: { blue: [], red: [] },
      history: [],
      over: false,
      winner: null,
    };
    return s.cur;
  }

  function curStep(s) {
    if (!s.cur) return null;
    return R.STEPS[s.cur.step] || null;
  }

  function usedNow(g) {
    return g.picks.blue.concat(g.picks.red, g.bans.blue, g.bans.red);
  }

  // 英雄是否可选
  function available(s, id) {
    const g = s.cur;
    if (!g) return false;
    if (usedNow(g).indexOf(id) >= 0) return false;
    if (s.cfg.fearless) {
      if (s.lockedPicks.indexOf(id) >= 0) return false;
      if (s.cfg.banCarry && s.lockedBans.indexOf(id) >= 0) return false;
    }
    return true;
  }

  function availList(s) {
    return (window.CHAMPIONS || []).filter((c) => available(s, c.i));
  }

  function commit(s, id) {
    const g = s.cur;
    const st = curStep(s);
    if (!st || g.over) return null;
    if (!available(s, id)) return null;
    g.history.push({ side: st.side, type: st.type, id: id, step: g.step });
    if (st.type === 'ban') g.bans[st.side].push(id);
    else g.picks[st.side].push(id);
    g.step++;
    if (g.step >= R.STEPS.length) g.step = R.STEPS.length;
    return st;
  }

  function undo(s) {
    const g = s.cur;
    if (!g || !g.history.length) return false;
    const last = g.history.pop();
    const arr = last.type === 'ban' ? g.bans[last.side] : g.picks[last.side];
    const i = arr.lastIndexOf(last.id);
    if (i >= 0) arr.splice(i, 1);
    g.step = last.step;
    return true;
  }

  function bpComplete(s) {
    const g = s.cur;
    return !!g && g.step >= R.STEPS.length;
  }

  // 结束本小局
  function finishGame(s, winnerSide, result) {
    const g = s.cur;
    if (!g) return;
    g.over = true;
    g.winner = winnerSide;
    if (result) { g.kills = result.kills; g.duration = result.duration; g.mvp = result.mvp; }
    const wTeam = g[winnerSide];
    s.score[wTeam] = (s.score[wTeam] || 0) + 1;
    s.games.push(g);
    // 无畏征召：本局所有选用英雄进入全局池
    if (s.cfg.fearless) {
      s.lockedPicks = s.lockedPicks.concat(g.picks.blue, g.picks.red);
      if (s.cfg.banCarry) s.lockedBans = s.lockedBans.concat(g.bans.blue, g.bans.red);
    }
    const need = R.SERIES[s.cfg.mode];
    const bw = s.score[g.blue] || 0, rw = s.score[g.red] || 0;
    if (bw >= need || rw >= need) {
      s.over = true;
      s.winner = bw >= need ? g.blue : g.red;   // 队名，不是边
    }
  }

  // 全局池（用于界面展示）
  function seriesPool(s) {
    const g = s.cur;
    const nowPicks = g ? g.picks.blue.concat(g.picks.red) : [];
    const nowBans = g ? g.bans.blue.concat(g.bans.red) : [];
    return {
      picked: s.lockedPicks.concat(nowPicks),
      banned: s.cfg.banCarry ? s.lockedBans.concat(nowBans) : nowBans,
    };
  }

  // ============ 强度评估 & AI ============
  // 说明：本文件在 index.html 里先于 meta.js / analysis.js / prostats.js 之后的脚本执行顺序加载，
  // 所以这里一律用惰性 getter，调用时再取全局对象。

  function meta() { return window.META || null; }
  function an() { return window.Analyze || null; }
  function ps() { return window.PROSTATS || null; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function playerOf(team, role) {
    const ps2 = window.PLAYERS || [];
    const ok = (p) => p.t === team || p.t === '__pool__';
    return ps2.find((p) => ok(p) && p.r === role && !p.sub) || ps2.find((p) => ok(p) && p.r === role);
  }
  function rosterOf(team) {
    return (window.PLAYERS || []).filter((p) => p.t === team || p.t === '__pool__');
  }
  window.playerOf = playerOf;
  window.rosterOf = rosterOf;

  function playerScore(p) {
    if (!p) return 75;
    return p.a * 0.3 + p.d * 0.24 + p.f * 0.26 + p.b * 0.2;
  }

  // 单个位置的强度：选手 + 英雄契合
  function laneScore(team, role, champId) {
    const p = playerOf(team, role);
    let v = playerScore(p);
    if (champId) {
      if (fits(champId, role)) v += 4;
      else v -= 10;
      if (p && p.s && p.s.indexOf(champId) >= 0) v += 6;
      const tags = champTags(champId);
      if (tags.indexOf('scale') >= 0) v += 1;
    }
    return v;
  }
  window.laneScore = laneScore;

  // 真实数据里该英雄打这个位置的强度
  function roleStat(champId, role) {
    const P = ps();
    const c = P && P.champs[champId];
    const st = c && c.roles ? c.roles[role] : null;
    return st || null;
  }

  // 敌方体系 → META.ANSWER 的键
  const ANSWER_KEY = {
    front: 'tank', dive: 'dive', engage: 'engage', poke: 'poke', pick: 'engage',
    split: 'split', siege: 'engage', scale: 'hypercarry', wombo: 'wombo', disengage: 'engage',
  };

  // 一支已选阵容当前最像什么体系（懒计算 + 按内容记忆，避免每步重复算）
  const PROF_MEMO = {};
  function profileOf(picks, enemy) {
    const A = an();
    if (!A) return null;
    const key = picks.join(',') + '#' + enemy.join(',');
    if (!PROF_MEMO[key]) {
      if (Object.keys(PROF_MEMO).length > 3000) { Object.keys(PROF_MEMO).forEach((k) => { delete PROF_MEMO[k]; }); }
      PROF_MEMO[key] = A.compProfile(picks, enemy);
    }
    return PROF_MEMO[key];
  }

  // 这组英雄能不能一人一个位置摆满（AI 不能选到没法分路的阵容）
  const COVER_MEMO = {};
  function coverInfo(ids) {
    const key = ids.join(',');
    if (COVER_MEMO[key]) return COVER_MEMO[key];
    const roles = R.ROLES;
    const used = [];
    const map = {};
    let ok = false;
    const go = (i) => {
      if (i === ids.length) { ok = true; return true; }
      for (let r = 0; r < roles.length; r++) {
        if (used[r] || !fits(ids[i], roles[r])) continue;
        used[r] = 1; map[roles[r]] = ids[i];
        if (go(i + 1)) return true;
        used[r] = 0; delete map[roles[r]];
      }
      return false;
    };
    go(0);
    const out = { ok: ok, map: ok ? Object.assign({}, map) : null };
    if (Object.keys(COVER_MEMO).length > 3000) { Object.keys(COVER_MEMO).forEach((k) => { delete COVER_MEMO[k]; }); }
    COVER_MEMO[key] = out;
    return out;
  }

  // 英雄中文名（惰性取，避免脚本顺序问题）
  const CH_NAME = {};
  function champName(id) {
    if (!CH_NAME[id]) {
      const arr = window.CHAMPIONS || [];
      for (let i = 0; i < arr.length; i++) if (arr[i].i === id) { CH_NAME[id] = arr[i].c; break; }
      if (!CH_NAME[id]) CH_NAME[id] = id;
    }
    return CH_NAME[id];
  }
  const ROLE_CN = R.ROLE_CN;

  // AI 人设：同一套数据，不同打法侧重不同
  const AI_PROFILES = {
    control: {
      k: 'control', cn: '运营流', tip: '重视体系完整与对位不崩，偏爱后期曲线',
      w: { arch: 1.12, combo: 1.1, counter: 0.92, meta: 1.0, front: 1.15, engage: 0.95, answer: 1.0, risk: 0.75, flex: 0.95 },
    },
    tempo: {
      k: 'tempo', cn: '节奏流', tip: '偏爱强势对线、开团与前期节奏，敢拿上限高的英雄',
      w: { arch: 0.9, combo: 0.98, counter: 1.12, meta: 1.05, front: 0.95, engage: 1.2, answer: 0.92, risk: 1.3, flex: 1.1 },
    },
  };
  const PROFILE_LIST = [AI_PROFILES.control, AI_PROFILES.tempo];

  // 选边优先级（同时写进 AI 思路与帮助页）
  const SIDE_PLAN = {
    blue: '蓝色方一抢拿版本第一梯队或能摇摆的英雄（对手没法针对），二轮补体系短板，末手留对线强势位',
    red: '红色方首轮反手拿克制/摇摆，中段保体系，最后一手留给 counter pick —— 后手权是红方最大的资产',
  };
  function sidePlan(side) { return SIDE_PLAN[side] || ''; }

  // 给队伍挑英雄的评分 + 思路（AI 用）
  // 评分 = 选手/位置 + 版本强度 + 协同/克制/体系完成度 + 见招拆招 + 选边优先级
  function pickDetail(s, side, champId, profile) {
    const g = s.cur;
    const team = g[side];
    const oppSide = side === 'blue' ? 'red' : 'blue';
    const picked = g.picks[side];
    const opp = g.picks[oppSide];
    const A = an();
    const MT = meta();
    const W = (profile && profile.w) || AI_PROFILES.control.w;
    const rows = [];
    const add = (imp, text) => { if (imp > 0.45) rows.push({ imp: imp, text: text }); };

    // 1) 位置：优先还没人顶的空位，摇摆英雄按最合适的位置算
    const open = R.ROLES.filter((r) => !picked.some((id) => fits(id, r)));
    const roles = open.length ? open : R.ROLES;
    let lane = -999, laneRole = roles[0];
    roles.forEach((r) => {
      const p = playerOf(team, r);
      let vv = playerScore(p);
      if (fits(champId, r)) vv += 6; else vv -= 13;
      if (p && p.s && p.s.indexOf(champId) >= 0) vv += 7;
      const rs = roleStat(champId, r);
      if (rs && rs.p >= 6) vv += clamp((rs.wr - 50) * 0.12, -2, 2.5) + Math.min(2, rs.p / 10);
      if (vv > lane) { lane = vv; laneRole = r; }
    });
    let v = (lane - 76) * 1.15;
    if (!fits(champId, laneRole)) v -= 6;
    const sigPlayer = playerOf(team, laneRole);
    const isSig = !!(sigPlayer && sigPlayer.s && sigPlayer.s.indexOf(champId) >= 0);
    add((lane - 76) * 1.15, '位置与选手：' + (sigPlayer ? sigPlayer.n : team) + ' 的' + ROLE_CN[laneRole] +
      (isSig ? '本命英雄，熟练度满格' : '位，属性与英雄模型对得上'));

    // 2) 分路可行性：选完这手必须还能一人一个位置摆满
    const trial = picked.concat([champId]);
    const cov = coverInfo(trial);
    if (!cov.ok) v -= 24 + trial.length * 9;

    // 补位：还有完全没人顶的位置，且这个英雄正好能打
    const emptyRoles = R.ROLES.filter((r) => !picked.some((id) => fits(id, r)));
    const fillsEmpty = emptyRoles.filter((r) => fits(champId, r));
    if (fillsEmpty.length) {
      let fillImp = 2.6 + picked.length * 0.9;
      const left = 5 - picked.length;
      if (emptyRoles.length >= left) fillImp += 2.5;
      v += fillImp;
      add(fillImp, '阵容结构：' + fillsEmpty.map((r) => ROLE_CN[r]).join('/') + ' 还没人打，这手正好补位');
    }
    if (laneRole === 'sup' && picked.length < 2 && champPos(champId).length < 2) v -= 5;

    // 3) 版本强度（S16 为主）
    const cp = A ? A.champPower(champId) : 4;
    const metaImp = (cp - 4.6) * 2.0 * W.meta;
    v += metaImp;
    const P = ps();
    const st = P && P.champs[champId];
    if (st) {
      add(metaImp, 'S16 版本强度：梯队 ' + cp.toFixed(1) + '/10' +
        (st.pr ? '，BP 率 ' + st.pr + '%' : '') + (st.wr ? '、胜率 ' + st.wr + '%' : '') + '（2026 赛季样本）');
    } else {
      add(metaImp, '版本强度：梯队 ' + cp.toFixed(1) + '/10（暂无 2026 出场样本，按属性模型评估）');
    }

    // 4) 阵容画像的边际收益：体系完成度、协同、同位置克制、版本契合、伤害结构
    let bestArch = null;
    if (A) {
      const p0 = profileOf(picked, opp);
      const p1 = profileOf(picked.concat([champId]), opp);
      if (p0 && p1) {
        if (p0.arch && p0.arch[0] && p1.arch && p1.arch[0]) {
          const d = (p1.arch[0].score - p0.arch[0].score) * 0.55 * W.arch;
          v += d;
          bestArch = p1.arch[0];
          add(d, '体系收益：把阵容往「' + p1.arch[0].cn + '」上推，完成度 ' + Math.round(p0.arch[0].score) +
            ' → ' + Math.round(p1.arch[0].score));
        }
        const dCombo = (p1.sc.combo - p0.sc.combo) * 0.32 * W.combo;
        const dCounter = (p1.sc.counter - p0.sc.counter) * 0.42 * W.counter;
        const dFront = (p1.sc.front - p0.sc.front) * 0.28 * W.front;
        const dEngage = (p1.sc.engage - p0.sc.engage) * 0.16 * W.engage;
        v += dCombo + dCounter + dFront + dEngage;
        if (dFront + dEngage > 0) add(dFront + dEngage, '团战结构：' + (dFront > dEngage ? '补上了前排承伤' : '补上了开团手段') + '，阵型不再虚');
        if (dCombo > 0.8) add(dCombo, '英雄协同：和已选英雄能打出配合');
        if (dCounter > 0.8) add(dCounter, '对位面板：同位置能压住对面');
      }
    }

    // 5) 见招拆招：敌方体系已经成型时，优先拿能拆它的英雄
    if (MT && opp.length >= 2 && A) {
      const oProf = profileOf(opp, picked);
      const oArch = oProf && oProf.arch;
      if (oArch && oArch.length) {
        let bestAns = 0, ansArch = null;
        oArch.slice(0, 2).forEach((ar) => {
          if (!ar || ar.score < 66) return;
          const ans = MT.ANSWER[ANSWER_KEY[ar.k]] || null;
          if (ans && ans.indexOf(champId) >= 0) {
            const val = 9 + (ar.score - 66) * 0.3;
            if (val > bestAns) { bestAns = val; ansArch = ar; }
          }
        });
        if (bestAns) {
          bestAns *= W.answer;
          v += bestAns;
          add(bestAns, '见招拆招：对面「' + ansArch.cn + '」已经成型（' + Math.round(ansArch.score) +
            ' 分），这张是克制牌，能拆掉他们的赢法');
        }
      }
    }

    // 6) 与敌方现有英雄的机制强弱
    if (MT) {
      let mechImp = 0;
      opp.forEach((oid) => {
        const c = MT.counter(champId, oid);
        if (c !== 0) mechImp += c > 0 ? c * 0.6 : c * 1.15;
      });
      v += mechImp;
      if (mechImp > 1.4) add(mechImp, '机制克制：对面前几手有几个英雄被这张卡得很死');
    }

    // 7) 选边优先级：蓝方一抢摇摆/版本，红方末手 counter
    const isFirst = picked.length === 0;
    const isLast = picked.length === 4;
    if (side === 'blue' && isFirst) {
      const flexN = champPos(champId).length;
      const imp = (flexN >= 2 ? 2.4 : 0) + (cp >= 6.2 ? 1.6 : 0);
      v += imp;
      if (imp > 0) add(imp, '选边优先级：蓝方一抢' + (flexN >= 2 ? '拿摇摆位，红方没法针对' : '拿版本强势，先把对线压住'));
    }
    if (side === 'red' && isLast && opp.length >= 3) {
      let cImp = 0;
      opp.forEach((oid) => {
        const c = MT ? MT.counter(champId, oid) : 0;
        if (c > 0) cImp += c * 0.5;
      });
      if (cImp > 0.5) {
        cImp *= W.counter;
        v += cImp;
        add(cImp, '选边优先级：红方最后一手留给 counter，A 一下就能打穿对面已选的点');
      }
    }

    // 8) 人设：节奏流偏爱前期能动手的英雄
    if (profile && profile.k === 'tempo') {
      const tags = champTags(champId);
      let aggr = 0;
      if (tags.indexOf('early') >= 0) aggr += 1.6;
      if (tags.indexOf('dive') >= 0 || tags.indexOf('engage') >= 0) aggr += 1.1;
      if (tags.indexOf('scale') >= 0) aggr -= 1.2;
      aggr *= W.risk;
      v += aggr;
      if (aggr > 0.8) add(aggr, '风格偏好（节奏流）：这张前期就能做事，不等后期');
    }

    // 9) 小扰动，避免每局完全一样
    v += Math.random() * 3.5;
    return { v: v, why: rows, role: laneRole, cov: cov, arch: bestArch };
  }

  // 禁忌/禁用评分 + 思路
  function banDetail(s, side, champId, profile) {
    const g = s.cur;
    const oppSide = side === 'blue' ? 'red' : 'blue';
    const oppTeam = g[oppSide];
    const oppPicks = g.picks[oppSide];
    const myPicks = g.picks[side];
    const MT = meta();
    const A = an();
    const W = (profile && profile.w) || AI_PROFILES.control.w;
    const rows = [];
    const add = (imp, text) => { if (imp > 0.45) rows.push({ imp: imp, text: text }); };
    let v = 0;

    // 1) 版本 OP：真实 BP 率 + 胜率（以 S16 为主）
    const P = ps();
    const st = P && P.champs[champId];
    if (st) {
      const opImp = Math.min(9, (st.b || 0) * 0.3 + (st.pr || 0) * 0.12) +
        clamp(((st.wr || 50) - 50) * 0.25, -3, 4);
      v += opImp;
      const pr = st.pr || 0;
      const wr = st.wr || 50;
      const opTxt = pr >= 35 ? '版本 T0：S16 BP 率 ' + pr + '%、胜率 ' + wr + '%，放出来基本等于送'
        : pr >= 12 ? '版本热门：S16 BP 率 ' + pr + '%、胜率 ' + wr + '%，不按大概率被对面抢走'
        : '顺手针对：S16 BP 率 ' + pr + '%、胜率 ' + wr + '%（样本不多，但优先级摆在这）';
      add(opImp, opTxt);
    }

    // 2) 对手招牌英雄
    let sigImp = 0, sigWho = null;
    rosterOf(oppTeam).forEach((p) => {
      if (p.s && p.s.indexOf(champId) >= 0) {
        const open = !oppPicks.some((id) => fits(id, p.r));
        const imp = (open ? 12 : 5) + (playerScore(p) - 78) * 0.55;
        if (imp > sigImp) { sigImp = imp; sigWho = p; }
        v += imp;
      }
    });
    if (sigImp) add(sigImp, '针对选手：' + (sigWho ? sigWho.n : oppTeam) + ' 的招牌英雄，按掉能砍他一整条对线');

    // 3) 对手体系缺口：ban 掉他们最需要的那块
    if (MT && A && oppPicks.length >= 2) {
      const prof = profileOf(oppPicks, myPicks);
      const arch = prof && prof.arch[0];
      const def = arch && MT.ARCH_BY_K[arch.k];
      if (def && def.need) {
        const tags = champTags(champId);
        let needImp = 0;
        Object.keys(def.need).forEach((t) => { if (tags.indexOf(t) >= 0) needImp += 4.2; });
        if (needImp) {
          v += needImp;
          add(needImp, '拆体系：对面「' + arch.cn + '」正缺这类英雄，这一 ban 卡住他的成型路线');
        }
      }
    }

    // 4) 能克制我们已选英雄的，优先按掉
    if (MT) {
      let cImp = 0;
      myPicks.forEach((mid) => {
        const c = MT.counter(champId, mid);
        if (c >= 3) cImp += c * 0.85;
      });
      if (cImp) {
        cImp *= W.counter;
        v += cImp;
        add(cImp, '保护自己：这张打我们已选的英雄太舒服，先按掉');
      }
    }

    // 5) 摇摆英雄更值得 ban
    if (champPos(champId).length >= 2) {
      const fImp = 2.5 * W.flex;
      v += fImp;
      add(fImp, '摇摆位：他拿去打哪路都不知道，ban 掉最省心');
    }

    // 6) 红方一ban更愿意按版本 T0（蓝方一抢的威胁）
    if (side === 'red' && g.bans[side].length === 0 && st) {
      const t0 = clamp((st.pr || 0) * 0.08, 0, 3);
      v += t0;
      add(t0, '选边优先级：红方首个 ban 优先拆掉蓝方一抢的 T0');
    }

    v += Math.random() * 4;
    return { v: v, why: rows, role: null };
  }

  function pickScore(s, side, champId) { return pickDetail(s, side, champId, null).v; }
  function banScore(s, side, champId) { return banDetail(s, side, champId, null).v; }

  // AI 完整决策：返回英雄 + 这步的理由（ban/pick 都有）
  function aiPlan(s, opts) {
    const st = curStep(s);
    if (!st) return null;
    const list = availList(s);
    if (!list.length) return null;
    const profile = (opts && opts.profile) || AI_PROFILES.control;
    let best = null;
    list.forEach((c) => {
      const d = st.type === 'ban' ? banDetail(s, st.side, c.i, profile) : pickDetail(s, st.side, c.i, profile);
      if (!best || d.v > best.v) best = { id: c.i, v: d.v, why: d.why, role: d.role };
    });
    if (!best) return null;
    best.why.sort((a, b) => b.imp - a.imp);
    return {
      id: best.id,
      side: st.side,
      type: st.type,
      val: Math.round(best.v * 10) / 10,
      role: best.role || null,
      why: best.why.slice(0, 3).map((x) => x.text),
      profile: profile,
      sidePlan: sidePlan(st.side),
    };
  }

  function aiChoose(s, opts) {
    const p = aiPlan(s, opts);
    return p ? p.id : null;
  }

  // 推荐（给玩家的提示，取前 5）
  function suggest(s, n) {
    const st = curStep(s);
    if (!st) return [];
    const scored = availList(s).map((c) => ({
      id: c.i,
      v: st.type === 'ban' ? banScore(s, st.side, c.i) : pickScore(s, st.side, c.i),
    }));
    scored.sort((a, b) => b.v - a.v);
    return scored.slice(0, n || 5).map((x) => x.id);
  }

  window.Draft = {
    newSeries, startGame, curStep, available, availList, commit, undo,
    bpComplete, finishGame, seriesPool, pickScore, banScore, pickDetail, banDetail,
    aiChoose, aiPlan, suggest, sidePlan, AI_PROFILES, PROFILE_LIST, champName,
    playerScore, fits, champPos, champDmg, champTags, playerOf, rosterOf, POS2ROLE,
  };
})();
