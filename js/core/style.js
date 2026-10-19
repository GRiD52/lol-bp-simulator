// 职业赛场理解层：战队风格、体系模板、职业分路口径
// 目标：让 AI 像 LPL/LCK 解说与分析台那样做 BP —— 先定体系与赢法，再挑英雄，
// 而不是按排位热门榜从高到低拿。
(function () {
  // ===== 1. 体系模板 =====
  // arch: 这套风格最想要的阵容体系（对应 analysis.js 的 ARCH）
  // focus: 选人时优先看的战术标签
  // slots: 每个位置希望拿到的标签（AI 用它判断「这一手该补什么」）
  // star: 这套体系的标志性英雄（体系核心，先抢）
  // aggr: -1 到 +1，给选手/队伍的心理节奏
  const STYLES = {
    aegis: {
      k: 'aegis', cn: '玄武大阵', tip: '视野与容错拉满，不跟你打无准备的团，靠后期双核把比赛拖死',
      arch: ['scale', 'front', 'disengage'],
      focus: { scale: 2.4, front: 2, cc: 1.2, util: 1.2, wave: 1 },
      slots: {
        top: ['front', 'scale', 'sustain'],
        jg: ['front', 'engage', 'cc'],
        mid: ['scale', 'wave', 'poke'],
        bot: ['scale', 'poke'],
        sup: ['util', 'cc', 'heal'],
      },
      star: ['Ksante', 'Ornn', 'Sion', 'Sejuani', 'Maokai', 'Azir', 'Orianna', 'Smolder', 'Aphelios', 'Lulu', 'Milio', 'Rakan', 'Rell'],
      aggr: -0.35,
    },
    tempo: {
      k: 'tempo', cn: '前中期强压', tip: '用线权和先锋滚雪球，20 分钟内把塔和资源全换成经济',
      arch: ['siege', 'front', 'wombo'],
      focus: { early: 2.4, engage: 1.8, cc: 1.2, burst: 1.2, front: 1 },
      slots: {
        top: ['early', 'front', 'split'],
        jg: ['early', 'engage', 'burst'],
        mid: ['burst', 'mobi', 'poke'],
        bot: ['early', 'poke', 'burst'],
        sup: ['engage', 'cc', 'early'],
      },
      star: ['Renekton', 'Jayce', 'Rumble', 'Ambessa', 'LeeSin', 'XinZhao', 'Pantheon', 'Ahri', 'Aurora', 'Varus', 'Caitlyn', 'Nautilus', 'Rell', 'Rakan'],
      aggr: 0.55,
    },
    dive: {
      k: 'dive', cn: '冲阵切后排', tip: '不跟你打正面，多段位移直接越过前排，把后排一秒',
      arch: ['dive', 'pick', 'wombo'],
      focus: { mobi: 2.2, burst: 2, engage: 1.4, cc: 1 },
      slots: {
        top: ['mobi', 'front', 'burst'],
        jg: ['mobi', 'burst', 'engage'],
        mid: ['mobi', 'burst', 'cc'],
        bot: ['burst', 'mobi', 'scale'],
        sup: ['engage', 'cc', 'mobi'],
      },
      star: ['Ambessa', 'Akali', 'Sylas', 'Ahri', 'Vi', 'JarvanIV', 'Nocturne', 'Kaisa', 'Rakan', 'Rell', 'Nautilus', 'Pantheon'],
      aggr: 0.75,
    },
    wombo: {
      k: 'wombo', cn: '强开连招', tip: '先手一开、AOE 一套灌满，团战站位一聚就是灾难',
      arch: ['wombo', 'front', 'engage'],
      focus: { engage: 2.4, cc: 2.2, burst: 1.4, front: 1 },
      slots: {
        top: ['front', 'engage', 'cc'],
        jg: ['engage', 'cc', 'front'],
        mid: ['cc', 'wave', 'burst'],
        bot: ['burst', 'scale', 'cc'],
        sup: ['engage', 'cc', 'front'],
      },
      star: ['Orianna', 'Malphite', 'Amumu', 'Rakan', 'Rell', 'JarvanIV', 'Galio', 'Sejuani', 'Rumble', 'MissFortune', 'Nautilus'],
      aggr: 0.45,
    },
    poke: {
      k: 'poke', cn: '消耗拉扯', tip: '用血量和线权把对手压出资源区，绝不给你把团开起来',
      arch: ['poke', 'siege'],
      focus: { poke: 2.6, wave: 1.8, util: 1.2, early: 1 },
      slots: {
        top: ['poke', 'front'],
        jg: ['poke', 'util'],
        mid: ['poke', 'wave', 'cc'],
        bot: ['poke', 'scale', 'util'],
        sup: ['poke', 'util', 'heal'],
      },
      star: ['Jayce', 'Hwei', 'Zoe', 'Caitlyn', 'Varus', 'Ezreal', 'Karma', 'Seraphine', 'Nidalee', 'Lulu'],
      aggr: 0.15,
    },
    scale: {
      k: 'scale', cn: '后期双核', tip: '前期只求不崩，三件套之后正面无敌',
      arch: ['scale', 'front'],
      focus: { scale: 2.6, front: 1.8, wave: 1.4, cc: 1 },
      slots: {
        top: ['front', 'scale'],
        jg: ['front', 'cc'],
        mid: ['scale', 'wave', 'poke'],
        bot: ['scale', 'poke'],
        sup: ['util', 'heal', 'cc'],
      },
      star: ['Smolder', 'Azir', 'Orianna', 'Aphelios', 'Jinx', 'Zeri', 'Ksante', 'Sion', 'Sejuani', 'Lulu', 'Milio'],
      aggr: -0.25,
    },
    protect: {
      k: 'protect', cn: '四保一', tip: '中上野全给 AD 铺路，所有资源都喂给一个后期核心',
      arch: ['scale', 'disengage'],
      focus: { util: 2.6, heal: 2, scale: 1.8, cc: 1 },
      slots: {
        top: ['front', 'cc', 'util'],
        jg: ['front', 'util', 'cc'],
        mid: ['util', 'wave', 'cc'],
        bot: ['scale', 'poke'],
        sup: ['util', 'heal', 'cc'],
      },
      star: ['Jinx', 'Smolder', 'Aphelios', 'Zeri', 'Lulu', 'Milio', 'Karma', 'Braum', 'Ornn', 'Shen', 'Sejuani'],
      aggr: -0.15,
    },
    split: {
      k: 'split', cn: '边路分带', tip: '一条边路单带牵扯，四个人清线守塔，逼你在两难里选一个输',
      arch: ['split', 'pick'],
      focus: { split: 2.6, wave: 1.6, mobi: 1.4, early: 1 },
      slots: {
        top: ['split', 'burst', 'mobi'],
        jg: ['early', 'mobi', 'front'],
        mid: ['wave', 'mobi', 'poke'],
        bot: ['scale', 'util', 'poke'],
        sup: ['util', 'cc', 'engage'],
      },
      star: ['Camille', 'Fiora', 'Jax', 'Gwen', 'Yone', 'Renekton', 'TwistedFate', 'Ryze', 'Trundle', 'Shen'],
      aggr: 0.25,
    },
    control: {
      k: 'control', cn: '运营控图', tip: '不追求一波打死，靠换资源和视野差把优势一点点磨出来',
      arch: ['front', 'pick', 'disengage'],
      focus: { front: 1.6, cc: 1.6, wave: 1.4, util: 1.4, poke: 1 },
      slots: {
        top: ['front', 'split', 'cc'],
        jg: ['front', 'cc', 'engage'],
        mid: ['wave', 'cc', 'poke'],
        bot: ['scale', 'poke', 'util'],
        sup: ['util', 'cc', 'engage'],
      },
      star: ['KSante', 'Renekton', 'JarvanIV', 'Sejuani', 'Orianna', 'Azir', 'Ahri', 'Varus', 'Caitlyn', 'Rakan', 'Nautilus', 'Rell'],
      aggr: 0.05,
    },
  };

  // ===== 2. 职业分路兜底 =====
  // 真实数据没覆盖到的英雄（样本都在别的赛区/禁用为主），按职业赛真实分路补一份，
  // 让 AI 不会把英雄往排位分路上摆（例如妮蔻只有辅助、小鱼人只有中单）。
  const ROLE_BASE = {
    Neeko: 's', Jayce: 't', Corki: 'b', Vayne: 't', TwistedFate: 'm', Seraphine: 's', Pantheon: 'j',
    Hecarim: 'j', Fiora: 't', Kindred: 'j', Riven: 't', Belveth: 'j', Urgot: 't', Graves: 'j',
    Janna: 's', Morgana: 's', Zilean: 's', Karthus: 'j', Evelynn: 'j', Taric: 's', Twitch: 'b',
    Veigar: 'm', Malzahar: 'm', Kassadin: 'm', Velkoz: 's', Nunu: 'j', Kayn: 'j',
    Akshan: 'm', Kayle: 't', Soraka: 's', Zac: 'j', Amumu: 'j', Sona: 's', Nasus: 't',
    Darius: 't', Shyvana: 'j', Singed: 't', Briar: 'j', TahmKench: 't',
    Gangplank: 't', Brand: 's', Talon: 'm', Heimerdinger: 'm',
    Vex: 'm', Volibear: 't', Nilah: 'b', Draven: 'b', Senna: 'b',
  };
  const ROLE_CODE = { t: 'top', j: 'jg', m: 'mid', b: 'bot', s: 'sup' };

  // 职业赛里能打的位置（含占比）。真实数据优先，其次兜底，最后按英雄 meta 粗判。
  function proRoles(id) {
    const db = window.PRO_ROLES || null;
    const rec = db && db[id];
    if (rec && rec.total >= 2 && rec.roles) {
      const out = {};
      Object.keys(rec.roles).forEach((r) => {
        const v = rec.roles[r];
        if (v.share >= 8) out[r] = v;
      });
      if (Object.keys(out).length) return { src: 'pro', roles: out, total: rec.total };
    }
    const base = ROLE_BASE[id];
    if (base) {
      const out = {};
      out[ROLE_CODE[base]] = { p: 1, share: 100, wr: 0 };
      return { src: 'base', roles: out, total: 0 };
    }
    return null;
  }
  // AI 只认真实职业样本（>=3 场），避免把排位英雄塞进职业阵容
  function proData(id) {
    const db = window.PRO_ROLES || null;
    const rec = db && db[id];
    if (!rec || rec.total < 3 || !rec.roles) return null;
    const out = {};
    Object.keys(rec.roles).forEach((r) => {
      const v = rec.roles[r];
      if (v.share >= 8) out[r] = v;
    });
    return Object.keys(out).length ? { roles: out, total: rec.total } : null;
  }
  // 位置判断：真实数据 > 职业分路兜底 > 英雄 meta
  function fitsRole(id, role) {
    const rec = proData(id);
    if (rec) return !!rec.roles[role];
    const base = ROLE_BASE[id];
    if (base) return ROLE_CODE[base] === role;
    const cu = window.ChampUtil;
    return !!(cu && cu.fits && cu.fits(id, role));
  }

  // 体系/标签工具
  function tags(id) {
    return (window.ChampUtil && window.ChampUtil.champTags) ? window.ChampUtil.champTags(id) : [];
  }
  function hasTag(id, t) { return tags(id).indexOf(t) >= 0; }

  // ===== 3. 战队风格 =====
  // s: 主风格；mix: 副风格（体系不顺时切换）；aggr: 队伍气质（用于抢/让资源与选人激进程度）
  // sig: 队伍自己的舒适英雄（2026 赛季真实高频 pick + 选手绝活）
  const TEAM_STYLE = {
    'Gen.G Esports': { s: 'aegis', mix: 'control', aggr: -0.3, sig: ['Ksante', 'Azir', 'Ruler', 'Smolder', 'Orianna', 'Sejuani', 'Lulu'],
      note: '玄武大阵：视野与阵型优先，前期宁可不做也不送，等双核三件套再打' },
    T1: { s: 'control', mix: 'wombo', aggr: 0.15, sig: ['Ahri', 'Orianna', 'Jayce', 'Varus', 'Rakan', 'Renekton', 'Nautilus'],
      note: '多核灵活：中野找节奏，边路留 counter，团战靠阵型与第二波进场' },
    'Hanwha Life Esports': { s: 'tempo', mix: 'dive', aggr: 0.45, sig: ['Renekton', 'Ambessa', 'Vi', 'Ahri', 'Varus', 'Rakan', 'Nautilus'],
      note: '对线与资源战：上中野压线，拿先锋滚雪球，敢打敢接' },
    'Bilibili Gaming': { s: 'tempo', mix: 'dive', aggr: 0.75, sig: ['Renekton', 'Jax', 'LeeSin', 'XinZhao', 'Akali', 'Ahri', 'Rakan', 'Rell', 'Varus'],
      note: '激进前中期：Bin 上路压线、中野强开找架，一波接一波不给喘' },
    'Top Esports': { s: 'dive', mix: 'tempo', aggr: 0.8, sig: ['Renekton', 'Vi', 'Akali', 'Varus', 'Rakan', 'Rell', 'Nautilus'],
      note: '打架队：中野双开团、下路高输出，节奏一旦起来就是连续战斗' },
    'JD Gaming': { s: 'control', mix: 'aegis', aggr: -0.1, sig: ['KSante', 'Sejuani', 'Orianna', 'Caitlyn', 'Rakan', 'Nautilus'],
      note: '运营强队：换资源、绕视野、把比赛拖进自己的节奏' },
    'Weibo Gaming': { s: 'control', mix: 'poke', aggr: -0.05, sig: ['Jayce', 'Ahri', 'Varus', 'Caitlyn', 'Rakan', 'Nautilus'],
      note: '中野运营 + 下路输出，靠线权和中后期处理赢' },
    'LNG Esports': { s: 'scale', mix: 'control', aggr: -0.2, sig: ['Smolder', 'Azir', 'Caitlyn', 'Sejuani', 'Rakan', 'Lulu'],
      note: '偏后期：中路吃资源，下路稳输出，前期以不失误为主' },
    'Invictus Gaming': { s: 'dive', mix: 'wombo', aggr: 0.85, sig: ['Renekton', 'Jax', 'Ahri', 'Akali', 'Varus', 'Rakan', 'Rell'],
      note: '纯打架：上路敢开、中路敢接，团战越乱越强' },
    "Anyone's Legend": { s: 'tempo', mix: 'control', aggr: 0.4, sig: ['Renekton', 'Jayce', 'XinZhao', 'Ahri', 'Varus', 'Rakan'],
      note: '版本适应型：抢到强势对线就压，抢不到就运营换资源' },
    'EDward Gaming': { s: 'aegis', mix: 'control', aggr: -0.25, sig: ['KSante', 'Sejuani', 'Azir', 'Caitlyn', 'Rakan', 'Milio'],
      note: '防守运营：视野与阵型优先，等对面先犯错' },
    'Ninjas in Pyjamas': { s: 'tempo', mix: 'dive', aggr: 0.5, sig: ['Renekton', 'LeeSin', 'Akali', 'Varus', 'Rakan'],
      note: '中野带节奏，前期敢抓敢越' },
    'Team WE': { s: 'control', mix: 'scale', aggr: 0.1, sig: ['KSante', 'Sejuani', 'Orianna', 'Varus', 'Nautilus'],
      note: '年轻阵容，靠中野运营找机会' },
    'LGD Gaming': { s: 'control', mix: 'poke', aggr: 0.15, sig: ['Jayce', 'Ahri', 'Caitlyn', 'Rakan', 'Nautilus'],
      note: '中游运营队，poke 与换线都敢试' },
    'Oh My God': { s: 'scale', mix: 'control', aggr: 0, sig: ['KSante', 'Sejuani', 'Azir', 'Varus', 'Rakan'],
      note: '偏稳的后期队，靠团战处理与资源判断' },
    'ThunderTalk Gaming': { s: 'dive', mix: 'tempo', aggr: 0.6, sig: ['Renekton', 'Vi', 'Akali', 'Varus', 'Rakan'],
      note: '年轻敢打，节奏一起来就连续开团' },
    'Ultra Prime': { s: 'aegis', mix: 'control', aggr: -0.3, sig: ['KSante', 'Sejuani', 'Orianna', 'Varus', 'Nautilus'],
      note: '稳守反击，靠对手失误拖后期' },
    'KT Rolster': { s: 'wombo', mix: 'control', aggr: 0.3, sig: ['KSante', 'Sejuani', 'Orianna', 'Varus', 'Rakan', 'Rell'],
      note: '团战执行型：强开与反手都做得很细' },
    Dplus: { s: 'tempo', mix: 'dive', aggr: 0.55, sig: ['Renekton', 'XinZhao', 'Ahri', 'Akali', 'Varus', 'Rakan'],
      note: '中野节奏队：ShowMaker 动起来之后全队加速' },
    DRX: { s: 'dive', mix: 'tempo', aggr: 0.5, sig: ['Renekton', 'Vi', 'Akali', 'Varus', 'Rakan'],
      note: '打架风格，靠下路后期兜底' },
    BRION: { s: 'protect', mix: 'scale', aggr: -0.1, sig: ['KSante', 'Sejuani', 'Orianna', 'Smolder', 'Lulu', 'Milio'],
      note: '四保一：资源全给下路，后期一锤定音' },
    FEARX: { s: 'tempo', mix: 'control', aggr: 0.45, sig: ['Renekton', 'XinZhao', 'Ahri', 'Varus', 'Rakan'],
      note: '前中期抢先手，拿到强势对线就打' },
    SOOPers: { s: 'wombo', mix: 'dive', aggr: 0.5, sig: ['KSante', 'Sejuani', 'Orianna', 'Varus', 'Rakan', 'Rell'],
      note: '强开找团，打团前先做视野再一波流' },
    'Nongshim Redforce': { s: 'poke', mix: 'scale', aggr: 0.2, sig: ['Jayce', 'Ahri', 'Varus', 'Caitlyn', 'Rakan', 'Milio'],
      note: '消耗拉扯 + 中后期接手，靠线权与资源差滚雪球' },
  };

  const DEFAULT_STYLE = { s: 'control', mix: 'tempo', aggr: 0.1, sig: [], note: '运营控图，按版本调整' };

  function styleOf(team) {
    const rec = TEAM_STYLE[team] || DEFAULT_STYLE;
    const base = STYLES[rec.s] || STYLES.control;
    const mix = STYLES[rec.mix] || null;
    return {
      team: team,
      k: base.k, cn: base.cn, tip: base.tip, arch: base.arch, focus: base.focus, slots: base.slots,
      star: base.star, aggr: rec.aggr !== undefined ? rec.aggr : base.aggr,
      mixK: mix ? mix.k : null, mixCn: mix ? mix.cn : null, mixArch: mix ? mix.arch : null,
      sig: rec.sig || [], note: rec.note || base.tip,
    };
  }

  function styleByKey(k) { return STYLES[k] || null; }

  // 战队真实高频 pick（给 AI 的舒适区判断）
  function teamProfile(team) {
    const T = window.TEAM_PROFILES || null;
    return (T && T[team]) || null;
  }
  function teamPickCount(team, id) {
    const p = teamProfile(team);
    return p && p.picks ? (p.picks[id] || 0) : 0;
  }

  // 风格契合度：这手英雄对这套体系/这个位置有多贴脸
  function slotFit(style, role, id) {
    if (!style || !role) return 0;
    const want = style.slots[role] || [];
    const tg = tags(id);
    let v = 0;
    for (let i = 0; i < want.length; i++) {
      if (tg.indexOf(want[i]) >= 0) v += i === 0 ? 2.2 : i === 1 ? 1.4 : 0.9;
    }
    return v;
  }

  window.StyleDB = {
    STYLES, TEAM_STYLE, ROLE_BASE, ROLE_CODE,
    proRoles, proData, fitsRole, styleOf, styleByKey, teamProfile, teamPickCount, slotFit, tags, hasTag,
  };
})();
