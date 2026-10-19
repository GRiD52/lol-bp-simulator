// 阵容分析 v2：体系识别、组合协同、克制对位、强势期、真实赛事数据、胜率模型
// 模型口径（对齐用户要求）：纸面实力约占胜负 30%，BP/阵容合理性约占 33%，其余交给局内执行。
(function () {
  const R = window.RULES;
  const CU = window.ChampUtil;
  const D = window.Draft;
  const M = window.META || null;
  const PS = window.PROSTATS || { champs: {}, duos: {}, pairs: {}, counters: {} };
  const CH = {};
  (window.CHAMPIONS || []).forEach((c) => { CH[c.i] = c; });
  const cn = (id) => (CH[id] && CH[id].t) || id || '';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sigmoid = (z) => 1 / (1 + Math.exp(-z));

  const DIMS = [
    { k: 'front', cn: '前排坦度' },
    { k: 'engage', cn: '开团' },
    { k: 'cc', cn: '控制链' },
    { k: 'burst', cn: '爆发' },
    { k: 'dps', cn: '持续输出' },
    { k: 'poke', cn: '消耗/清线' },
    { k: 'scale', cn: '后期成长' },
    { k: 'early', cn: '前期节奏' },
    { k: 'sustain', cn: '续航保护' },
    { k: 'split', cn: '单带分推' },
    { k: 'combo', cn: '组合协同' },
    { k: 'counter', cn: '对位克制' },
    { k: 'meta', cn: '版本契合' },
  ];

  const ROLE_W = { top: 0.2, jg: 0.22, mid: 0.24, bot: 0.22, sup: 0.12 };

  function tagCount(ids, t) {
    let n = 0;
    ids.forEach((id) => { if (id && CU.champTags(id).indexOf(t) >= 0) n++; });
    return n;
  }
  function tagsOf(id) { return id ? CU.champTags(id) : []; }
  function has(id, t) { return tagsOf(id).indexOf(t) >= 0; }

  // ===== 真实赛事数据 =====
  function champStat(id) { return PS.champs[id] || null; }
  // 版本强度 0-10
  function champPower(id) {
    const s = champStat(id);
    if (!s) return 4;
    let v = 4 + Math.min(3.2, (s.pr || 0) / 22) + clamp(((s.wr || 50) - 50) * 0.16, -2, 2);
    return clamp(v, 0.5, 10);
  }
  function champTier(id) {
    const p = champPower(id);
    return p >= 8 ? 'T1' : p >= 6.5 ? 'T2' : p >= 5 ? 'T3' : 'T4';
  }

  // ===== 体系识别 =====
  function archFit(ids) {
    if (!M) return [];
    const valid = ids.filter(Boolean);
    return M.ARCH.map((a) => {
      const need = a.need || {};
      const w = a.w || {};
      let got = 0;
      let total = 0;
      let surplus = 0;
      Object.keys(need).forEach((t) => {
        const want = need[t];
        const weight = w[t] || 1;
        const n = tagCount(valid, t);
        total += weight;
        got += weight * Math.min(1, n / want);
        if (n >= want + 1) surplus += 1;
      });
      const f = total ? got / total : 0;
      let score = 36 + 52 * f + Math.min(6, surplus * 2);
      // 招牌标签门槛：没有这个体系的标志性英雄，再像也只是「形似」
      const sig = a.sig || {};
      Object.keys(sig).forEach((t) => {
        if (tagCount(valid, t) < sig[t]) score -= 26;
      });
      return { k: a.k, cn: a.cn, short: a.short, tip: a.tip, prio: a.prio || 5,
        score: clamp(Math.round(score), 5, 98), strong: a.strong, weak: a.weak };
    }).sort((x, y) => (y.score - x.score) || (y.prio - x.prio));
  }

  // 双人协同
  function synergyInfo(picks) {
    if (!M) return { best: null, list: [], duo: null, duoStat: null, sum: 0 };
    const list = [];
    for (let i = 0; i < picks.length; i++) {
      for (let j = i + 1; j < picks.length; j++) {
        if (!picks[i] || !picks[j]) continue;
        const v = M.synergy(picks[i], picks[j]);
        if (v >= 6) {
          const d = M.duo(picks[i], picks[j]);
          list.push({ a: picks[i], b: picks[j], v: v, style: d ? d[1] : 'pair', name: d ? d[2] : '' });
        }
      }
    }
    list.sort((x, y) => y.v - x.v);
    const adc = picks[3], sup = picks[4];
    let duo = null, duoStat = null;
    if (adc && sup) {
      duo = M.duo(adc, sup);
      const k = adc < sup ? adc + '|' + sup : sup + '|' + adc;
      duoStat = PS.duos[k] || null;
    }
    return { best: list[0] || null, list: list.slice(0, 3), duo: duo, duoStat: duoStat, sum: list.reduce((s, x) => s + x.v, 0) };
  }

  // 克制信息：按位置对位 + 团队机制
  function counterInfo(ids, enemyIds) {
    if (!M) return { sum: 0, lanes: [], tricks: [] };
    const out = { sum: 0, lanes: [], tricks: [] };
    R.ROLES.forEach((role, i) => {
      const a = ids[i], b = enemyIds[i];
      if (!a || !b) return;
      const v = M.counter(a, b);
      if (v) {
        out.sum += v * (role === 'top' || role === 'mid' ? 1.1 : 1);
        const why = M.counterWhy(a, b);
        out.lanes.push({ role: role, a: a, b: b, v: v, why: why ? why.why : '' });
      }
    });
    // 塞拉斯偷大招类机制：整队结算
    const enemyHasSylas = enemyIds.indexOf('Sylas') >= 0;
    if (enemyHasSylas) {
      ids.forEach((id) => {
        if (!id || id === 'Sylas') return;
        const v = M.counter('Sylas', id);
        if (v >= 4) {
          const why = M.counterWhy('Sylas', id);
          out.tricks.push({ own: id, v: v, why: why ? why.why : '偷大招' });
          out.sum -= v * 0.7;
        }
      });
    }
    return out;
  }

  // 自动分配（保留原逻辑，额外奖励「位置契合 + 组合协同」）
  function autoAssign(picks) {
    if (!picks || picks.length !== 5) {
      const m0 = {};
      R.ROLES.forEach((r, i) => { m0[r] = picks && picks[i] ? picks[i] : null; });
      return m0;
    }
    const roles = R.ROLES;
    const best = { v: -1e9, map: null };
    const perm = (arr, rest) => {
      if (!rest.length) {
        let v = 0;
        for (let i = 0; i < roles.length; i++) {
          const id = arr[i];
          v += CU.fits(id, roles[i]) ? 10 : -12;
          if (CU.champPos(id).length > 1) v += 1;
        }
        if (M) {
          for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) v += M.synergy(arr[i], arr[j]) * 0.35;
        }
        if (v > best.v) { best.v = v; best.map = arr.slice(); }
        return;
      }
      for (let i = 0; i < rest.length; i++) {
        perm(arr.concat(rest[i]), rest.slice(0, i).concat(rest.slice(i + 1)));
      }
    };
    perm([], picks.slice());
    const map = {};
    roles.forEach((r, i) => { map[r] = best.map ? best.map[i] : null; });
    return map;
  }

  // ===== 阵容画像 =====
  function compProfile(ids, enemyIds) {
    const valid = ids.filter(Boolean);
    const p = {};
    DIMS.forEach((d) => { p[d.k] = 0; });
    p.front = tagCount(valid, 'front') + tagCount(valid, 'antitank') * 0.35;
    p.engage = tagCount(valid, 'engage') + tagCount(valid, 'cc') * 0.25;
    p.cc = tagCount(valid, 'cc') + tagCount(valid, 'engage') * 0.3;
    p.burst = tagCount(valid, 'burst') + tagCount(valid, 'early') * 0.15;
    p.dps = valid.filter((id) => CU.champDmg(id) !== 'P').length * 0.6 + tagCount(valid, 'scale') * 0.4;
    p.poke = tagCount(valid, 'poke') + tagCount(valid, 'wave') * 0.3;
    p.scale = tagCount(valid, 'scale');
    p.early = tagCount(valid, 'early');
    p.sustain = tagCount(valid, 'sustain') + tagCount(valid, 'heal') * 0.5 + tagCount(valid, 'util') * 0.3;
    p.split = tagCount(valid, 'split');
    p.mobi = tagCount(valid, 'mobi');

    const sc = {};
    const norm = (x, base, step) => clamp(base + x * step, 8, 99);
    sc.front = norm(p.front, 30, 17);
    sc.engage = norm(p.engage, 28, 18);
    sc.cc = norm(p.cc, 32, 16);
    sc.burst = norm(p.burst, 32, 16);
    sc.dps = norm(p.dps, 34, 14);
    sc.poke = norm(p.poke, 30, 17);
    sc.scale = norm(p.scale, 30, 15);
    sc.early = norm(p.early, 30, 15);
    sc.sustain = norm(p.sustain, 32, 16);
    sc.split = norm(p.split, 26, 19);

    const ad = valid.filter((id) => CU.champDmg(id) === 'A').length;
    const ap = valid.filter((id) => CU.champDmg(id) === 'P').length;
    const mix = valid.length - ad - ap;
    p.dmgAd = ad; p.dmgAp = ap; p.dmgMix = mix;
    const totalDmg = ad + ap + mix * 0.5 || 1;
    const adR = (ad + mix * 0.5) / totalDmg;
    const apR = (ap + mix * 0.5) / totalDmg;
    sc.balance = Math.round(100 - Math.abs(adR - apR) * 70);

    // 曲线
    let curve = 50 + (p.scale - p.early) * 9;
    curve = clamp(curve, 5, 95);
    sc.curve = curve;

    // 组合协同 / 克制 / 版本
    const syn = synergyInfo(ids);
    if (syn.duoStat && syn.duoStat.n >= 12 && syn.duoStat.wr < 45) syn.trap = true;
    const ctr = counterInfo(ids, enemyIds || []);
    sc.combo = clamp(28 + syn.sum * 4.2 + (syn.duo ? syn.duo[0] * 2.4 : 0) + (syn.duoStat ? (syn.duoStat.wr - 50) * 0.5 : 0) - (syn.trap ? 9 : 0), 8, 98);
    sc.counter = clamp(50 + ctr.sum * 3.4, 8, 96);
    let pw = 0; valid.forEach((id) => { pw += champPower(id); });
    sc.meta = clamp(45 + (valid.length ? pw / valid.length - 4 : 0) * 6.5, 10, 97);

    const keys = DIMS.map((d) => d.k);
    let sum = 0;
    keys.forEach((k) => { sum += sc[k]; });
    let comp = sum / keys.length;
    if (sc.front < 40) comp -= 3;
    if (sc.engage < 38) comp -= 3;
    if (ad === 0 || ap === 0) comp -= 4;
    if (valid.length < 5) comp = comp * (0.6 + valid.length * 0.08);

    return { raw: p, sc: sc, comp: comp, curve: curve, adR: adR, apR: apR, n: valid.length, syn: syn, ctr: ctr, arch: archFit(ids) };
  }

  // ===== 对位强度 =====
  function laneStrength(team, role, champ, player, opt) {
    const o = opt || {};
    const p = player || D.playerOf(team, role);
    const base = D.playerScore(p);
    if (!champ) return { p: p, champ: null, v: base, why: [], ctr: 0 };
    let v = base;
    if (CU.fits(champ, role)) v += 4; else v -= 11;
    if (p && p.s && p.s.indexOf(champ) >= 0) v += 5.5;
    const tags = CU.champTags(champ);
    if (tags.indexOf('scale') >= 0) v += 1.1;
    if (tags.indexOf('early') >= 0) v += 0.7;
    // 版本契合
    const st = champStat(champ);
    if (st && st.p >= 10) v += clamp((st.wr - 50) * 0.05, -2, 2) + clamp(st.pr / 30, 0, 2.4);
    // 同位置克制
    let ctr = 0;
    const why = [];
    if (o.opp && M) {
      ctr = M.counter(champ, o.opp);
      if (ctr) {
        v += ctr * 1.45;
        const w = M.counterWhy(champ, o.opp);
        if (w) why.push({ v: ctr, text: w.why });
      }
    }
    // 下路协同
    if (o.partner && M) {
      const syn = M.synergy(champ, o.partner);
      if (syn) v += (syn - 5) * 0.55;
      if (syn >= 8) {
        const d = M.duo(champ, o.partner);
        if (d) why.push({ v: 2, text: '与 ' + cn(o.partner) + ' 是成熟组合「' + d[2] + '」' });
      }
    }
    // 位置错配的克制关系不应被放大
    v = clamp(v, 50, 110);
    return { p: p, champ: champ, v: v, why: why, ctr: ctr };
  }

  // ===== 阵容质量（BP 合理性）=====
  function qualityOf(prof, ids, enemyIds, side, match) {
    const sc = prof.sc;
    const valid = ids.filter(Boolean);
    let q = 46;
    const flaws = [];
    const goods = [];

    // 结构完整性
    const front = tagCount(valid, 'front');
    const engage = tagCount(valid, 'engage') + tagCount(valid, 'pick');
    const cc = tagCount(valid, 'cc');
    if (front === 0) { q -= 9; flaws.push('没有真正的前排，团战只能靠先手秒人'); }
    else if (front === 1) { q -= 3; flaws.push('只有一个前排点，被开死之后阵型就散了'); }
    else { q += 4; }
    if (engage === 0) { q -= 7; flaws.push('没有任何硬开团，只能等对手失误打反手'); }
    else if (engage >= 2) { q += 4; }
    if (cc <= 1) { q -= 4; flaws.push('控制太少，抓单和越塔都很难做成'); }
    else if (cc >= 3) { q += 3; }

    // 伤害结构
    const ad = prof.raw.dmgAd + prof.raw.dmgMix * 0.5;
    const ap = prof.raw.dmgAp + prof.raw.dmgMix * 0.5;
    if (!ad) { q -= 10; flaws.push('全队零物理输出，对手堆护甲就能锁死'); }
    if (!ap) { q -= 8; flaws.push('全队零魔法输出，对手堆魔抗收益极高'); }
    if (ad && ap) { q += 4; }

    // 输出点数量
    const carries = valid.filter((id) => has(id, 'dps') || has(id, 'scale') || has(id, 'burst')).length;
    if (carries <= 1) { q -= 6; flaws.push('只有一个能打的输出点，被集火就没人接管比赛'); }
    if (carries >= 4) { q -= 4; flaws.push('四个点都要经济，资源分配会非常紧张'); }

    // 分路合理性
    const misfit = R.ROLES.filter((r) => ids[R.ROLES.indexOf(r)] && !CU.fits(ids[R.ROLES.indexOf(r)], r));
    if (misfit.length) { q -= 3 * misfit.length; flaws.push('有 ' + misfit.length + ' 个英雄不在本位置，线权会先丢一截'); }

    // 体系相性
    const top = prof.arch[0];
    if (top && top.score >= 74) { q += 5; }
    else if (top && top.score < 56) { q -= 4; flaws.push('五个人的定位各打各的，凑不成一套完整体系'); }

    // 组合协同
    if (prof.syn.duo && prof.syn.duo[0] >= 8) q += 5;
    if (prof.syn.list.length >= 2) q += 3;
    if (!prof.syn.duo && ids[3] && ids[4] && !CU.fits(ids[4], 'sup')) q -= 3;

    // 克制
    q += clamp(prof.ctr.sum * 1.4, -6, 7);

    // 版本契合
    const weakMeta = valid.filter((id) => champPower(id) <= 4).length;
    if (weakMeta >= 3) { q -= 3; flaws.push('三个以上点不在版本强度上，对线期就会吃亏'); }

    // 强势期互补
    if (sc.scale > 74 && sc.early < 42) { q -= 3; flaws.push('前期几乎没有节奏点，必须抗压到两件套'); }
    if (sc.early > 74 && sc.scale < 42) { q -= 2; flaws.push('全队都是前期节奏，拖到 25 分钟后会明显下滑'); }
    if (sc.scale >= 60 && sc.early >= 55) { q += 3; goods.push('前后期都有支点，节奏不容易被对面单方面带走'); }

    // 客观点：强组合/强克制
    if (prof.syn.best) goods.push('拥有 ' + cn(prof.syn.best.a) + ' + ' + cn(prof.syn.best.b) + ' 这套高强度组合');
    const bigCtr = prof.ctr.lanes.filter((x) => x.v >= 4);
    bigCtr.forEach((x) => goods.push(R.ROLE_CN[x.role] + '位 ' + cn(x.a) + ' 打 ' + cn(x.b) + ' 是明确优势对位'));

    return { q: clamp(Math.round(q), 5, 99), flaws: flaws, goods: goods };
  }

  // ===== 主分析 =====
  function analyze(match) {
    const out = {
      lanes: [], dims: [], notes: [], total: {}, prob: {}, verdict: null, curve: {},
      rating: {}, paper: {}, qual: {}, arch: {}, bpShare: 0, sample: (PS.sample || null),
    };
    const sides = ['blue', 'red'];
    const idsOf = (sd) => R.ROLES.map((r) => match[sd].assign[r]);
    const prof = {};
    sides.forEach((sd) => { prof[sd] = compProfile(idsOf(sd), idsOf(sd === 'blue' ? 'red' : 'blue')); });
    out.prof = prof;
    out.arch.blue = prof.blue.arch.slice(0, 3);
    out.arch.red = prof.red.arch.slice(0, 3);

    // 队伍风格 vs 这套阵容：体系契合度 + 舒适区英雄覆盖率
    const SD = window.StyleDB;
    out.styl = {};
    if (SD) {
      sides.forEach((sd) => {
        const team = match[sd].team;
        const st = SD.styleOf(team);
        let fit = 0;
        let n = 0;
        R.ROLES.forEach((r) => {
          const id = match[sd].assign[r];
          if (!id) return;
          fit += SD.slotFit(st, r, id) || 0;
          n++;
        });
        const confort = R.ROLES.filter((r) => {
          const id = match[sd].assign[r];
          if (!id) return false;
          const tp = SD.teamPickCount(team, id);
          const sig = st && st.sig && st.sig.indexOf(id) >= 0;
          return tp >= 2 || sig;
        }).length;
        const starGot = st && st.star ? st.star.filter((id) => R.ROLES.some((r) => match[sd].assign[r] === id)) : [];
        const pct = Math.round(Math.max(0, Math.min(100, (fit / Math.max(1, n)) / 4 * 100)));
        out.styl[sd] = { k: st ? st.k : '', cn: st ? st.cn : '', note: st ? st.note : '', pct: pct, comfort: confort, star: starGot, sig: st ? st.sig : [] };
      });
    }

    // 分路对位
    R.ROLES.forEach((role, i) => {
      const bp = (match.blue.players && match.blue.players[role]) || null;
      const rp = (match.red.players && match.red.players[role]) || null;
      const bChamp = idsOf('blue')[i];
      const rChamp = idsOf('red')[i];
      const partnerB = role === 'bot' ? idsOf('blue')[4] : role === 'sup' ? idsOf('blue')[3] : null;
      const partnerR = role === 'bot' ? idsOf('red')[4] : role === 'sup' ? idsOf('red')[3] : null;
      const b = laneStrength(match.blue.team, role, bChamp, bp, { opp: rChamp, partner: partnerB });
      const r = laneStrength(match.red.team, role, rChamp, rp, { opp: bChamp, partner: partnerR });
      const diff = b.v - r.v;
      let edge = 'even';
      if (diff > 3.2) edge = 'blue'; else if (diff < -3.2) edge = 'red';
      out.lanes.push({ role: role, blue: b, red: r, diff: diff, edge: edge,
        ctr: (b.ctr || 0) - (r.ctr || 0) });
    });

    // 维度
    DIMS.forEach((d) => {
      const bv = Math.round(clamp(prof.blue.sc[d.k], 0, 100));
      const rv = Math.round(clamp(prof.red.sc[d.k], 0, 100));
      out.dims.push({ k: d.k, cn: d.cn, blue: bv, red: rv, edge: bv - rv > 5 ? 'blue' : (rv - bv > 5 ? 'red' : 'even') });
    });

    // 纸面实力（选手评分）
    sides.forEach((sd) => {
      let sum = 0, wsum = 0;
      R.ROLES.forEach((r) => {
        const p = (match[sd].players && match[sd].players[r]) || D.playerOf(match[sd].team, r);
        const v = p ? D.playerScore(p) : 75;
        sum += v * ROLE_W[r];
        wsum += ROLE_W[r];
      });
      out.paper[sd] = Math.round((sum / (wsum || 1)) * 10) / 10;
    });

    // 阵容质量
    sides.forEach((sd) => {
      const opp = sd === 'blue' ? 'red' : 'blue';
      const res = qualityOf(prof[sd], idsOf(sd), idsOf(opp), sd, match);
      out.qual[sd] = res;
      // 综合评分 = 结构 + 落位执行
      out.rating[sd] = Math.round(clamp(res.q * 0.85 + prof[sd].comp * 0.15, 5, 99));
    });

    // 综合
    out.total.blue = Math.round((out.paper.blue * 0.5 + out.rating.blue * 0.5) * 10) / 10;
    out.total.red = Math.round((out.paper.red * 0.5 + out.rating.red * 0.5) * 10) / 10;
    out.curve.blue = Math.round(prof.blue.curve);
    out.curve.red = Math.round(prof.red.curve);

    // ===== 胜率模型 =====
    const paperGap = out.paper.blue - out.paper.red;
    let compGap = out.rating.blue - out.rating.red;
    // 纸面差距过大时，BP 的翻盘空间被压缩
    if (Math.abs(paperGap) >= 25) compGap *= 0.5;
    else if (Math.abs(paperGap) >= 18) compGap *= 0.72;

    let z = paperGap * 0.05 + compGap * 0.035;
    // 30 分以上的硬实力差几乎无法用 BP 逆转
    if (Math.abs(paperGap) >= 30) z += Math.sign(paperGap) * (1.25 + (Math.abs(paperGap) - 30) * 0.07);
    else if (Math.abs(paperGap) >= 22) z += Math.sign(paperGap) * 0.42;
    // 蓝色方在当前版本有微弱优势（2026 赛季样本 54.4%）
    z += 0.06;
    // 队伍红蓝边倾向（真实数据：本季各队在自己这边的胜率）
    const TS = window.TEAM_SIDE || {};
    const bs = TS[match.blue.team];
    const rs = TS[match.red.team];
    let sideEdge = 0;
    if (bs && bs.blue && bs.blue.g >= 5 && bs.blue.wr) sideEdge += (bs.blue.wr - 50) * 0.012;
    if (rs && rs.red && rs.red.g >= 5 && rs.red.wr) sideEdge -= (rs.red.wr - 50) * 0.012;
    z += sideEdge;
    out.sideEdge = Math.round(sideEdge * 100) / 100;
    const pb = sigmoid(z);
    out.prob.blue = Math.round(Math.min(97, Math.max(3, pb * 100)) * 10) / 10;
    out.prob.red = Math.round((100 - out.prob.blue) * 10) / 10;
    const paperOnly = sigmoid(paperGap * 0.05 + 0.06);
    const full = pb;
    out.bpSwing = Math.round(Math.abs(full - paperOnly) * 1000) / 10;
    out.bpShare = 33;

    // ===== 备注 =====
    sides.forEach((sd) => {
      const p = prof[sd];
      const cnSide = R.SIDE_CN[sd];
      const top = p.arch[0];
      const q = out.qual[sd];
      const myTeam = match[sd].team;
      const sr = TS[myTeam] && TS[myTeam][sd];
      if (sr && sr.g >= 6 && Math.abs(sr.wr - 50) >= 6) {
        out.notes.push({
          side: sd, t: sr.wr >= 50 ? 'good' : 'warn',
          text: cnSide + '在' + (sd === 'blue' ? '蓝' : '红') + '方本季 ' + sr.g + ' 场胜率 ' + sr.wr + '%，' +
            (sr.wr >= 50 ? '这一边他们打得明显更顺，选边本身就有价值' : '这一边他们打得别扭，前期要格外小心'),
        });
      }
      // 体系
      const second = p.arch[1];
      if (top && top.score >= 70) {
        out.notes.push({ side: sd, t: 'good', text: cnSide + '是一套标准的「' + top.cn + '」体系' +
          (second && second.score >= 66 ? '，同时带有「' + second.cn + '」的副线' : '') + '：' + top.tip });
      } else if (top) {
        out.notes.push({ side: sd, t: 'warn', text: cnSide + '的阵容更像拼图，最接近「' + top.cn + '」但只完成了一半：' + top.tip.replace(/。$/, '') + '，这个思路没打通。' });
      }
      // 结构性缺陷 / 优点
      q.flaws.slice(0, 4).forEach((f) => out.notes.push({ side: sd, t: 'bad', text: cnSide + '：' + f + '。' }));
      q.goods.slice(0, 3).forEach((g) => out.notes.push({ side: sd, t: 'good', text: cnSide + '：' + g + '。' }));
      // 下路组合
      if (p.syn.duo) {
        const d = p.syn.duo;
        const st = p.syn.duoStat;
        if (st && st.n >= 12 && st.wr < 45) {
          out.notes.push({ side: sd, t: 'bad', text: cnSide + '下路的「' + d[2] + '」虽然纸面强度 ' + d[0] + '/10，但本赛季 ' + st.n + ' 局只有 ' + st.wr + '% 胜率，属于被版本针对的组合，别按纸面强度算它。' });
        } else {
          const weak = st && st.wr < 48;
          out.notes.push({ side: sd, t: d[0] >= 8 && !weak ? 'good' : 'warn',
            text: cnSide + '下路是「' + d[2] + '」（强度 ' + d[0] + '/10' + (st ? '，本赛季 ' + st.n + ' 局 ' + st.wr + '% 胜率' : '') + '），' +
              (weak ? '纸面强度不低，但本赛季实战数据一般，属于看着强、打起来一般的类型，别当成必胜组合。'
                : d[0] >= 8 ? '这套组合的配合逻辑非常成熟，对线期就能打出体系。'
                  : '组合方向没错，但强度不算版本顶级，需要靠个人能力补。') });
        }
      } else if (p.n >= 5) {
        out.notes.push({ side: sd, t: 'warn', text: cnSide + '下路两个点没有成熟的组合逻辑，对线期容易被对面组合压制，只能打防守。' });
      }
      // 本局最大的一处克制
      const bigCtr = p.ctr.lanes.filter((x) => Math.abs(x.v) >= 3).sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0];
      if (bigCtr) {
        const good = bigCtr.v > 0;
        out.notes.push({ side: sd, t: good ? 'good' : 'bad',
          text: cnSide + R.ROLE_CN[bigCtr.role] + '位 ' + cn(bigCtr.a) + (good ? ' 打 ' : ' 被 ') + cn(bigCtr.b) +
            (good ? ' 是优势对位：' : ' 压制：') + bigCtr.why + '。' });
      }
      // 塞拉斯偷大招的整队惩罚
      p.ctr.tricks.slice(0, 2).forEach((t) => {
        out.notes.push({ side: sd, t: 'bad', text: cnSide + '最大的隐患是塞拉斯：' + cn(t.own) + ' 的大招会被偷，' + t.why + '，这手 BP 在机制上就是亏的。' });
      });
      // 版本
      const metaTop = R.ROLES.map((r, i) => idsOf(sd)[i]).filter(Boolean).filter((id) => champPower(id) >= 8);
      if (metaTop.length >= 2) {
        out.notes.push({ side: sd, t: 'good', text: cnSide + '选到了 ' + metaTop.slice(0, 2).map(cn).join('、') + ' 这些版本强势点，BP 阶段就拿到了强度。' });
      }
      // 强势期
      const other = sd === 'blue' ? 'red' : 'blue';
      if (out.curve[sd] > 62 && out.curve[other] < 45) {
        out.notes.push({ side: sd, t: 'warn', text: cnSide + '是后期阵容，前 20 分钟必须稳住，一旦被对面把塔和龙全吃掉，后期也翻不回来。' });
      } else if (out.curve[sd] < 40 && out.curve[other] > 60) {
        out.notes.push({ side: sd, t: 'good', text: cnSide + '的强势期在 25 分钟之前，节奏必须打快，越拖越难受。' });
      }
      // 招牌
      const sig = R.ROLES.filter((r, i) => {
        const pl = match[sd].players && match[sd].players[r];
        return pl && pl.s && pl.s.indexOf(idsOf(sd)[i]) >= 0;
      });
      if (sig.length >= 4) out.notes.push({ side: sd, t: 'good', text: cnSide + '几乎每个位置都拿到了选手的招牌英雄，操作上限极高。' });
      else if (sig.length === 0) out.notes.push({ side: sd, t: 'warn', text: cnSide + '一个招牌英雄都没拿到，全靠选手硬实力和团队执行力。' });
    });

    out.verdict = buildVerdict(out, match, idsOf);
    return out;
  }

  function buildVerdict(out, match, idsOf) {
    const pb = out.prob.blue;
    const leader = pb >= 50 ? 'blue' : 'red';
    const other = leader === 'blue' ? 'red' : 'blue';
    const lead = leader === 'blue' ? match.blue.team : match.red.team;
    const trail = other === 'blue' ? match.blue.team : match.red.team;
    const leadP = leader === 'blue' ? pb : 100 - pb;
    const gap = Math.abs(pb - 50);
    const ab = out.arch.blue[0], ar = out.arch.red[0];
    const rb = out.rating.blue, rr = out.rating.red;
    const paperGap = Math.abs(out.paper.blue - out.paper.red);

    const parts = [];
    // 体系陈述
    if (ab && ar) {
      parts.push(match.blue.team + ' 摆出的是「' + ab.cn + '」，' + match.red.team + ' 则是「' + ar.cn + '」，' +
        (ab.k === ar.k ? '两边体系同源，比的就是谁把细节做得更细。' : '两套体系的胜负手完全不同，前期节奏会决定比赛走向。'));
    }
    // BP 质量差距
    if (Math.abs(rb - rr) >= 8) {
      const better = rb > rr ? match.blue.team : match.red.team;
      parts.push(better + ' 这套 BP 的阵容完整度明显更高（评分 ' + Math.max(rb, rr) + ' 对 ' + Math.min(rb, rr) + '），把选手的长处都放进了体系里。');
    } else {
      parts.push('两边 BP 的阵容质量咬得很死（' + rb + ' 对 ' + rr + '），胜负更多取决于谁的执行力更稳。');
    }
    // 纸面 vs BP
    if (paperGap >= 30) {
      parts.push('纸面实力差了 ' + Math.round(paperGap) + ' 分，这个量级的差距 BP 已经很难填平，' + (out.paper.blue > out.paper.red ? match.blue.team : match.red.team) + ' 只要不送就能拿下。');
    } else if (paperGap >= 12) {
      const weaker = out.paper.blue < out.paper.red ? match.blue.team : match.red.team;
      const stronger = weaker === match.blue.team ? match.red.team : match.blue.team;
      const betterBp = rb > rr ? match.blue.team : match.red.team;
      if (betterBp === weaker) parts.push(weaker + ' 纸面不如 ' + stronger + '，但靠这套 BP 把阵容合理性拉回来了，正面团战完全有得打。');
      else parts.push(stronger + ' 纸面上占优，BP 也没有落下风，正常发挥应该能压住。');
    }
    // 关键对位
    const laneW = { top: 1, jg: 0.9, mid: 1.05, bot: 1.1, sup: 0.5 };
    const swings = out.lanes.filter((l) => Math.abs(l.diff) > 5)
      .sort((a, b) => Math.abs(b.diff) * laneW[b.role] - Math.abs(a.diff) * laneW[a.role]);
    if (swings.length) {
      const s = swings[0];
      const w = s.diff > 0 ? 'blue' : 'red';
      const who = w === 'blue' ? match.blue.team : match.red.team;
      const my = s[w].champ, opp = s[w === 'blue' ? 'red' : 'blue'].champ;
      const where = { top: '上路', jg: '野区', mid: '中路', bot: '下路', sup: '下半区' }[s.role] || '对线期';
      parts.push(where + '是最大的胜负手：' + who + ' 的 ' + cn(my) + ' 对 ' + cn(opp) + '，' +
        (s[w].ctr > 0 ? '机制上就占优，' : '') +
        (s.role === 'sup' ? '这个对位的价值在团战保护与视野，不只是线上。' : '这条线一旦打穿会直接辐射到全图。'));
    }
    // 强势期
    if (out.curve.blue < 40 && out.curve.red > 60) parts.push('时间站在 ' + match.red.team + ' 这边：蓝方必须在 25 分钟前把优势兑现成资源，否则越拖越难打。');
    else if (out.curve.blue > 60 && out.curve.red < 40) parts.push('时间站在 ' + match.blue.team + ' 这边：红方必须在前 20 分钟建立足够的经济差。');
    else parts.push('两边强势期接近，大概率是一场拉锯战，谁先在团战里犯错谁就丢节奏。');

    // 预测
    let pred;
    if (gap < 3) pred = '比分预测五五开，' + lead + ' 也只是微弱领先，一波团战就能翻。';
    else if (gap < 8) pred = '看好 ' + lead + ' 略占上风，但 ' + trail + ' 完全有机会靠一波好团翻回来。';
    else if (gap < 16) pred = '看好 ' + lead + '，' + lead + ' 的阵容整体性更好，赢面在六成以上。';
    else pred = '明显看好 ' + lead + '，除非出现重大失误，否则 ' + trail + ' 很难在这个 BP 下翻盘。';

    return {
      leader: leader, lead: lead, prob: Math.round(leadP * 10) / 10,
      text: parts.join(' ') + pred,
      bpEdge: Math.round(rb - rr), paperEdge: Math.round((out.paper.blue - out.paper.red) * 10) / 10,
    };
  }

  window.Analyze = {
    analyze: analyze, autoAssign: autoAssign, compProfile: compProfile, DIMS: DIMS,
    laneStrength: laneStrength, archFit: archFit, champPower: champPower, champTier: champTier,
  };
})();
