// 比赛模拟 + 全程解说文案（走势/资源/评分/网友评论）
(function () {
  const R = window.RULES;
  const D = window.Draft;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const CN_NAME = {};
  (window.CHAMPIONS || []).forEach((c) => { CN_NAME[c.i] = c.c; });
  const cn = (id) => CN_NAME[id] || id || '';

  function fmt(t) {
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  const OTHER = (s) => (s === 'blue' ? 'red' : 'blue');

  // ===== 解说词库：专业术语 + 梗 =====
  function fill(tpl, vars) {
    return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : vars[k]));
  }

  function run(match, an, opts) {
    opts = opts || {};
    const rnd = mulberry32(opts.seed || (Math.floor(Math.random() * 1e9) + 1));
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const chance = (p) => rnd() < p;
    const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

    // ===== 上下文 =====
    const ctx = { blue: {}, red: {} };
    ['blue', 'red'].forEach((sd) => {
      ctx[sd].team = match[sd].team;
      ctx[sd].roles = {};
      R.ROLES.forEach((role) => {
        const cid = match[sd].assign[role];
        const p = (match[sd].players && match[sd].players[role]) || D.playerOf(match[sd].team, role);
        ctx[sd].roles[role] = { cid: cid, cn: cn(cid), p: p };
      });
    });
    const P = (sd, role) => (ctx[sd].roles[role].p ? ctx[sd].roles[role].p.n : R.SIDE_CN[sd] + R.ROLE_CN[role]);
    const C = (sd, role) => ctx[sd].roles[role].cn || '—';
    const T = (sd) => match[sd].team;

    const pBlue = Math.max(0.1, Math.min(0.9, an.prob.blue / 100));

    // ===== 剧情主轴 =====
    const winner = chance(pBlue) ? 'blue' : 'red';
    const loser = OTHER(winner);
    let earlyLead = chance(0.66) ? winner : loser;

    // 阵容节奏：两套都是后期阵容 → 时间轴拉长；都是前中期 → 打得快、人头多
    const avgCurve = ((an.curve && an.curve.blue) || 58) * 0.5 + ((an.curve && an.curve.red) || 58) * 0.5;
    const pace = Math.max(0.84, Math.min(1.2, 1 + (avgCurve - 58) / 300));
    const stB = window.StyleDB ? window.StyleDB.styleOf(match.blue.team) : null;
    const stR = window.StyleDB ? window.StyleDB.styleOf(match.red.team) : null;
    const aggro = (((stB && stB.aggr) || 0.3) + ((stR && stR.aggr) || 0.3)) / 2;

    const st = {
      kills: { blue: 0, red: 0 }, towers: { blue: 0, red: 0 },
      dragons: { blue: 0, red: 0 }, grubs: { blue: 0, red: 0 },
      heralds: { blue: 0, red: 0 }, barons: { blue: 0, red: 0 }, souls: { blue: 0, red: 0 },
      gold: 0, // 千，正数=蓝方领先
    };
    let t = 0;
    const ev = [];
    const tl = [];        // 走势图数据点
    const objs = [];      // 关键资源
    const padCJK = (str) => String(str).replace(/([\u4e00-\u9fa5])([A-Za-z0-9])/g, '$1 $2').replace(/([A-Za-z0-9])([\u4e00-\u9fa5])/g, '$1 $2');

    function snap() {
      tl.push({
        t: Math.round(t), m: Math.round((t / 60) * 10) / 10, g: Math.round(st.gold * 100) / 100,
        kb: st.kills.blue, kr: st.kills.red, tb: st.towers.blue, tr: st.towers.red,
      });
    }
    function add(kind, side, text, dt) {
      text = padCJK(text);
      if (dt === undefined || dt === null) dt = 4 + Math.round(rnd() * 9);
      if (dt) t += dt;
      ev.push({
        t: fmt(Math.max(0, t)), m: Math.round((t / 60) * 10) / 10, kind: kind, side: side || '', text: text,
        kills: { blue: st.kills.blue, red: st.kills.red },
        towers: { blue: st.towers.blue, red: st.towers.red },
        gold: Math.round(st.gold * 100) / 100,
      });
      snap();
    }
    function obj(kind, side, label) {
      objs.push({ kind: kind, side: side, t: Math.round(t), m: Math.round((t / 60) * 10) / 10, label: label });
    }
    function leadWord() {
      if (Math.abs(st.gold) < 1.2) return '经济基本持平';
      return T(st.gold > 0 ? 'blue' : 'red') + '经济领先约 ' + Math.abs(st.gold).toFixed(1) + ' 千';
    }
    function phase(abs, gap) { t = Math.max(t + (gap || 90), Math.round(abs * pace)); }

    // ================= 1. 备战 =================
    add('draft', '', '双方 BP 完成，' + T('blue') + '坐镇蓝色方，' + T('red') + '在红色方。' + pick([
      '这一把从选人阶段就已经开始博弈了。',
      '两边的体系思路完全不一样，就看谁先把自己的节奏打出来。',
      '版本理解摆在这里，谁拿到自己那套舒服的阵容，谁就能先手。',
    ]), 0);
    add('draft', 'blue', '蓝方 ' + T('blue') + '：' + R.ROLES.map((r) => R.ROLE_CN[r] + (ctx.blue.roles[r].p ? ctx.blue.roles[r].p.n : '') + ' 拿到 ' + C('blue', r)).join('｜'), 0);
    add('draft', 'red', '红方 ' + T('red') + '：' + R.ROLES.map((r) => R.ROLE_CN[r] + (ctx.red.roles[r].p ? ctx.red.roles[r].p.n : '') + ' 拿到 ' + C('red', r)).join('｜'), 0);

    const cB = an.curve.blue, cR = an.curve.red;
    add('draft', '', cB > 62 && cR > 62
      ? '两套阵容都是要时间的，这场比赛的胜负大概率押在 25 分钟之后的大龙团上。谁先手抖谁先输。'
      : cB < 42 && cR < 42
        ? '两边都是前中期阵容，开局十分钟就会打得很凶，谁先起势谁就能一路滚到底。'
        : cB < 42
          ? '蓝色方是典型的前期阵容，红色方偏后期成长，节奏分水岭大概在 25 分钟。蓝方不滚起来就要被拖死。'
          : '红色方前期强势，蓝色方必须顶住前面的压制，把自己拖进强势期。', 0);
    add('draft', '', '召唤师技能：' + pick([
      '双方打野都带了点燃，前期野区对拼会非常暴躁。',
      '两边下路都带了净化，明显不打算给对面抓单的机会。',
      '对抗路双双带传送，边线支援会非常频繁，转线速度会很快。',
      '蓝方辅助带了纯开团符文，这波如果被抓到会很痛。',
    ]), 0);

    const banTxt = (sd) => (((match[sd] && match[sd].bans) || []).map(cn).filter(Boolean).join('、') || '空 ban');
    if (((match.blue && match.blue.bans) || []).length || ((match.red && match.red.bans) || []).length) {
      add('draft', '', '再看 ban 位：' + T('blue') + '按掉了 ' + banTxt('blue') + '；' + T('red') + '按掉了 ' + banTxt('red') +
        '。两边的禁用思路都很明确——就是不让你拿到最舒服的那套体系。', 0);
    }
    add('draft', '', '开局视野：' + T('blue') + '把眼压在了河道与三角草，' + T('red') + '更注重自家野区入口，' + pick([
      '谁先控住河道，谁就能先手决定第一条小龙的归属。',
      '这个眼位差异说明双方对前期节奏的理解不太一样：蓝方要打，红方想稳。',
      '辅助第一次回家的装备选择，会直接决定前十分钟下路的主动权。',
    ]), 0);

    // ================= 2. 对线期 =================
    t = 100;
    add('macro', '', fmt(t) + '，双方上野区同步推进，第一波兵线进场。');
    add('macro', '', P(earlyLead, 'jg') + '的' + C(earlyLead, 'jg') + '选择从' + pick(['下半区', '上半区', '对面野区反向']) + '起手，第一波就想做点事情；' +
      P(OTHER(earlyLead), 'jg') + '的' + C(OTHER(earlyLead), 'jg') + '则是先把自家野区吃干净——两种开野思路，节奏完全不同。');

    const laneText = {
      top: [
        '{A}的{C}在上路对线{B}的{C2}，两边前两级都在找机会换血。',
        '上路是老派的对拼，{A}的{C}压线很凶，{B}的{C2}只能缩在塔下补刀。',
        '上路这里{A}的{C}抢到二级，直接打了一套，{B}的{C2}掉了不少血，兵线也不好处理了。',
        '{A}的{C}把线权捏得很死，{B}的{C2}连回城都要挑时间。',
      ],
      mid: [
        '中路{A}的{C}线权很稳，一直在牵扯{B}的{C2}，兵线被推到塔下。',
        '中路两边在推线节奏上咬得很死，{A}的{C}和{B}的{C2}谁都没能先动。',
        '中路这波{A}的{C}先到六级，直接一套打在{B}的{C2}身上，{B}被迫回城，这波线权全丢了。',
        '中路的对线细节很值得看，{A}的{C}卡着{ B}的{C2}的补刀节奏，压了将近二十刀。',
      ],
      bot: [
        '下路{A}的{C}和辅助压得很靠前，{B}的{C2}被堵在塔下，补刀有点难受。',
        '下路对线五五开，{A}的{C}对{B}的{C2}，双方都在等打野过来。',
        '下路这波换血{A}的{C}占了便宜，{B}的{C2}交掉了净化，这下更难受了。',
        '下路兵线被{A}控在中间，{B}的{C2}想吃线就得往前站，打野的路线已经往这边偏了。',
      ],
    };
    ['top', 'mid', 'bot'].forEach((role) => {
      t += 25 + ri(0, 20);
      const advSide = chance(0.55) ? earlyLead : OTHER(earlyLead);
      const raw = pick(laneText[role]).replace('{ B}', '{B}');
      const txt = fill(raw, {
        A: P(advSide, role), C: C(advSide, role),
        B: P(OTHER(advSide), role), C2: C(OTHER(advSide), role),
      });
      add('lane', advSide, R.ROLE_CN[role] + '：' + txt);
    });

    t += 20 + ri(0, 20);
    const roamSide = chance(0.5) ? 'blue' : 'red';
    add('macro', roamSide, P(roamSide, 'sup') + '的' + C(roamSide, 'sup') + '第一次游走到中路，' + pick([
      '配合中单逼出了对面一个闪现。没拿到人头，但节奏压住了。',
      '在河道草蹲了半分多钟，终于等到对面打野路过，一套控制链直接把人打残。',
      '顺手把中线推进去，让' + P(roamSide, 'mid') + '的' + C(roamSide, 'mid') + '可以安心回家补第一件装备。',
      '这波游走有点东西，绕了整整一圈，对面的视野完全没看到人。',
    ]));

    t += 20 + ri(0, 15);
    add('macro', '', '野区这边，' + P(earlyLead, 'jg') + '的' + C(earlyLead, 'jg') + '比对面多吃了两组野，等级领先一级；' +
      P(OTHER(earlyLead), 'jg') + '的' + C(OTHER(earlyLead), 'jg') + '很清楚正面打不过，干脆放弃这组野去下路找机会。');

    // 一血
    phase(285, 20);
    const fbSide = chance(0.62) ? earlyLead : OTHER(earlyLead);
    const fbRole = pick(['mid', 'top', 'bot']);
    const fbkRole = pick(['jg', 'mid', 'sup']);
    st.kills[fbSide] += 1;
    st.gold += (fbSide === 'blue' ? 1 : -1) * 0.6;
    add('kill', fbSide, '一血！' + P(fbSide, fbkRole) + '的' + C(fbSide, fbkRole) + '在' +
      pick(['中路河道', '下路三角草', '上路河道', '红 buff 附近', '对面一塔后']) + '逮到了' +
      P(OTHER(fbSide), fbRole) + '的' + C(OTHER(fbSide), fbRole) + '，' + pick([
        '闪现交出来也没能走掉，被控到死。',
        '一套连招直接秒，对面的技能一个都没按出来。',
        '越塔强杀，塔伤都没能救回来。',
        '视野盲区里被绕后，人还没反应过来血条就没了。',
        '这波抓得干净利落，一点多余的操作都没有。',
      ]));
    add('macro', fbSide, '一血的经济价值很高，' + T(fbSide) + '拿到第一波节奏，' + P(fbSide, 'jg') + '可以顺势入侵野区，把对面的发育节奏彻底打乱。');

    // 第一座塔
    t += 35 + ri(0, 25);
    const ftSide = chance(0.62) ? fbSide : OTHER(fbSide);
    const ftLane = pick(['mid', 'bot', 'top']);
    st.towers[ftSide] += 1;
    st.gold += (ftSide === 'blue' ? 1 : -1) * 0.9;
    add('macro', ftSide, R.ROLE_CN[ftLane] + '一塔被 ' + T(ftSide) + '推掉。' + P(ftSide, ftLane) + '的' + C(ftSide, ftLane) +
      '把兵线一直压在对面塔前，' + T(OTHER(ftSide)) + '来回防慢了整整两波兵，塔皮先掉了两层。');
    add('macro', ftSide, '一塔经济到手，' + T(ftSide) + '把视野往前推了一整个屏幕，' + leadWord() + '。');

    // ================= 3. 潮虫 & 先锋 =================
    phase(360, 15);
    const grubSide = chance(0.58) ? earlyLead : OTHER(earlyLead);
    const gk = ri(2, 4);
    st.grubs[grubSide] += gk;
    st.grubs[OTHER(grubSide)] += gk >= 3 ? ri(0, 1) : ri(0, 3);
    st.gold += (grubSide === 'blue' ? 1 : -1) * 0.5;
    obj('grub', grubSide, gk + ' 潮虫');
    add('obj', grubSide, fmt(t) + '，虚空巢虫刷新。' + T(grubSide) + '的' + P(grubSide, 'jg') + '和上中都提前到了，' +
      '直接抢下 ' + gk + ' 只潮虫。' + pick([
        '潮虫对防御塔的腐蚀非常恶心，后面推塔会快一大截。',
        '这一波兵线节奏也顺便赚了，等于钱和资源双收。',
        '对面来晚了半拍，等到的时候巢虫已经被吃得差不多了。',
      ]));
    add('macro', grubSide, '潮虫到手以后，' + T(grubSide) + '的推进节奏会明显加快，' + T(OTHER(grubSide)) + '的边线防守压力会上一个台阶。');

    // 先锋
    phase(500, 20);
    const hSide = chance(0.6) ? earlyLead : OTHER(earlyLead);
    st.heralds[hSide] += 1;
    st.towers[hSide] += 1;
    st.gold += (hSide === 'blue' ? 1 : -1) * 1.2;
    obj('herald', hSide, '峡谷先锋');
    add('obj', hSide, fmt(t) + '，' + T(hSide) + '控下峡谷先锋，' + P(hSide, 'jg') + '直接放在' +
      pick(['中路', '上路', '下路']) + '，一波推进打掉对面一座塔。' + pick([
        '先锋这一撞，塔皮直接少了三层。',
        '对面守塔的人被逼走位，塔就这么没了。',
        '这波先锋放得很准，正好撞在对面轮换的空档上。',
      ]));
    add('macro', hSide, '塔掉了，' + T(hSide) + '把视野往前压了一个屏幕，' + leadWord() + '。');

    // ================= 4. 第一条小龙 =================
    phase(640, 30);
    const d1 = chance(0.55) ? earlyLead : OTHER(earlyLead);
    const f1k = ri(1, 2);
    st.dragons[d1] += 1;
    st.kills[d1] += f1k; st.kills[OTHER(d1)] += ri(0, 1);
    st.gold += (d1 === 'blue' ? 1 : -1) * 1.5;
    obj('dragon', d1, '第 1 条小龙');
    add('fight', d1, '第一条小龙团，' + T(d1) + '的' + P(d1, 'sup') + '的' + C(d1, 'sup') + '先手开团，' +
      P(d1, 'bot') + '的' + C(d1, 'bot') + '在后方疯狂输出，打出一波 ' + f1k + ' 换 ' + st.kills[OTHER(d1)] +
      ' 的小优势，' + T(d1) + '顺势收下小龙。' + pick([
        '这波开团时机抓得很准，对面阵型都没摆好。',
        '蓝方的前排顶得太靠前了，后排根本跟不上。',
        '这一波打完，节奏彻底倒向' + T(d1) + '。',
      ]));

    // 换线 / 二塔
    t += 30 + ri(0, 20);
    add('macro', '', pick([
      '换线处理！' + T(hSide) + '把双人路调去上路，想把中塔的墙彻底凿开；' + T(OTHER(hSide)) + '只能跟着应对，这一来一回兵线全亏了。',
      '塔皮经济差距越拉越大，' + T(hSide) + '的中单干脆单带一条边线，逼对面分人来守。',
      '兵线节奏完全被' + T(hSide) + '捏在手里，对面只能被动跟线，野区资源被一点点吃掉。',
      '这里能看出两边的运营差距：' + T(hSide) + '每次资源刷新前眼位都已经提前插好了。',
    ]));
    t += 25 + ri(0, 15);
    st.towers[hSide] += 1;
    st.gold += (hSide === 'blue' ? 1 : -1) * 0.8;
    add('macro', hSide, '第二座塔也掉了，' + T(hSide) + '两路兵线同时推进，视野压进对面野区，' + leadWord() + '。');

    // 第二条小龙
    t += 30 + ri(0, 20);
    const d2 = chance(0.55) ? earlyLead : OTHER(earlyLead);
    st.dragons[d2] += 1;
    st.gold += (d2 === 'blue' ? 1 : -1) * 0.7;
    obj('dragon', d2, '第 2 条小龙');
    add('obj', d2, '第二条小龙，' + T(d2) + '在龙坑前先把视野布满了，' + T(OTHER(d2)) + '被迫从正面走过来，' +
      P(d2, 'jg') + '的' + C(d2, 'jg') + '趁机把龙偷掉。' + T(d2) + '已经两条龙，龙魂的节奏在往他们这边倾斜。');

    // ================= 5. 中期团战 =================
    for (let i = 0; i < 3; i++) {
      t += 55 + ri(0, 35);
      const w = i === 0 ? (chance(0.6) ? earlyLead : OTHER(earlyLead)) : (chance(0.5) ? winner : loser);
      const k = ri(1, 3), dd = ri(0, 1);
      st.kills[w] += k; st.kills[OTHER(w)] += dd;
      if (i !== 2) st.towers[w] += 1;
      st.gold += (w === 'blue' ? 1 : -1) * (1.0 + k * 0.35);
      add('fight', w, pick([
        '中路爆发团战！' + P(w, 'mid') + '的' + C(w, 'mid') + '从侧翼切入，直接秒掉' + P(OTHER(w), 'bot') + '的' + C(OTHER(w), 'bot') +
          '，' + T(w) + '打出 ' + k + ' 换 ' + dd + '。',
        '大龙坑前的视野争夺，' + P(w, 'sup') + '的' + C(w, 'sup') + '先手命中，' + T(w) + '打出一波漂亮的 ' + k + ' 换 ' + dd +
          '，对面被迫全员回城。',
        P(w, 'top') + '的' + C(w, 'top') + '在下路边线给到巨大压力，' + T(OTHER(w)) + '被迫分人回来守，中路直接被推掉一座塔。',
        '野区遭遇战！' + P(w, 'jg') + '的' + C(w, 'jg') + '在对面野区蹲到人，' + T(w) + '迅速跟上打出 ' + k + ' 换 ' + dd +
          '，节奏彻底打开。',
        '一波绕后开团！' + P(w, 'top') + '的' + C(w, 'top') + '从三角草包过来，' + T(w) + '接上控制链，' + T(OTHER(w)) +
          '的后排完全没法输出，' + k + ' 换 ' + dd + '。',
        '小龙团的二次接战！' + P(w, 'mid') + '的' + C(w, 'mid') + '技能全中，' + T(w) + '打出 ' + k + ' 换 ' + dd +
          '，这波运营差距已经很明显了。',
      ]));
    }

    // 第三条小龙 / 龙魂
    phase(980, 40);
    const d3 = st.dragons.blue > st.dragons.red ? 'blue' : (st.dragons.red > st.dragons.blue ? 'red' : (chance(0.5) ? 'blue' : 'red'));
    st.dragons[d3] += 1;
    st.gold += (d3 === 'blue' ? 1 : -1) * 0.8;
    obj('dragon', d3, '第 3 条小龙');
    add('obj', d3, '第三条小龙刷新，' + T(d3) + '打野' + P(d3, 'jg') + '的' + C(d3, 'jg') + '在龙坑前把惩戒捏得很稳，' +
      '直接收下。' + pick([
        '对面来晚一步，只能在边上干看着。',
        '这一波视野差太致命了，红方完全不知道龙什么时候没的。',
        '龙坑这边蓝方的辅助把对面的探视野全赶走了。',
      ]));

    // ================= 6. 大龙阶段 =================
    phase(1195 + ri(0, 40), 30);
    add('macro', '', fmt(t) + '，大龙刷新。' + (Math.abs(st.gold) > 3
      ? T(st.gold > 0 ? 'blue' : 'red') + '手握超过 3 千经济优势，开始在大龙坑布视野，逼对面出来接团。'
      : '两边经济咬得很紧，谁都输不起这一波大龙团。'));
    add('macro', '', pick([
      '这里是最考验指挥的一波：谁先眨眼睛，谁就把大龙拱手送人。',
      '大龙逼团已经摆好阵型了，就看哪边忍不住先开。',
      '视野全在' + T(st.gold > 0 ? 'blue' : 'red') + '手里，对面连龙坑都进不去，只能从正面走。',
    ]));

    const firstBaronSide = winner;
    st.barons[firstBaronSide] += 1;
    st.kills[firstBaronSide] += ri(2, 4); st.kills[OTHER(firstBaronSide)] += ri(0, 1);
    st.towers[firstBaronSide] += 2;
    st.gold += (firstBaronSide === 'blue' ? 1 : -1) * 3.4;
    obj('baron', firstBaronSide, '大龙');
    add('fight', firstBaronSide, '大龙团！' + T(firstBaronSide) + '的' + P(firstBaronSide, 'jg') + '在龙坑里稳稳把大龙惩下来，' +
      T(OTHER(firstBaronSide)) + '强行开团失败，反被打出一波团灭。' +
      T(firstBaronSide) + '带着大龙 buff 一路推进，连拿两座塔。' + pick([
        '这一波打完，比赛的悬念基本被杀死了。',
        '大龙 buff 加上潮虫的推塔加成，塔掉得跟纸糊的一样。',
        '对面这波开团是真的急了，阵型都没摆好就往上冲。',
      ]));
    add('macro', firstBaronSide, '大龙 buff 消化得非常彻底，' + T(firstBaronSide) + '已经压到高地塔下，' + T(OTHER(firstBaronSide)) + '的防线摇摇欲坠。');
    t += 35 + ri(0, 25);
    add('macro', OTHER(firstBaronSide), '高地防守！' + T(OTHER(firstBaronSide)) + '把' + P(OTHER(firstBaronSide), 'top') + '的' + C(OTHER(firstBaronSide), 'top') +
      '和' + P(OTHER(firstBaronSide), 'mid') + '的' + C(OTHER(firstBaronSide), 'mid') + '都调了回来，硬是拖住了这波推进。' + pick([
        '守得很难看，但塔还在，比赛没有结束。',
        '靠着高地地形勉强换掉一个进攻点。',
        '这一波守住了，但经济和视野的窟窿已经补不回来了。',
        '高地塔的血量已经见底，下一波就难说了。',
      ]));
    add('macro', firstBaronSide, '大龙 buff 已经吃掉了对面两座内塔，' + leadWord() + '，比赛进入收官阶段。');

    // ================= 7. 龙魂 =================
    phase(1430 + ri(0, 70), 40);
    const soulSide = st.dragons.blue >= st.dragons.red ? 'blue' : 'red';
    st.dragons[soulSide] += 1;
    st.souls[soulSide] = 1;
    obj('soul', soulSide, '龙魂');
    add('obj', soulSide, T(soulSide) + '集齐 4 条小龙，拿到' + pick(['火龙魂', '土龙魂', '水龙魂', '风龙魂', '海克斯龙魂']) + '。' + pick([
      '这个龙魂直接决定了后期团战的走向。',
      '龙魂到手，' + T(soulSide) + '的团战强度上了一个台阶。',
      '对面必须在这波之前结束比赛，否则就没机会了。',
    ]));
    t += 25 + ri(0, 15);
    add('macro', '', '龙魂团的站位已经摆好，' + T(OTHER(soulSide)) + '很清楚这一波必须强行开，晚一步就只能眼睁睁看着对面把龙魂吃掉。' + pick([
      '但他们的开团手段太依赖' + P(OTHER(soulSide), 'jg') + '的' + C(OTHER(soulSide), 'jg') + '，一旦被躲掉就很难再进。',
      '问题在于前排扛不住，' + P(soulSide, 'bot') + '的' + C(soulSide, 'bot') + '只要站住位置，这波就一边倒。',
      '蓝方阵型拉得太开，侧翼有个明显的空档，就看能不能抓到了。',
    ]));

    // ================= 8. 决胜 =================
    if (chance(0.45)) {
      t += 150 + ri(0, 90);
      const rb = loser;
      st.kills[rb] += ri(2, 4); st.kills[OTHER(rb)] += ri(0, 1);
      st.gold += (rb === 'blue' ? 1 : -1) * 1.8;
      add('fight', rb, '绝境反扑！' + T(rb) + '抓住对面推进过深的机会，' + P(rb, 'top') + '的' + C(rb, 'top') + '绕后开团，' +
        T(rb) + '打出一波 ' + ri(2, 4) + ' 换 ' + ri(0, 1) + '，把比赛重新拉回悬念。' + pick([
          '这波是真的敢打，输一个就没了。',
          '解说席都站起来了，这一波太关键了。',
          '对面明显是松懈了，推进阵型拉得太开。',
        ]));
      add('macro', rb, leadWord() + '，' + T(rb) + '拿回一点喘息的空间，但资源主动权还在对面手里。');
    }

    t += 45 + ri(0, 30);
    st.barons[winner] += 1;
    st.kills[winner] += ri(1, 3);
    st.gold += (winner === 'blue' ? 1 : -1) * 2.2;
    obj('baron', winner, '第 2 条大龙');
    add('obj', winner, '第二条大龙刷新，' + T(loser) + '想抢，但视野已经被彻底挤出去，' +
      P(winner, 'jg') + '的' + C(winner, 'jg') + '在龙坑里稳稳把龙惩下来。' + T(winner) + '带着大龙 buff 推平了下路二塔。');

    t += 55 + ri(0, 35);
    add('fight', '', T(loser) + '在大龙坑外做视野时被抓，' + P(loser, 'sup') + '的' + C(loser, 'sup') + '插眼直接被收掉，' +
      T(winner) + '立刻抓机会打出一波 4 换 1。');
    st.kills[winner] += 4; st.kills[loser] += 1;

    t += 40;
    add('fight', winner, '决战！' + P(winner, 'mid') + '的' + C(winner, 'mid') + '绕后闪现切进后排，' +
      P(winner, 'bot') + '的' + C(winner, 'bot') + '跟进输出，' + T(loser) + '被打出一波团灭！');
    st.kills[winner] += 4;
    st.towers[winner] += 3;
    st.gold += (winner === 'blue' ? 1 : -1) * 4.5;

    t += 28;
    add('end', winner, '中路高地被破，' + T(winner) + '五人齐推，' + T(loser) + '的血量已经撑不住下一波了。');
    t += 18;
    add('end', winner, '水晶爆掉！' + T(winner) + '拿下这一局，比赛在 ' + fmt(t) + ' 结束。');
    const gameEndT = t;

    // 人头密度：前中期阵容互相找架打，人头更多；双后期阵容更克制
    const km = Math.max(0.86, Math.min(1.18, 1.06 - (avgCurve - 56) / 240 + aggro * 0.06));
    st.kills.blue = Math.max(1, Math.round(st.kills.blue * km));
    st.kills.red = Math.max(1, Math.round(st.kills.red * km));

    // ===== 选手数据 =====
    const stats = { blue: [], red: [] };
    ['blue', 'red'].forEach((sd) => {
      const tk = st.kills[sd];
      const spread = { top: 0.17, jg: 0.2, mid: 0.24, bot: 0.29, sup: 0.1 };
      R.ROLES.forEach((role) => {
        const r = ctx[sd].roles[role];
        const k = Math.max(0, Math.round(tk * spread[role] * (0.75 + rnd() * 0.55)));
        const d = Math.max(0, Math.round(st.kills[OTHER(sd)] * spread[role] * (0.65 + rnd() * 0.95)));
        const a = Math.max(0, Math.round(tk * (0.42 + rnd() * 0.5)));
        const dmg = Math.round((role === 'bot' || role === 'mid') ? 24 + rnd() * 10 : (role === 'sup' ? 6 + rnd() * 5 : 15 + rnd() * 8));
        stats[sd].push({
          n: r.p ? r.p.n : R.ROLE_CN[role], champ: r.cn, cid: r.cid, role: role,
          k: k, d: d, a: a, dmg: dmg, rating: 0,
        });
      });
    });
    ['blue', 'red'].forEach((sd) => {
      const total = stats[sd].reduce((n, x) => n + x.dmg, 0) || 1;
      const tk = st.kills[sd] || 1;
      stats[sd].forEach((x) => {
        x.dmgPct = Math.round((x.dmg / total) * 1000) / 10;
        x.kp = Math.min(100, Math.round(((x.k + x.a) / tk) * 100));
        x.dmgRaw = Math.round(x.dmg * 620 + rnd() * 900);
        // 评分：KDA + 伤害占比 + 参团 + 胜负，3.0–9.9
        let sc = 5.0 + x.k * 0.28 + x.a * 0.1 - x.d * 0.34 + x.dmgPct * 0.055 + (x.kp - 50) * 0.012;
        sc += sd === winner ? 0.45 : -0.25;
        sc += (rnd() - 0.5) * 0.5;
        x.rating = Math.max(3.0, Math.min(9.9, Math.round(sc * 10) / 10));
        x.grade = x.rating >= 8.6 ? 'S' : x.rating >= 7.6 ? 'A' : x.rating >= 6.4 ? 'B' : x.rating >= 5.4 ? 'C' : 'D';
      });
      stats[sd].sort((a, b) => b.dmgPct - a.dmgPct);
    });

    let mvp = null;
    ['blue', 'red'].forEach((sd) => stats[sd].forEach((s) => {
      const score = s.rating + s.dmgPct * 0.1 + s.kp * 0.008 + (sd === winner ? 0.5 : 0);
      if (!mvp || score > mvp.__score) { mvp = Object.assign({ side: sd, __score: score }, s); }
    }));
    if (mvp) delete mvp.__score;

    // ===== 赛后复盘 =====
    const wStats = stats[winner];
    const topKill = wStats.slice().sort((a, b) => b.k - a.k)[0];
    add('end', '', '全场数据：' + T('blue') + ' ' + st.kills.blue + ' 杀、' + T('red') + ' ' + st.kills.red + ' 杀；' +
      '推塔 ' + st.towers.blue + ':' + st.towers.red + '，小龙 ' + st.dragons.blue + ':' + st.dragons.red +
      '，大龙 ' + st.barons.blue + ':' + st.barons.red + '，潮虫 ' + st.grubs.blue + ':' + st.grubs.red + '。', 0);
    add('end', winner, '复盘一下，' + T(winner) + '这一局赢在两个地方：一是' + pick([
      '前期用野区节奏把对面的发育线彻底打乱，' + topKill.n + '的' + topKill.champ + '滚雪球滚得很干净；',
      '中期的大龙决策做得比对面果断，一波就把经济差拉开；',
      '团战站位和开团时机明显更成熟，对面每次接团都是被动挨打的姿态；',
      '资源控制做得太细了，潮虫、先锋、小龙一条没漏，经济自然就滚起来了；',
    ]) + '二是视野压制，' + T(loser) + '全程都在盲区里做决策。', 0);
    add('end', '', '本场 MVP 给到 ' + mvp.n + ' 的 ' + mvp.champ + '，' + mvp.k + '/' + mvp.d + '/' + mvp.a + ' 的数据，评分 ' + mvp.rating + '。' + pick([
      '参团率和伤害占比都是全场最高。',
      '几波关键开团直接改变了比赛走向。',
      '从头到尾没有一次多余的操作，稳定得可怕。',
      '这个数据摆在这里，没什么好争的。',
    ]), 0);

    return {
      winner: winner,
      loser: loser,
      duration: fmt(gameEndT),
      durationMin: Math.round((gameEndT / 60) * 10) / 10,
      events: ev,
      timeline: tl,
      objectives: objs,
      kills: st.kills,
      towers: st.towers,
      dragons: st.dragons,
      grubs: st.grubs,
      heralds: st.heralds,
      barons: st.barons,
      souls: st.souls,
      stats: stats,
      mvp: mvp,
      comments: buildComments(stats, mvp, winner, match, rnd),
      summary: buildSummary(winner, st, mvp, match, an),
      seed: opts.seed || 0,
    };
  }

  // ===== 网友评论生成 =====
  const USERS = [
    '虎扑JR', '抗压吧老哥', '贴吧用户', 'B站弹幕', '微博网友', '电竞老哥', '峡谷之巅路人', '大乱斗玩家',
    '排位失败者', '十年老粉', '云玩家本家', '野区管家', '中路吃线王', '补刀强迫症', '龙坑常驻', '复盘区UP',
  ];
  const PRAISE = [
    '{n} 这把是真的顶，{c} 打出这个 {k}/{d}/{a}，身价直接打出来了。',
    '给 {n} 道个歉，之前说你菜是我声音大了，这 {c} 我服。',
    '{n} 的 {c} 打得太干净了，每次开团都卡在对面最难受的位置。',
    '这局 {n} 就是大腿，{c} 一个人把节奏带起来了，{k} 杀不是白拿的。',
    '{n} 这把稳得离谱，伤害占比 {dp}%、参团 {kp}%，一个失误都挑不出来。',
    '说实话 {n} 的 {c} 有点版本答案那味了，对面完全处理不了。',
    '{n} 这操作我可以吹一年，{c} 那波绕后是真的细节。',
  ];
  const FLAME = [
    '{n} 这 {c} 玩得跟代练一样，{d} 次死亡是怎么做到的？',
    '给 {n} 的 {c} 打个分，满分 10 分我给 3 分，剩下 7 分怕他骄傲。',
    '{n} 这把但凡少送两次，队友也不用打得这么累，{c} 是真不会玩。',
    '建议 {n} 把 {c} 从英雄池里删了，真的，我看得血压高。',
    '{n} 的闪现是按次收费吗？一整把就没见他交过一次。',
    '对面打野来抓 {n} 跟回家一样熟，{c} 这视野是摆设吗？',
    '{n} 这数据 {k}/{d}/{a}，我上我也行，反正都是送。',
    '说实话 {n} 这个 {c} 我没看懂，选出来是给对面送温暖的吗？',
    '{n} 一个人把全队的节奏拖没了，{d} 次死亡每次都在关键节点。',
    '不是我说，{n} 这 {c} 的熟练度是负的吧？技能都能空成这样。',
  ];
  const MEME = [
    '这局 {n} 的 {c}，我只能说：赢了是神，输了是鬼，今天刚好是鬼。',
    '{n} 的 {c} 打得像在完成 KPI，{d} 次死亡，达标了。',
    '建议给 {n} 的 {c} 出个纪念皮肤，毕竟这局之后可能看不到了。',
    '解说：{n} 的 {c} 很稳。我：稳送。',
    '{n} 这把 {c} 的存在感，跟我排位里那个挂机队友差不多。',
    '弹幕别骂了，{n} 的 {c} 已经很努力在送了，只是送得不够快。',
    '{n} 的 {c} 让我想起了我第一次玩这个英雄，区别是我没打职业。',
  ];
  // 带外号的评论：{nk} 是选手外号，{team} 队名，{rl} 位置中文
  const PRAISE2 = [
    '{nk} 这局是真的顶，{c} 打出 {k}/{d}/{a}，身价又涨了一截。',
    '给 {nk} 道个歉，之前我说他菜，是我声音大了，这个 {c} 我服。',
    '{nk} 的 {c} 打得太干净了，每次进场都卡在对面最难受的点上。',
    '{team} 今天能赢，{nk} 的 {c} 至少占三成功劳，{k} 杀不是白拿的。',
    '说实话 {nk} 这个 {rl} 是真的稳，{c} 拿出来就有底。',
    '{nk} 这操作我能吹一年，{c} 那波绕后是细节拉满的。',
    '{team} 的 {rl} 位有 {nk} 在，{c} 这种英雄他是真敢拿也真敢打。',
    '{nk} 这把伤害占比 {dp}%、参团 {kp}%，属于是把活干完了。',
  ];
  const FLAME2 = [
    '{nk} 这 {c} 玩得跟代练一样，{d} 次死亡是怎么做到的？',
    '给 {nk} 的 {c} 打个分，10 分制我给 3 分，剩下 7 分怕他骄傲。',
    '{nk} 这把但凡少送两次，队友也不用打得这么累。',
    '建议 {nk} 把 {c} 从英雄池里删了，真的，我看得血压高。',
    '{nk} 的闪现是按次收费吗？一整把就没见他交过一次。',
    '对面打野来抓 {nk} 跟回家一样熟，这视野是摆设吗？',
    '{nk} 这数据 {k}/{d}/{a}，我上我也行，反正都是送。',
    '{team} 的 {rl} 位今天是个突破口，{nk} 的 {c} 连技能都空。',
    '不是我说，{nk} 对 {c} 的熟练度是负的吧？这也能打职业？',
    '{nk} 一个人把全队节奏拖没了，{d} 次死亡每次都在关键节点。',
  ];
  const MEME2 = [
    '这局 {nk} 的 {c}，我只能说：赢了是神，输了是鬼，今天刚好是鬼。',
    '{nk} 的 {c} 打得像在完成 KPI，{d} 次死亡，达标了。',
    '建议给 {nk} 的 {c} 出个纪念皮肤，毕竟这局之后可能就看不到了。',
    '解说：{nk} 的 {c} 很稳。我：稳送。',
    '{nk} 这把 {c} 的存在感，跟我排位里那个挂机队友差不多。',
    '弹幕别骂了，{nk} 的 {c} 已经很努力在送了，只是送得不够快。',
    '{nk} 的 {c} 让我想起我第一次玩这个英雄，区别是我没打职业。',
    '{nk} 这个外号真是没白叫，{c} 一拿出来弹幕就开始刷了。',
    '{team} 粉丝：我们相信 {nk}。{nk}：那我先送一个。',
    '{nk} 的 {c} 是今天最稳定的输出——稳定给对面送人头。',
  ];
  const ROLE_BANTER = {
    top: ['上路一个人扛三个，{nk} 的 {c} 是真顶得住。', '{nk} 这上路对线把对面压得一分钱都不敢补。'],
    jg: ['{nk} 的野区被反烂了，这把节奏全在对面手里。', '{nk} 这个 {c} 打野，把地图当自己家客厅在用。'],
    mid: ['{nk} 中路被抓成筛子，这 {c} 一点安全感都没有。', '{nk} 这个 {c} 的中路压制力，对面中单估计想换线了。'],
    bot: ['{nk} 这局 {c} 输出打得飞起，对面 AD 全程在躲。', '{nk} 的 {c} 在线上一被压就整把消失，输出位打成这样挺可惜。'],
    sup: ['{nk} 的视野布得像开图，这 {c} 的游走太关键了。', '{nk} 这 {c} 开团开得漂亮，{team} 的团战全靠他起手。'],
  };
  // 虎扑/贴吧那套黑称毒舌：{bk} 黑称，只落在表现和 BP 上，不编造场外
  const FLAME3 = [
    '{bk} 这 {c} 是什么菜逼操作？{k}/{d}/{a} 的数据，也配在这个位置先手拿？',
    '{team} 的 {rl} 位就这水平？{bk} 这个 {c} 打得我血压都上来了。',
    '{bk} 这 {c} 一选出来我就知道要输，{team} 的 BP 是智障吗？',
    '别洗了，{bk} 这 {c} 对线就被打穿，菜得明明白白，{d} 次死亡全是自己送的。',
    '{k}/{d}/{a}，{bk} 这是来上班的吗？{c} 的熟练度看得我想关直播间。',
    '{bk} 这个 {rl} 打成这样还能留在首发，{team} 是真没人了。',
    '对面早就知道 {bk} 只会 {c}，按着这个点打，{team} 一点办法都没有。',
    '{bk} 的 {c} 跟挂机有什么区别？队友四个人打五个，太惨了。',
    '说实话 {bk} 这局的 {c} 就是个提款机，谁路过都能拿一笔。',
    '{team} 教练组也是绝了，{bk} 这个状态还给先抢 {c}，输得不冤。',
    '{bk}：我尽力了。弹幕：你尽力送了吧，{d} 次死亡。',
    '这 {c} 给 {bk} 玩真是浪费，{k} 杀 {d} 死，菜逼两个字写在脸上了。',
  ];
  function buildComments(stats, mvp, winner, match, rnd) {
    const out = [];
    ['blue', 'red'].forEach((sd) => {
      const team = match[sd].team;
      stats[sd].forEach((s) => {
        const good = s.rating >= (sd === winner ? 6.8 : 6.5);
        const pool = [];
        const isMvp = !!(mvp && mvp.n === s.n && mvp.side === sd);
        const shots = (isMvp ? 5 : 4) + (rnd() < 0.5 ? 1 : 0);
        for (let i = 0; i < shots; i++) {
          const harsh = !good || rnd() < 0.3;
          let tpl;
          let tone;
          if (rnd() < 0.14) {
            tpl = pickFrom(ROLE_BANTER[s.role] || ROLE_BANTER.mid, rnd);
            tone = harsh ? 'flame' : 'praise';
          } else if (harsh) {
            // 虎扑风：三成走黑称毒舌，其余在常规/梗里抽
            const r0 = rnd();
            if (r0 < 0.34) tpl = pickFrom(FLAME3, rnd);
            else if (r0 < 0.8) tpl = pickFrom(FLAME.concat(FLAME2), rnd);
            else tpl = pickFrom(MEME.concat(MEME2), rnd);
            tone = 'flame';
          } else {
            tpl = pickFrom(rnd() < 0.82 ? PRAISE.concat(PRAISE2) : MEME.concat(MEME2), rnd);
            tone = 'praise';
          }
          pool.push({ tpl: tpl, tone: tone });
        }
        const list = pool.map((it) => ({
          u: pickFrom(USERS, rnd) + (100 + Math.floor(rnd() * 899)),
          text: fill(it.tpl, {
            n: s.n, c: s.champ, k: s.k, d: s.d, a: s.a, dp: s.dmgPct, kp: s.kp,
            nk: nickOf(s.n, rnd), bk: blackOf(s.n, rnd), team: team, rl: R.ROLE_CN[s.role] || '',
          }),
          likes: Math.max(3, Math.round(rnd() * 900 + (good ? 120 : 40))),
          tone: it.tone,
        }));
        out.push({ side: sd, team: team, role: s.role, n: s.n, champ: s.champ, cid: s.cid, rating: s.rating, grade: s.grade, comments: list });
      });
    });
    return out;
  }
  function nickOf(name, rnd) {
    const NU = window.NickUtil;
    if (NU && NU.pick) {
      const v = NU.pick(name, rnd);
      if (v && v !== name) return v;
    }
    return name;
  }
  function blackOf(name, rnd) {
    const NU = window.NickUtil;
    if (NU && NU.black) {
      const v = NU.black(name, rnd);
      if (v && v !== name) return v;
    }
    return nickOf(name, rnd);
  }
  function pickFrom(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }

  function buildSummary(winSide, st, mvp, match, an) {
    const W = match[winSide].team, L = match[winSide === 'blue' ? 'red' : 'blue'].team;
    const parts = [];
    parts.push(W + '以 ' + st.kills[winSide] + ':' + st.kills[winSide === 'blue' ? 'red' : 'blue'] + ' 的击杀数拿下比赛，全程节奏掌握得相当到位。');
    if (mvp) parts.push('本场 MVP 给到 ' + mvp.n + ' 的 ' + mvp.champ + '，' + mvp.k + '/' + mvp.d + '/' + mvp.a + ' 的数据，评分 ' + mvp.rating + '，参团和输出都拉满了。');
    const wSc = an.prof ? an.prof[winSide].sc : null;
    if (wSc) {
      if (wSc.early > wSc.scale) parts.push(W + '把前期的强势期兑现得非常彻底，' + L + '几乎没等到自己的后期窗口。');
      else parts.push(W + '靠后期阵容的成长性完成了接管，' + L + '在关键的大龙团里没能一锤定音。');
    }
    parts.push('这支阵容的团战执行力和资源决策，就是这一局的分水岭。');
    return parts.join('');
  }

  window.Sim = { run: run };
})();
