// 主逻辑与界面
(function () {
  const R = window.RULES;
  const D = window.Draft;
  const AN = window.Analyze;
  const SIM = window.Sim;
  const CHAMPS = window.CHAMPIONS || [];
  const TEAMS = window.TEAMS || [];
  const PLAYERS = window.PLAYERS || [];
  const PHOTOS = window.PHOTOS || {};
  const LOGOS = window.TEAM_LOGOS || {};

  const $ = (s, root) => (root || document).querySelector(s);
  const $$ = (s, root) => Array.prototype.slice.call((root || document).querySelectorAll(s));

  const CHAMP_BY_ID = {};
  CHAMPS.forEach((c) => { CHAMP_BY_ID[c.i] = c; });
  const TEAM_BY_NAME = {};
  TEAMS.forEach((t) => { TEAM_BY_NAME[t.t] = t; });

  // ===== 本地自定义：队伍 / 选手池 / 头像 =====
  const POOL = '__pool__';
  const POOL_CN = '自由选手池';
  const K_TEAMS = 'bp_teams_v1';
  const K_CUSTOM = 'bp_custom_v1';
  const K_PHOTOS = 'bp_photos_v1';
  const MOVED = []; // 被转入自由池的原始选手（队名|名字）

  function loadStoredData() {
    // 1) 自定义队伍
    try {
      const arr = JSON.parse(localStorage.getItem(K_TEAMS) || '[]');
      arr.forEach((t) => {
        if (!t || !t.t || TEAM_BY_NAME[t.t]) return;
        t.custom = 1;
        TEAMS.push(t);
        TEAM_BY_NAME[t.t] = t;
        if (t.logo) LOGOS[t.t] = t.logo;
      });
    } catch (e) { /* ignore */ }
    // 2) 自定义头像（dataURL）
    try {
      const photos = JSON.parse(localStorage.getItem(K_PHOTOS) || '{}');
      Object.keys(photos).forEach((k) => { PHOTOS[k] = photos[k]; });
    } catch (e) { /* ignore */ }
    // 3) 转入自由池 / 自定义选手
    try {
      const data = JSON.parse(localStorage.getItem(K_CUSTOM) || '{}');
      (data.moved || []).forEach((k) => {
        MOVED.push(k);
        const i = PLAYERS.findIndex((p) => p.t + '|' + p.n === k);
        if (i >= 0) PLAYERS.splice(i, 1);
      });
      (data.added || []).forEach((p) => {
        if (!p || !p.t || !p.n) return;
        if (PLAYERS.some((x) => x.t === p.t && x.n === p.n)) return;
        PLAYERS.push(Object.assign({ a: 76, d: 76, f: 76, b: 76, p: 76, s: [], sub: 0 }, p, { custom: 1 }));
      });
    } catch (e) { /* ignore */ }
  }
  loadStoredData();

  const state = {
    mode: 'BO5',
    teams: { blue: 'T1', red: 'Gen.G Esports' },
    opts: { fearless: true, banCarry: false, timer: 30 },
    playMode: 'pvp',
    mySide: 'blue',
    myTeam: '',
    caster: true,
    casterLog: [],
    aiProf: 'control',
    aiPaused: false,
    aiSpeed: 1,
    aiTimer: null,
    aiLog: [],
    results: [],
    pom: null,
    series: null,
    filter: { pos: 'all', tag: 'all', q: '' },
    assign: { blue: {}, red: {} },
    players: { blue: {}, red: {} },
    lineup: { blue: {}, red: {} },
    analysis: null,
    sim: null,
    selChip: null,
    suggest: [],
    timerHandle: null,
    timeLeft: 0,
    feedTimer: null,
    feedIndex: 0,
  };

  function seriesTeamOf(side) {
    const s = state.series;
    if (s && s.cur) return s.cur[side];
    return state.teams[side];
  }
  // 你执教的队伍：整场跟随队伍，不跟随边
  function isMySide(side) {
    if (!state.myTeam) return side === state.mySide;
    return seriesTeamOf(side) === state.myTeam;
  }
  function mySideNow() {
    return isMySide('blue') ? 'blue' : 'red';
  }
  function isAiSide(side) {
    if (state.playMode === 'eve') return true;
    if (state.playMode === 'pve') return !isMySide(side);
    return false;
  }
  function aiProfileFor(side) {
    if (state.aiProf === 'mix') return side === 'blue' ? 'control' : 'tempo';
    return state.aiProf;
  }

  // ================= 工具 =================
  function champImg(id) { return 'assets/champ/tile/' + id + '.png'; }
  function champSplash(id) { return 'assets/champ/splash/' + id + '.jpg'; }
  function champArt(id) { return 'assets/champ/art/' + id + '.jpg'; }
  function champName(id) { return CHAMP_BY_ID[id] ? CHAMP_BY_ID[id].c : id; }
  function champTitle(id) { return CHAMP_BY_ID[id] ? CHAMP_BY_ID[id].t : ''; }
  function photoOf(team, name) { return PHOTOS[team + '|' + name]; }

  function avatarHtml(player, team, size) {
    const st = size ? ' style="width:' + size + 'px;height:' + size + 'px"' : '';
    if (!player) return '<span class="av-fb"' + st + '>?</span>';
    const src = photoOf(player.t || team, player.n);
    if (src) return '<img src="' + src + '" alt=""' + st + ' onerror="this.style.display=\'none\'">';
    return '<span class="av-fb"' + st + '>' + (player.n[0] || '?') + '</span>';
  }

  function logoHtml(team, cls) {
    const src = LOGOS[team];
    if (src) return '<img src="' + src + '" alt="' + team + '" class="' + (cls || '') + '" onerror="this.style.display=\'none\'">';
    return '<div class="logo-fallback">' + (TEAM_BY_NAME[team] ? TEAM_BY_NAME[team].tag : team.slice(0, 3)) + '</div>';
  }

  function rosterOf(team) { return PLAYERS.filter((p) => p.t === team); }

  // 上场可用名单：本队名单 + 自由选手池（可进任意队）
  function fieldRoster(team) {
    return PLAYERS.filter((p) => p.t === team).concat(PLAYERS.filter((p) => p.t === POOL));
  }

  function defaultPlayers(team) {
    const map = {};
    const own = rosterOf(team);
    const all = fieldRoster(team);
    R.ROLES.forEach((r) => {
      map[r] = own.find((p) => p.r === r && !p.sub) || own.find((p) => p.r === r) ||
        all.find((p) => p.r === r && !p.sub) || all.find((p) => p.r === r) || null;
    });
    return map;
  }

  function toast(msg) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function showScreen(id) {
    $$('.screen').forEach((s) => s.classList.remove('active'));
    const el = $('#' + id);
    if (el) el.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ================= 首页 =================
  function initHome() {
    const bSel = $('#home-blue-team');
    const rSel = $('#home-red-team');
    const opts = TEAMS.slice().sort((a, b) => a.t.localeCompare(b.t));
    [bSel, rSel].forEach((sel) => {
      sel.innerHTML = opts.map((t) => '<option value="' + t.t + '">' + t.t + '（' + t.tag + '）</option>').join('');
    });
    bSel.value = state.teams.blue;
    rSel.value = state.teams.red;
    bSel.onchange = () => { state.teams.blue = bSel.value; renderHomeSides(); };
    rSel.onchange = () => { state.teams.red = rSel.value; renderHomeSides(); };

    $$('#mode-switch button').forEach((btn) => {
      btn.onclick = () => {
        $$('#mode-switch button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.mode = btn.dataset.mode;
      };
    });

    // 对局模式：玩家 vs 玩家 / 玩家 vs AI / AI vs AI
    const syncPm = () => {
      $('#pm-side-wrap').hidden = state.playMode !== 'pve';
      $('#pm-prof-wrap').hidden = state.playMode === 'pvp';
      const tip = document.querySelector('.pm-tip');
      if (tip) {
        tip.textContent = state.playMode === 'pvp'
          ? '两边都由你手动 BP，AI 只在「AI 代打这一手」时替当前方出手。'
          : state.playMode === 'pve'
            ? '你执一支队伍，整场跟着它走：它这局在红就在红，下局换到蓝也是你。对手 AI 的 ban / pick 自动完成。'
            : '双方全部由 AI 自动完成 20 手 BP，你可以暂停、调速度，全程看 AI 怎么博弈。';
      }
    };
    $$('#playmode-switch button').forEach((btn) => {
      btn.onclick = () => {
        $$('#playmode-switch button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.playMode = btn.dataset.pm;
        // AI vs AI：比分、选手名不依赖某方，仍用蓝红两队
        syncPm();
      };
    });
    $('#myside-team').onchange = (e) => {
      state.myTeam = e.target.value;
      state.mySide = state.myTeam === state.teams.red ? 'red' : 'blue';
    };
    $$('#prof-switch button').forEach((btn) => {
      btn.onclick = () => {
        $$('#prof-switch button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.aiProf = btn.dataset.prof;
      };
    });
    syncPm();

    $('#opt-fearless').onchange = (e) => { state.opts.fearless = e.target.checked; };
    $('#opt-bancarry').onchange = (e) => { state.opts.banCarry = e.target.checked; };
    $('#opt-caster').onchange = (e) => {
      state.caster = e.target.checked;
      renderCaster();
      const b = $('#btn-caster');
      if (b) b.textContent = '解说：' + (state.caster ? '开' : '关');
    };
    $('#opt-timer').onchange = (e) => { state.opts.timer = Math.max(0, Math.min(120, parseInt(e.target.value, 10) || 0)); };

    $('#btn-start').onclick = startSeries;
    $('#btn-random').onclick = () => {
      const a = TEAMS[Math.floor(Math.random() * TEAMS.length)].t;
      let b = TEAMS[Math.floor(Math.random() * TEAMS.length)].t;
      while (b === a) b = TEAMS[Math.floor(Math.random() * TEAMS.length)].t;
      state.teams.blue = a; state.teams.red = b;
      state.myTeam = a;
      bSel.value = a; rSel.value = b;
      renderHomeSides();
    };

    renderHomeSides();
  }

  function lineupPlayer(sd, role) {
    const team = state.teams[sd];
    const list = fieldRoster(team);
    const want = (state.lineup[sd] || {})[role];
    let p = want ? list.find((x) => x.n === want) : null;
    if (!p) p = list.find((x) => x.r === role && !x.sub) || list.find((x) => x.r === role) || null;
    return p;
  }

  function renderHomeSides() {
    ['blue', 'red'].forEach((sd) => {
      const team = state.teams[sd];
      $('#home-' + sd + '-logo').innerHTML = logoHtml(team);
      const list = fieldRoster(team);
      if (!list.length) {
        $('#home-' + sd + '-roster').innerHTML = '<div class="roster-empty">这支队伍还没有选手，点右上角「编辑选手数据」加人，或从自由选手池转进来。</div>';
        return;
      }
      $('#home-' + sd + '-roster').innerHTML = R.ROLES.map((r) => {
        const p = lineupPlayer(sd, r);
        const opts = list.map((x) =>
          '<option value="' + x.n + '"' + (p && p.n === x.n ? ' selected' : '') + '>' +
          x.n + (x.r === r ? '' : '（' + R.ROLE_CN[x.r] + '）') + (x.sub ? '·替补' : '') +
          (x.t === POOL ? '·自由' : '') + '</option>').join('');
        return '<div class="roster-row">' +
          '<span class="rl-pos">' + R.ROLE_CN[r] + '</span>' +
          avatarHtml(p, team) +
          '<select class="rl-sel" data-side="' + sd + '" data-role="' + r + '" title="换人">' + opts + '</select>' +
          '<span class="rl-rating">' + (p ? Math.round(D.playerScore(p)) : '—') + '</span>' +
          '</div>';
      }).join('');
    });

    $$('.rl-sel').forEach((sel) => {
      sel.onchange = () => {
        const sd = sel.dataset.side, role = sel.dataset.role;
        state.lineup[sd][role] = sel.value;
        renderHomeSides();
      };
    });

    // 你执教的队伍（整场跟随队伍，不跟随边）
    const mine = $('#myside-team');
    if (mine) {
      const pair = [state.teams.blue, state.teams.red];
      if (pair.indexOf(state.myTeam) < 0) state.myTeam = pair[0];
      state.mySide = state.myTeam === state.teams.red ? 'red' : 'blue';
      mine.innerHTML = pair.map((t) => '<option value="' + t + '">' + t + '（首局' +
        (t === state.teams.blue ? '蓝色方' : '红色方') + '）</option>').join('');
      mine.value = state.myTeam;
    }
  }

  // ================= 开始系列赛 =================
  function startSeries() {
    if (state.teams.blue === state.teams.red) { toast('两队不能相同，换一个对手吧'); return; }
    if (!state.myTeam || [state.teams.blue, state.teams.red].indexOf(state.myTeam) < 0) {
      state.myTeam = state.teams.blue;
    }
    if (state.playMode === 'pve') state.mySide = state.myTeam === state.teams.red ? 'red' : 'blue';
    const miss = [];
    ['blue', 'red'].forEach((sd) => {
      const dp = defaultPlayers(state.teams[sd]);
      R.ROLES.forEach((r) => { if (!dp[r]) miss.push(state.teams[sd] + '·' + R.ROLE_CN[r]); });
    });
    if (miss.length) { toast('这些位置还没有选手：' + miss.join('、') + '，去「编辑选手数据」加一个'); return; }
    state.series = D.newSeries({
      mode: state.mode,
      fearless: state.opts.fearless,
      banCarry: state.opts.banCarry,
      timer: state.opts.timer,
    });
    state.series.aiMoves = [];
    state.series.playMode = state.playMode;
    state.series.mySide = state.mySide;
    state.series.myTeam = state.myTeam;
    state.results = [];
    state.pom = null;
    state.aiLog = [];
    state.aiPaused = false;
    state.aiSpeed = 1;
    D.startGame(state.series, state.teams.blue, state.teams.red);
    state.suggest = [];
    state.filter = { pos: 'all', tag: 'all', q: '' };
    $('#champ-search').value = '';
    showScreen('screen-draft');
    renderDraft();
    startTimer();
    maybeAiStep();
  }

  // ================= BP 界面 =================
  function greedyAssign(picks) {
    const map = {};
    const used = {};
    const opts = picks.map((id) => {
      const set = [];
      const pr = window.StyleDB && window.StyleDB.proRoles ? window.StyleDB.proRoles(id) : null;
      if (pr) {
        Object.keys(pr).sort((a, b) => (pr[b].share || 0) - (pr[a].share || 0)).forEach((r) => {
          if (R.ROLES.indexOf(r) >= 0 && set.indexOf(r) < 0) set.push(r);
        });
      }
      D.champPos(id).forEach((p) => {
        const r = D.POS2ROLE[p] || p;
        if (R.ROLES.indexOf(r) >= 0 && set.indexOf(r) < 0) set.push(r);
      });
      return { id: id, set: set };
    });
    opts.slice().sort((a, b) => a.set.length - b.set.length).forEach((o) => {
      let role = o.set.find((r) => !used[r]) || R.ROLES.find((r) => !used[r]) || o.set[0] || 'mid';
      used[role] = true;
      map[role] = o.id;
    });
    return map;
  }

  function startTimer() {
    stopTimer();
    const g = state.series && state.series.cur;
    if (!g) return;
    if (state.series.cfg.timer <= 0 || D.bpComplete(state.series)) {
      $('#timer-ring').className = 'timer-ring';
      $('#timer-num').textContent = '∞';
      return;
    }
    state.timeLeft = state.series.cfg.timer;
    $('#timer-ring').classList.add('active');
    $('#timer-num').textContent = state.timeLeft;
    state.timerHandle = setInterval(() => {
      state.timeLeft--;
      const ring = $('#timer-ring');
      $('#timer-num').textContent = Math.max(0, state.timeLeft);
      if (state.timeLeft <= 5) { ring.classList.add('urgent'); }
      if (state.timeLeft <= 0) {
        stopTimer();
        const id = D.aiChoose(state.series);
        if (id) {
          const st = D.curStep(state.series);
          D.commit(state.series, id);
          toast('超时！系统自动为' + R.SIDE_CN[st.side] + (st.type === 'ban' ? '禁用' : '选择了') + ' ' + champName(id));
          afterCommit();
        }
      }
    }, 1000);
  }
  function stopTimer() {
    if (state.timerHandle) { clearInterval(state.timerHandle); state.timerHandle = null; }
    const ring = $('#timer-ring');
    if (ring) ring.classList.remove('urgent');
  }

  function renderDraft() {
    const s = state.series;
    if (!s || !s.cur) return;
    const g = s.cur;

    $('#dh-blue').innerHTML = logoHtml(g.blue) + '<span>' + g.blue + '</span>';
    $('#dh-red').innerHTML = '<span>' + g.red + '</span>' + logoHtml(g.red);
    $('#draft-score').textContent = (s.score[s.cur.blue] || 0) + ' : ' + (s.score[s.cur.red] || 0);
    $('#draft-game-no').textContent = '第 ' + g.no + ' 局 · ' + s.cfg.mode + (s.cfg.fearless ? ' · 无畏征召' : '');

    // 回合提示
    const st = D.curStep(s);
    const banner = $('#turn-banner');
    if (!st) {
      banner.className = 'turn-banner done';
      banner.textContent = D.bpComplete(s) ? 'BP 结束' : '等待中';
    } else {
      banner.className = 'turn-banner ' + st.side;
      const num = g.step + 1;
      const actor = state.playMode === 'pvp' ? '' : ' · ' + aiLabel(st.side);
      banner.textContent = R.SIDE_CN[st.side] + (st.type === 'ban' ? ' 禁用' : ' 选人') + ' · 第 ' + num + ' / 20 手' + actor;
    }

    // 进度条
    $('#step-track').innerHTML = R.STEPS.map((x, i) => {
      let cls = 'step-dot ' + x.side;
      if (x.type === 'ban') cls += ' ban';
      if (i < g.step) cls += ' done';
      if (i === g.step) cls += ' cur';
      return '<div class="' + cls + '"></div>';
    }).join('');

    // 本大场已消耗的英雄（无畏征召）
    const locked = [];
    if (s.cfg.fearless) {
      s.lockedPicks.forEach((id) => locked.push({ id: id, t: 'pick' }));
      if (s.cfg.banCarry) s.lockedBans.forEach((id) => locked.push({ id: id, t: 'ban' }));
    }
    const pl = $('#pool-locked');
    if (pl) {
      if (locked.length) {
        pl.innerHTML = '<span class="pl-label">本大场已锁 ' + locked.length + ' 个</span><div class="pl-list">' +
          locked.map((x) => '<span class="pl-chip ' + x.t + '" title="' + champName(x.id) + '"><img src="' + champImg(x.id) + '" alt="" loading="lazy" onerror="this.style.opacity=.25"><i>' + champName(x.id) + '</i></span>').join('') +
          '</div>';
      } else {
        pl.innerHTML = '';
      }
    }

    // ban / pick 栏
    ['blue', 'red'].forEach((sd) => {
      const pickMap = greedyAssign(g.picks[sd]);
      const picksArr = g.picks[sd];
      const banHtml = [0, 1, 2, 3, 4].map((i) => {
        const id = g.bans[sd][i];
        if (!id) {
          return '<div class="ban-slot ' + sd + '"><span class="idx">B' + (i + 1) + '</span></div>';
        }
        return '<div class="ban-slot ' + sd + ' filled">' +
          '<img src="' + champImg(id) + '" alt="" onerror="this.style.opacity=.25">' +
          '<span class="ban-x"></span>' +
          '<span class="idx">B' + (i + 1) + '</span>' +
          '</div>';
      }).join('');
      $('#ban-' + sd).innerHTML = banHtml;

      const pickHtml = [0, 1, 2, 3, 4].map((i) => {
        const id = picksArr[i];
        if (!id) {
          const isCur = st && st.side === sd && st.type === 'pick' && picksArr.length === i;
          return '<div class="pick-slot ' + sd + (isCur ? ' cur' : '') + ' empty">' +
            '<div class="pick-info"><span class="pick-no">P' + (i + 1) + '</span>' +
            '<span class="pick-champ" style="color:var(--dim)">待选择</span></div></div>';
        }
        const role = Object.keys(pickMap).find((r) => pickMap[r] === id);
        const player = (role && lineupPlayer(sd, role)) || (role ? D.playerOf(g[sd], role) : null);
        return '<div class="pick-slot ' + sd + '">' +
          '<div class="pick-splash" style="background-image:url(' + champSplash(id) + ')"></div>' +
          '<div class="pick-grad"></div>' +
          '<div class="pick-info">' +
          '<span class="pick-champ">' + champName(id) + '</span>' +
          '<span class="pick-role">' + (role ? (R.ROLE_CN[role] || '') : '') + '</span>' +
          '<span class="pick-player">' + (player ? avatarHtml(player, g[sd], 20) + '<i>' + player.n + '</i>' : '') + '</span>' +
          '</div></div>';
      }).join('');
      $('#pick-' + sd).innerHTML = pickHtml;
    });

    renderChampGrid();
    renderSuggest();
    renderAiLog();
    renderCaster();

    if (D.bpComplete(s)) {
      stopTimer();
      setTimeout(() => {
        try {
          goAssign();
        } catch (err) {
          console.error(err);
          toast('进入阵容整理失败：' + (err && err.message ? err.message : err));
        }
      }, 350);
    } else maybeAiStep();
  }

  // ================= AI 对局引擎 =================
  function aiLabel(side) {
    return isAiSide(side) ? 'AI · ' + (aiProfileFor(side) === 'tempo' ? '节奏流' : '运营流') : '你';
  }

  function pushAiMove(plan, st, assist) {
    const s = state.series;
    const rec = {
      game: s.cur.no, no: s.cur.step + 1, side: plan.side, type: plan.type,
      id: plan.id, name: champName(plan.id), role: plan.role,
      profile: aiProfileFor(plan.side), why: plan.why || [], sidePlan: plan.sidePlan,
      team: s.cur[plan.side], assist: !!assist,
    };
    if (!s.aiMoves) s.aiMoves = [];
    s.aiMoves.push(rec);
    state.aiLog.push(rec);
    return rec;
  }

  function maybeAiStep() {
    clearTimeout(state.aiTimer);
    const s = state.series;
    if (!s || D.bpComplete(s)) return;
    const st = D.curStep(s);
    if (!st || !isAiSide(st.side) || state.aiPaused) return;
    const delay = state.playMode === 'eve' ? Math.max(300, Math.round(1600 / state.aiSpeed)) : 850;
    state.aiTimer = setTimeout(() => {
      const s2 = state.series;
      if (!s2 || D.bpComplete(s2)) return;
      const st2 = D.curStep(s2);
      if (!st2 || !isAiSide(st2.side) || state.aiPaused) return;
      doAiStep(st2, false);
    }, delay);
  }

  function doAiStep(st, assist) {
    const s = state.series;
    if (!s || !st) return;
    let plan = null;
    try { plan = D.aiPlan(s, { profile: aiProfileFor(st.side) }); } catch (e) { plan = null; }
    if (!plan || !plan.id) {
      const id = D.aiChoose(s);
      D.commit(s, id);
      afterCommit();
      return;
    }
    pushAiMove(plan, st, assist);
    D.commit(s, plan.id);
    afterCommit();
  }

  function renderAiLog() {
    const box = $('#ai-log');
    const s = state.series;
    if (!box) return;
    if (!s || state.playMode === 'pvp') { box.hidden = true; return; }
    box.hidden = false;
    let head = '<div class="ail-head"><b>AI 的 BP 思路</b>';
    if (state.playMode === 'eve') {
      head += '<span class="ail-state">' + (state.aiPaused ? '⏸ 已暂停' : '▶ 自动对局中') + '</span>' +
        '<button class="ail-btn" data-ail="pause">' + (state.aiPaused ? '继续' : '暂停') + '</button>' +
        '<button class="ail-btn" data-ail="speed">速度 ×' + state.aiSpeed + '</button>';
    } else {
      const my = mySideNow();
      const opp = my === 'blue' ? 'red' : 'blue';
      const oppTeam = s.cur ? s.cur[opp] : state.teams[opp];
      head += '<span class="ail-state">你执 ' + state.myTeam + '（本局' + R.SIDE_CN[my] + '），对手 ' + oppTeam +
        ' 是 AI（' + (aiProfileFor(opp) === 'tempo' ? '节奏流' : '运营流') + '）</span>';
    }
    head += '</div>';

    const moves = (s.aiMoves || []).filter((mv) => mv.game === s.cur.no);
    let body = '';
    if (!moves.length) {
      body = '<div class="ail-empty">AI 还没出手，等它想一下…</div>';
    } else {
      body = '<div class="ail-list">' + moves.slice(-3).reverse().map((mv) => {
        const who = mv.assist ? 'AI 代打' : aiLabel(mv.side);
        const act = mv.type === 'ban' ? '禁用' : '选中';
        return '<div class="ail-item ' + mv.side + ' ' + mv.type + '">' +
          '<div class="ail-top"><span class="ail-side">' + R.SIDE_CN[mv.side] + '</span>' +
          '<span class="ail-act ' + mv.type + '">' + act + '</span>' +
          '<b class="ail-champ">' + mv.name + '</b>' +
          '<span class="ail-who">' + who + ' · 第 ' + mv.no + ' 手</span></div>' +
          (mv.why && mv.why.length
            ? '<ul class="ail-why">' + mv.why.map((w) => '<li>' + w + '</li>').join('') + '</ul>'
            : '') +
          '</div>';
      }).join('') + '</div>';
    }
    box.innerHTML = head + body;

    $$('#ai-log .ail-btn').forEach((btn) => {
      btn.onclick = () => {
        if (btn.dataset.ail === 'pause') {
          state.aiPaused = !state.aiPaused;
          renderAiLog();
          if (state.aiPaused) stopTimer(); else { startTimer(); maybeAiStep(); }
        } else {
          state.aiSpeed = state.aiSpeed >= 4 ? 1 : state.aiSpeed * 2;
          renderAiLog();
          maybeAiStep();
        }
      };
    });
  }

  function renderChampGrid() {
    const s = state.series;
    const g = s.cur;
    const q = state.filter.q.trim().toLowerCase();
    const f = state.filter;

    const list = CHAMPS.filter((c) => {
      if (f.pos !== 'all' && D.champPos(c.i).indexOf(f.pos) < 0) return false;
      if (f.tag !== 'all' && D.champTags(c.i).indexOf(f.tag) < 0) return false;
      if (q) {
        const hay = (c.c + c.t + c.i).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });

    // 当前方招牌英雄集合（高亮星标）
    const st = D.curStep(s);
    const sigSet = {};
    if (st) {
      const team = g[st.side];
      fieldRoster(team).forEach((p) => { (p.s || []).forEach((id) => { sigSet[id] = 1; }); });
    }

    $('#champ-grid').innerHTML = list.map((c) => {
      const ok = D.available(s, c.i);
      let cls = 'champ-cell';
      if (!ok) cls += ' dead';
      if (sigSet[c.i]) cls += ' sig';
      if (state.suggest.indexOf(c.i) >= 0) cls += ' sugg';
      const posTxt = D.champPos(c.i).map((x) => R.ROLE_CN[D.POS2ROLE[x]] || x).join('/');
    const tip = c.c + ' · ' + c.t + (posTxt ? ' · ' + posTxt : '') + (sigSet[c.i] ? ' · 招牌' : '');
    return '<div class="' + cls + '" data-id="' + c.i + '" title="' + tip + '">' +
        '<img src="' + champImg(c.i) + '" alt="" loading="lazy" onerror="this.style.opacity=.2">' +
        '<span class="cn">' + c.c + '</span></div>';
    }).join('');

    $$('#champ-grid .champ-cell').forEach((cell) => {
      cell.onclick = () => onPickChampion(cell.dataset.id);
    });
    const grid = $('#champ-grid');
    grid.onmouseover = (e) => {
      const cell = e.target.closest('.champ-cell');
      if (cell) showArtPeek(cell.dataset.id);
    };
    grid.onmouseleave = hideArtPeek;
  }

  function showArtPeek(id) {
    const box = $('#art-peek');
    if (!box || !id) return;
    const img = $('#art-peek-img');
    if (img.getAttribute('data-id') !== id) {
      img.setAttribute('data-id', id);
      img.src = champArt(id);
    }
    $('#art-peek-name').textContent = champName(id);
    $('#art-peek-title').textContent = champTitle(id);
    box.classList.add('show');
  }
  function hideArtPeek() {
    const box = $('#art-peek');
    if (box) box.classList.remove('show');
  }

  function renderSuggest() {
    const box = $('#champ-filters');
    if (!box.dataset.built) {
      const roles = [{ k: 'all', cn: '全部' }, { k: 't', cn: '上单' }, { k: 'j', cn: '打野' }, { k: 'm', cn: '中单' }, { k: 'b', cn: '下路' }, { k: 's', cn: '辅助' }];
      const tags = [
        { k: 'all', cn: '全部' }, { k: 'front', cn: '前排' }, { k: 'engage', cn: '开团' },
        { k: 'cc', cn: '控制' }, { k: 'poke', cn: '消耗' }, { k: 'scale', cn: '后期' },
        { k: 'early', cn: '前期' }, { k: 'split', cn: '分推' }, { k: 'burst', cn: '爆发' },
      ];
      box.innerHTML =
        roles.map((r) => '<button class="filter-btn pos" data-pos="' + r.k + '">' + r.cn + '</button>').join('') +
        '<span style="width:8px"></span>' +
        tags.map((t) => '<button class="filter-btn tag" data-tag="' + t.k + '">' + t.cn + '</button>').join('');
      $$('.filter-btn.pos', box).forEach((b) => {
        b.onclick = () => { state.filter.pos = b.dataset.pos; syncFilterBtns(); renderChampGrid(); };
      });
      $$('.filter-btn.tag', box).forEach((b) => {
        b.onclick = () => { state.filter.tag = b.dataset.tag; syncFilterBtns(); renderChampGrid(); };
      });
      box.dataset.built = '1';
      syncFilterBtns();
    }
  }
  function syncFilterBtns() {
    $$('.filter-btn.pos').forEach((b) => b.classList.toggle('active', b.dataset.pos === state.filter.pos));
    $$('.filter-btn.tag').forEach((b) => b.classList.toggle('active', b.dataset.tag === state.filter.tag));
  }

  function onPickChampion(id) {
    hideArtPeek();
    const s = state.series;
    if (!s || !s.cur) return;
    if (D.bpComplete(s)) return;
    const st = D.curStep(s);
    if (st && isAiSide(st.side)) { toast('现在是 AI 的回合，等它出手…'); return; }
    if (!D.available(s, id)) {
      const why = s.lockedPicks.indexOf(id) >= 0 ? '这个英雄在之前的小局已经被选用过（无畏征召）' : '这个英雄本局已经被 ban/pick 了';
      toast(why);
      return;
    }
    D.commit(s, id);
    if (st.type === 'ban') toast(R.SIDE_CN[st.side] + ' 禁用了 ' + champName(id));
    else toast(R.SIDE_CN[st.side] + ' 锁下了 ' + champName(id));
    state.suggest = [];
    afterCommit();
  }

  function afterCommit() {
    startTimer();
    renderDraft();
  }

  // ============ 解说模式 ============
  function casterLineFor(s, idx) {
    const g = s.cur;
    const h = g.history[idx];
    if (!h) return null;
    if (!g.casterCache) g.casterCache = {};
    if (!g.casterCache[idx]) {
      try {
        // 回放到手时为止的局面，避免用到后面才落的子
        const hist = g.history.slice(0, idx + 1);
        const cg = {
          no: g.no, blue: g.blue, red: g.red, step: h.step,
          picks: { blue: [], red: [] }, bans: { blue: [], red: [] },
          history: hist, over: false, winner: null,
        };
        hist.forEach((x) => {
          if (x.type === 'ban') cg.bans[x.side].push(x.id);
          else cg.picks[x.side].push(x.id);
        });
        const pre = {
          cfg: s.cfg, score: s.score, games: s.games,
          lockedPicks: s.lockedPicks, lockedBans: s.lockedBans, cur: cg,
        };
        g.casterCache[idx] = h.type === 'ban'
          ? Caster.banLine(pre, h.side, h.id, h.step)
          : Caster.pickLine(pre, h.side, h.id, h.step);
      } catch (e) { g.casterCache[idx] = null; }
    }
    return g.casterCache[idx];
  }

  function renderCaster() {
    const box = $('#caster');
    if (!box) return;
    const s = state.series;
    const btn = $('#btn-caster');
    if (btn) btn.textContent = '解说：' + (state.caster ? '开' : '关');
    if (!state.caster || !s || !s.cur) { box.hidden = true; return; }
    box.hidden = false;
    const g = s.cur;
    const n = g.history.length;
    const start = Math.max(0, n - 3);
    const lines = [];
    for (let i = start; i < n; i++) {
      const ln = casterLineFor(s, i);
      if (ln) lines.push(ln);
    }
    const tip = (function () { try { return Caster.tip(s); } catch (e) { return ''; } })();
    const tagCls = { '妙手': 'great', '好手': 'good', '常规': 'normal', '一般': 'meh', '疑问手': 'bad' };
    box.innerHTML =
      '<div class="caster-head"><b>解说席</b><span class="caster-sub">' +
      (state.playMode === 'pve' ? '你执 ' + state.myTeam : '双方博弈') + ' · 第 ' + g.no + ' 局</span>' +
      '<button class="caster-off" id="caster-off">关掉解说</button></div>' +
      (tip ? '<div class="caster-tip">' + tip + '</div>' : '') +
      (lines.length
        ? '<div class="caster-list">' + lines.reverse().map((ln) =>
          '<div class="caster-item ' + ln.side + '"><div class="cs-top"><span class="cs-tag ' + (tagCls[ln.tag] || 'normal') + '">' + ln.tag + '</span>' +
          '<b>' + ln.head + '</b></div><div class="cs-text">' + ln.text + '</div></div>').join('') + '</div>'
        : '<div class="caster-empty">第一手还没出来。每落一手，这里会给一句职业向的评价：为什么抢、为什么 ban、值不值。</div>');

    const off = $('#caster-off');
    if (off) off.onclick = () => {
      state.caster = false;
      const cb = $('#opt-caster');
      if (cb) cb.checked = false;
      renderCaster();
    };
  }

  $('#btn-caster').onclick = () => {
    state.caster = !state.caster;
    const cb = $('#opt-caster');
    if (cb) cb.checked = state.caster;
    renderCaster();
  };

  $('#btn-undo').onclick = () => {
    const s = state.series;
    if (!s) return;
    if (D.bpComplete(s)) { toast('BP 已结束'); return; }
    if (state.playMode !== 'pvp') { toast('AI 对局模式不能撤销'); return; }
    if (D.undo(s)) { if (s.cur) s.cur.casterCache = {}; state.suggest = []; afterCommit(); } else toast('没有可以撤销的操作');
  };
  $('#btn-suggest').onclick = () => {
    const s = state.series;
    if (!s) return;
    const st = D.curStep(s);
    if (st && isAiSide(st.side)) { toast('AI 的回合，推荐不给对面用'); return; }
    state.suggest = D.suggest(s, 6);
    renderChampGrid();
    if (state.suggest.length) toast('推荐：' + state.suggest.map((i) => champName(i)).join('、'));
  };
  $('#btn-ai').onclick = () => {
    const s = state.series;
    if (!s || D.bpComplete(s)) return;
    const st = D.curStep(s);
    if (!st) return;
    if (isAiSide(st.side)) { toast('这一手本来就是 AI 在打'); return; }
    doAiStep(st, true);
    toast('AI 代打：' + R.SIDE_CN[st.side] + (st.type === 'ban' ? ' 禁用 ' : ' 选择了 ') + '…');
  };
  $('#btn-abort').onclick = () => {
    if (confirm('放弃当前这局并回到首页？')) {
      stopTimer();
      state.series = null;
      showScreen('screen-home');
    }
  };
  $('#champ-search').oninput = (e) => {
    state.filter.q = e.target.value;
    renderChampGrid();
  };

  // ================= 阵容整理 =================
  function goAssign() {
    const s = state.series;
    const g = s.cur;
    ['blue', 'red'].forEach((sd) => {
      const team = g[sd];
      const list = fieldRoster(team);
      const def = defaultPlayers(team);
      const map = {};
      R.ROLES.forEach((role) => {
        const cur = state.players[sd][role];
        const keep = cur && list.some((x) => x.n === cur.n);
        if (keep) { map[role] = cur; return; }
        const want = (state.lineup[sd] || {})[role];
        const picked = want ? list.find((x) => x.n === want) : null;
        map[role] = picked || def[role];
      });
      state.players[sd] = map;
      state.assign[sd] = AN.autoAssign(g.picks[sd]);
    });
    state.selChip = null;
    showScreen('screen-assign');
    renderAssign();
  }

  function renderAssign() {
    const s = state.series;
    const g = s.cur;
    ['blue', 'red'].forEach((sd) => {
      const team = g[sd];
      const box = $('#assign-' + sd);
      box.innerHTML = '<h3>' + logoHtml(team) + '<span style="font-size:14px">' + team + '</span></h3>' +
        R.ROLES.map((role) => {
          const p = state.players[sd][role];
          const list = fieldRoster(team);
          const opts = list.map((x) =>
            '<option value="' + x.n + '"' + (p && p.n === x.n ? ' selected' : '') + '>' + x.n + '（' + R.ROLE_CN[x.r] + '）</option>').join('');
          const cid = state.assign[sd][role];
          const chip = cid
            ? '<div class="champ-chip" draggable="true" data-side="' + sd + '" data-role="' + role + '">' +
            '<img src="' + champImg(cid) + '" alt="">' +
            '<div><div class="cc-name">' + champName(cid) + '</div>' +
            '<div class="cc-pos">' + D.champPos(cid).map((x) => R.ROLE_CN[D.POS2ROLE[x]] || x).join('/') + '</div></div></div>'
            : '<div class="champ-chip" style="opacity:.4">未分配</div>';
          return '<div class="slot-line" data-side="' + sd + '" data-role="' + role + '">' +
            '<span class="slot-role">' + R.ROLE_EN[role] + '</span>' +
            '<div class="slot-player">' + avatarHtml(p, team) +
            '<select class="player-sel" data-side="' + sd + '" data-role="' + role + '">' + opts + '</select></div>' +
            chip +
            '</div>';
        }).join('');
    });

    $$('.player-sel').forEach((sel) => {
      sel.onchange = () => {
        const sd = sel.dataset.side, role = sel.dataset.role;
        const p = fieldRoster(state.series.cur[sd]).find((x) => x.n === sel.value);
        state.players[sd][role] = p || null;
        if (p) state.lineup[sd][role] = p.n;
      };
    });

    $$('.champ-chip[draggable]').forEach((chip) => {
      chip.onclick = () => selectChip(chip.dataset.side, chip.dataset.role);
      chip.ondragstart = (e) => {
        e.dataTransfer.setData('text/plain', chip.dataset.side + '|' + chip.dataset.role);
      };
    });

    $$('.slot-line').forEach((line) => {
      line.ondragover = (e) => { e.preventDefault(); line.classList.add('drop'); };
      line.ondragleave = () => line.classList.remove('drop');
      line.ondrop = (e) => {
        e.preventDefault();
        line.classList.remove('drop');
        const [sd, role] = e.dataTransfer.getData('text/plain').split('|');
        swapChamp(sd, role, line.dataset.side, line.dataset.role);
      };
      line.onclick = (e) => {
        if (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') return;
        if (state.selChip) {
          const from = state.selChip;
          state.selChip = null;
          if (from.side === line.dataset.side) {
            swapChamp(from.side, from.role, line.dataset.side, line.dataset.role);
          } else {
            toast('只能在同一边内调整位置');
          }
        }
      };
    });

    updateAssignHint();
  }

  function selectChip(side, role) {
    if (state.selChip && state.selChip.side === side && state.selChip.role === role) {
      state.selChip = null;
    } else {
      state.selChip = { side: side, role: role };
    }
    renderAssign();
    if (state.selChip) {
      $$('.champ-chip').forEach((c) => {
        if (c.dataset.side === state.selChip.side && c.dataset.role === state.selChip.role) c.classList.add('sel');
      });
    }
  }

  function swapChamp(sideA, roleA, sideB, roleB) {
    if (sideA !== sideB) { toast('只能在同一边内调整位置'); return; }
    if (roleA === roleB) { state.selChip = null; renderAssign(); return; }
    const a = state.assign[sideA];
    const tmp = a[roleA];
    a[roleA] = a[roleB];
    a[roleB] = tmp;
    state.selChip = null;
    renderAssign();
    toast('已交换 ' + R.ROLE_CN[roleA] + ' 与 ' + R.ROLE_CN[roleB] + ' 的英雄');
  }

  function updateAssignHint() {
    const hint = $('#assign-hint');
    const probs = [];
    ['blue', 'red'].forEach((sd) => {
      R.ROLES.forEach((role) => {
        const cid = state.assign[sd][role];
        if (cid && !D.fits(cid, role)) probs.push(R.SIDE_CN[sd] + R.ROLE_CN[role] + ' 的 ' + champName(cid) + ' 不是本位置英雄');
      });
    });
    if (probs.length) {
      hint.className = 'assign-hint warn';
      hint.textContent = '⚠ ' + probs.slice(0, 3).join('；') + '（会让对位强度下降，但可以保留）';
    } else {
      hint.className = 'assign-hint';
      hint.textContent = '拖拽或点击英雄卡片来交换位置，也可以直接换选手；安排好后点中间按钮确认。';
    }
  }

  $('#btn-auto-assign').onclick = () => {
    ['blue', 'red'].forEach((sd) => { state.assign[sd] = AN.autoAssign(state.series.cur.picks[sd]); });
    state.selChip = null;
    renderAssign();
  };

  $('#btn-confirm-assign').onclick = () => {
    const g = state.series.cur;
    const complete = ['blue', 'red'].every((sd) => R.ROLES.every((r) => state.assign[sd][r]));
    if (!complete) { toast('还有位置没分配英雄'); return; }
    const match = {
      blue: { team: g.blue, assign: state.assign.blue, players: state.players.blue },
      red: { team: g.red, assign: state.assign.red, players: state.players.red },
    };
    state.analysis = AN.analyze(match);
    state.match = match;
    showScreen('screen-analysis');
    renderAnalysis();
  };

  // ================= 分析界面 =================
  function renderAnalysis() {
    const an = state.analysis;
    const m = state.match;
    const g = state.series.cur;

    $('#an-blue').innerHTML = logoHtml(m.blue.team) + '<span>' + m.blue.team + '</span>';
    $('#an-red').innerHTML = '<span>' + m.red.team + '</span>' + logoHtml(m.red.team);
    $('#prob-blue').style.width = an.prob.blue + '%';
    $('#prob-blue-num').textContent = m.blue.team + ' ' + an.prob.blue.toFixed(1) + '%';
    $('#prob-red-num').textContent = an.prob.red.toFixed(1) + '% ' + m.red.team;

    // 阵容原画
    const artRow = (sd, team, side) => {
      const cards = R.ROLES.map((r) => {
        const cid = side.assign[r];
        if (!cid) return '';
        const p = lineupPlayer(sd, r);
        return '<div class="pa-card" title="' + champName(cid) + (p ? ' · ' + p.n : '') + '">' +
          '<img src="' + champArt(cid) + '" alt="" loading="lazy" onerror="this.style.opacity=.2">' +
          '<div class="pa-grad"></div>' +
          '<span class="pa-champ">' + champName(cid) + '</span>' +
          '<span class="pa-player">' + (p ? p.n : '') + '</span></div>';
      }).join('');
      return '<div class="pa-row ' + sd + '">' +
        '<div class="pa-team">' + logoHtml(team) + '<b>' + team + '</b></div>' +
        '<div class="pa-cards">' + cards + '</div></div>';
    };
    $('#panel-art').innerHTML = '<h3>阵容原画</h3>' + artRow('blue', m.blue.team, m.blue) + artRow('red', m.red.team, m.red);

    // BP 质量
    const bpqSide = (sd) => {
      const team = m[sd].team;
      const rat = an.rating[sd];
      const pap = an.paper[sd];
      const arch = (an.arch && an.arch[sd]) || [];
      const pr = an.prof && an.prof[sd];
      const syn = pr && pr.syn;
      const combo = syn && syn.list && syn.list[0];
      const chips = arch.slice(0, 2).map((a, i) =>
        '<span class="bpq-chip' + (i === 0 ? ' main' : '') + '">' + a.cn + ' <b>' + a.score + '</b></span>').join('');
      let comboTxt = '<div class="bpq-line"><span>关键协同</span><em>没有成型的两件套</em></div>';
      if (syn && syn.duo) {
        comboTxt = '<div class="bpq-line"><span>下路组合</span><b>' + syn.duo[2] + '</b>' +
          '<em>' + syn.duo[0] + '/10' + (syn.duoStat ? ' · 本赛季 ' + syn.duoStat.n + ' 局 ' + syn.duoStat.wr + '%' : '') + '</em></div>';
      } else if (combo) {
        comboTxt = '<div class="bpq-line"><span>关键协同</span><b>' + champName(combo.a) + ' + ' + champName(combo.b) + '</b>' +
          '<em>' + combo.v + '/10</em></div>';
      }
      const flaws = (an.qual && an.qual[sd] && an.qual[sd].flaws) || [];
      const stl = an.styl && an.styl[sd];
      const stylTxt = stl ? '<div class="bpq-style"><span>队伍风格</span><b>' + stl.cn + '</b>' +
        '<em>契合 ' + stl.pct + '%' +
        (stl.star.length ? ' · 核心 ' + stl.star.slice(0, 2).map(champName).join('/') : ' · 核心件没拿到') +
        (stl.comfort ? ' · 舒适英雄 ' + stl.comfort + '/5' : '') + '</em></div>' : '';
      const sideRec = (window.TEAM_SIDE || {})[team];
      const sideTxt = sideRec && sideRec.blue && sideRec.red
        ? '<div class="bpq-line"><span>红蓝边</span><em>本队蓝方 ' + sideRec.blue.wr + '%（' + sideRec.blue.g +
          ' 场） · 红方 ' + sideRec.red.wr + '%（' + sideRec.red.g + ' 场）</em></div>'
        : '';
      return '<div class="bpq-side ' + sd + '">' +
        '<div class="bpq-head">' + logoHtml(team) + '<b>' + team + '</b>' +
        '<span class="bpq-score">' + rat + '<em>分</em></span></div>' +
        '<div class="bpq-sub">纸面实力 ' + pap + ' <i>·</i> 阵容评分 ' + rat + '</div>' +
        '<div class="bpq-chips">' + chips + '</div>' + stylTxt + comboTxt + sideTxt +
        (flaws.length ? '<div class="bpq-flaw">最大问题：' + flaws[0] + '</div>' : '<div class="bpq-flaw ok">没有明显的结构性缺陷</div>') +
        '</div>';
    };
    const better = an.rating.blue === an.rating.red ? '' : (an.rating.blue > an.rating.red ? m.blue.team : m.red.team);
    const smp = an.sample;
    const bpqFoot = smp
      ? '实战样本 ' + smp.games + ' 局（2026 ' + ((smp.seasons && smp.seasons['2026']) || 0) + ' + 2025 ' + ((smp.seasons && smp.seasons['2025']) || 0) +
        '；LPL ' + (smp.leagues.LPL || 0) + ' · LCK ' + (smp.leagues.LCK || 0) +
        ' · LEC ' + (smp.leagues.LEC || 0) + ' · 国际赛 ' + ((smp.leagues.MSI || 0) + (smp.leagues.Worlds || 0) + (smp.leagues.FirstStand || 0)) +
        '），蓝方胜率 ' + smp.blueWinPct + '%。'
      : '暂无实战样本。';
    $('#panel-bpq').innerHTML = '<h3>BP 质量 <span class="bpq-hint">纸面占 30%，其余看阵容合理性与选手执行</span></h3>' +
      '<div class="bpq-grid">' + bpqSide('blue') +
      '<div class="bpq-mid">' +
      '<div class="bpq-swing"><b>' + (an.bpSwing < 0.5 ? '≈0' : an.bpSwing.toFixed(1)) + '</b><span>个百分点</span>' +
      '<em>' + (an.bpSwing < 0.5 ? '两边阵容质量打平，BP 没拉开差距'
        : (better ? '这局 BP 给 ' + better + ' 带来的胜率加成' : '双方 BP 质量接近')) + '</em></div>' +
      '<div class="bpq-note">' + bpqFoot + ' 英雄强弱、下路组合胜率、同位置对位都来自这些实战数据，不是拍脑袋。</div>' +
      '</div>' + bpqSide('red') + '</div>';

    // 分路对位
    let html = '<h3>分路对位</h3><table class="lane-table">';    html += '<tr><td class="lt-role"></td><td class="lt-blue lt-head">' + m.blue.team + '</td><td class="lt-mid lt-head">差距</td><td class="lt-red lt-head">' + m.red.team + '</td></tr>';
    an.lanes.forEach((l) => {
      const bW = l.edge === 'blue', rW = l.edge === 'red';
      const bid = m.blue.assign[l.role], rid = m.red.assign[l.role];
      const diffTxt = l.edge === 'even' ? '均势' : (l.edge === 'blue' ? '+' : '−') + Math.abs(l.diff).toFixed(1);
      html += '<tr>' +
        '<td class="lt-role">' + R.ROLE_CN[l.role] + '</td>' +
        '<td class="lt-blue' + (bW ? ' win' : '') + '">' +
        '<span class="lt-info"><span class="lt-champ">' + champName(bid) + '</span>' +
        '<span class="lt-player">' + (l.blue.p ? l.blue.p.n : '') + '</span></span>' +
        '<img class="lt-icon" src="' + champImg(bid) + '" alt="" onerror="this.style.visibility=\'hidden\'"></td>' +
        '<td class="lt-mid ' + l.edge + '">' + diffTxt + '</td>' +
        '<td class="lt-red' + (rW ? ' win' : '') + '">' +
        '<img class="lt-icon" src="' + champImg(rid) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
        '<span class="lt-info"><span class="lt-champ">' + champName(rid) + '</span>' +
        '<span class="lt-player">' + (l.red.p ? l.red.p.n : '') + '</span></span></td>' +
        '</tr>';
    });
    html += '</table>';
    $('#panel-lanes').innerHTML = html;

    // 维度
    let dh = '<h3>阵容维度对比（蓝方 vs 红方）</h3>';
    an.dims.forEach((d) => {
      dh += '<div class="dim-row">' +
        '<span class="dv blue">' + d.blue + '</span>' +
        '<span class="dim-bar-l"><i style="width:' + d.blue + '%"></i></span>' +
        '<span class="dim-label">' + d.cn + '</span>' +
        '<span class="dim-bar-r"><i style="width:' + d.red + '%"></i></span>' +
        '<span class="dv red">' + d.red + '</span>' +
        '</div>';
    });
    dh += '<div style="margin-top:12px;font-size:11.5px;color:var(--dim)">综合强度：蓝方 ' + an.total.blue + ' · 红方 ' + an.total.red +
      ' ｜ 强势期：蓝方 ' + (an.curve.blue > 60 ? '偏后期' : an.curve.blue < 40 ? '偏前期' : '中期') +
      '，红方 ' + (an.curve.red > 60 ? '偏后期' : an.curve.red < 40 ? '偏前期' : '中期') + '</div>';
    $('#panel-dims').innerHTML = dh;

    // 结论
    const v = an.verdict;
    $('#panel-verdict').innerHTML = '<h3>解说席预测</h3><div class="verdict-text">' +
      '<b>' + v.lead + '</b> 胜率 <b>' + v.prob.toFixed(1) + '%</b>。' + v.text + '</div>';

    // 点评
    let nh = '<h3>阵容合理性点评</h3>';
    if (!an.notes.length) {
      nh += '<div class="empty-hint">两套阵容都没有明显的结构性问题。</div>';
    } else {
      an.notes.forEach((n) => {
        nh += '<div class="note-item ' + n.t + '">' +
          '<span class="note-side ' + n.side + '">' + R.SIDE_CN[n.side] + '</span>' +
          '<span class="note-dot"></span>' +
          '<span class="note-txt">' + n.text + '</span></div>';
      });
    }
    $('#panel-notes').innerHTML = nh;
  }

  $('#btn-back-assign').onclick = () => {
    showScreen('screen-assign');
    renderAssign();
  };

  $('#btn-sim').onclick = () => {
    const an = state.analysis;
    const m = state.match;
    const res = SIM.run(m, an, { seed: Math.floor(Math.random() * 1e9) });
    res.blueTeam = m.blue.team;
    res.redTeam = m.red.team;
    res.gameNo = state.series && state.series.cur ? state.series.cur.no : 1;
    res.bpq = { blue: an.rating.blue, red: an.rating.red, swing: an.bpSwing, paper: { blue: an.paper.blue, red: an.paper.red } };
    state.sim = res;
    state.feedIndex = 0;
    state.feedDone = false;
    showScreen('screen-sim');
    renderSimHead();
    $('#sim-feed').innerHTML = '';
    $('#sim-side').innerHTML = '';
    $('#sim-actions').innerHTML = '';
    renderChart(res);
    renderObjectives(res);
    playFeed();
  };

  // ============ 经济走势图 ============
  function goldAt(res, sec) {
    const tl = res.timeline || [];
    let best = tl[0];
    for (let i = 0; i < tl.length; i++) {
      if (tl[i].t <= sec) best = tl[i]; else break;
    }
    return best || { g: 0, t: 0 };
  }

  function renderChart(res) {
    const box = $('#sim-chart');
    if (!box) return;
    const W = 900, H = 230, PL = 44, PR = 16, PT = 14, PB = 26;
    const tl = (res.timeline || []).slice();
    if (!tl.length) { box.innerHTML = ''; return; }
    const maxT = Math.max(60, tl[tl.length - 1].t);
    const maxG = Math.max(4, Math.min(30, Math.ceil(Math.max.apply(null, tl.map((p) => Math.abs(p.g)).concat([3])) + 1)));
    const x = (t) => PL + (t / maxT) * (W - PL - PR);
    const y = (g) => PT + (1 - (g + maxG) / (maxG * 2)) * (H - PT - PB);
    const zero = y(0);
    const pts = tl.map((p) => [x(p.t), y(Math.max(-maxG, Math.min(maxG, p.g)))]);

    // 曲线路径
    let line = '';
    pts.forEach((p, i) => { line += (i ? ' L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); });
    // 面积：蓝 acima de 0 / 红 abaixo
    let blueArea = 'M' + x(0) + ' ' + zero + ' L' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') + ' L' + x(maxT) + ' ' + zero + ' Z';
    let redArea = 'M' + x(0) + ' ' + zero + ' L' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') + ' L' + x(maxT) + ' ' + zero + ' Z';

    // 网格
    let grid = '';
    for (let m = 0; m <= maxT / 60; m += 5) {
      const gx = x(m * 60).toFixed(1);
      grid += '<line x1="' + gx + '" y1="' + PT + '" x2="' + gx + '" y2="' + (H - PB) + '" class="cg"/>' +
        '<text x="' + gx + '" y="' + (H - 8) + '" class="cl" text-anchor="middle">' + m + "'</text>";
    }
    [maxG, maxG / 2, 0, -maxG / 2, -maxG].forEach((gv) => {
      const gy = y(gv).toFixed(1);
      grid += '<line x1="' + PL + '" y1="' + gy + '" x2="' + (W - PR) + '" y2="' + gy + '" class="' + (gv === 0 ? 'c0' : 'cg') + '"/>' +
        '<text x="' + (PL - 6) + '" y="' + (+gy + 3.5).toFixed(1) + '" class="cl" text-anchor="end">' + (gv > 0 ? '+' : '') + (gv / 1).toFixed(gv === 0 ? 0 : 0) + 'k</text>';
    });

    // 资源标记
    const mk = { grub: '虫', herald: '锋', dragon: '龙', soul: '魂', baron: '大龙' };
    const marks = (res.objectives || []).map((o) => {
      const g0 = goldAt(res, o.t).g;
      const px = x(o.t), py = y(Math.max(-maxG, Math.min(maxG, g0)));
      const isBaron = o.kind === 'baron';
      return '<g class="mk ' + o.side + ' ' + o.kind + '"><title>' + o.t + 's · ' + o.label + ' · ' + R.SIDE_CN[o.side] + '</title>' +
        '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="' + (isBaron ? 9 : 7) + '"/>' +
        '<text x="' + px.toFixed(1) + '" y="' + (py + 3.2).toFixed(1) + '" text-anchor="middle">' + mk[o.kind] + '</text></g>';
    }).join('');

    const last = tl[tl.length - 1];
    const lastTxt = (last.g >= 0 ? '+' : '') + last.g.toFixed(1) + 'k';

    box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" class="gchart">' +
      '<defs>' +
      '<linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4d8dff" stop-opacity=".55"/><stop offset="100%" stop-color="#4d8dff" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ff5a5a" stop-opacity="0"/><stop offset="100%" stop-color="#ff5a5a" stop-opacity=".55"/></linearGradient>' +
      '<clipPath id="clipUp"><rect x="' + PL + '" y="0" width="' + (W - PL - PR) + '" height="' + zero.toFixed(1) + '"/></clipPath>' +
      '<clipPath id="clipDn"><rect x="' + PL + '" y="' + zero.toFixed(1) + '" width="' + (W - PL - PR) + '" height="' + (H - zero).toFixed(1) + '"/></clipPath>' +
      '</defs>' +
      grid +
      '<path d="' + blueArea + '" fill="url(#gb)" clip-path="url(#clipUp)"/>' +
      '<path d="' + redArea + '" fill="url(#gr)" clip-path="url(#clipDn)"/>' +
      '<path d="' + line + '" class="cline"/>' +
      marks +
      '<text x="' + (W - PR) + '" y="' + (PT + 14) + '" class="clast" text-anchor="end">' + lastTxt + '</text>' +
      '</svg>';
  }

  function renderObjectives(res) {
    const strip = $('#sim-objs');
    const cap = $('#sim-objcap');
    if (!strip) return;
    const mk = { grub: '潮虫', herald: '先锋', dragon: '小龙', soul: '龙魂', baron: '大龙' };
    const order = { grub: 0, herald: 1, dragon: 2, soul: 3, baron: 4 };
    const list = (res.objectives || []).slice().sort((a, b) => a.t - b.t);
    strip.innerHTML = list.map((o) => '<span class="obj-chip ' + o.side + ' ' + o.kind + '">' +
      '<i>' + fmtSec(o.t) + '</i><b>' + mk[o.kind] + '</b><em>' + R.SIDE_CN[o.side] + '</em></span>').join('');
    if (cap) {
      const c = (sd) => '蓝 ' + (res.kills.blue) + '杀 · ' + res.dragons[sd] + '龙' + (res.souls && res.souls[sd] ? '(魂)' : '') + ' · 虫' + res.grubs[sd] + ' · 大龙' + res.barons[sd];
      cap.textContent = c('blue') + '　｜　' + c('red');
    }
  }

  function fmtSec(t) {
    const m = Math.floor(t / 60), s = Math.round(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function renderSimHead() {
    const m = state.match;
    $('#sim-blue').innerHTML = logoHtml(m.blue.team) + '<span>' + m.blue.team + '</span>';
    $('#sim-red').innerHTML = '<span>' + m.red.team + '</span>' + logoHtml(m.red.team);
    $('#sim-score').textContent = '0 : 0';
    const scap = document.querySelector('.sim-score-cap');
    if (scap) scap.textContent = '击杀';
  }

  function playFeed() {
    const res = state.sim;
    const feed = $('#sim-feed');
    const total = res.events.length;
    if (state.feedIndex >= total) { finishFeed(); return; }
    const e = res.events[state.feedIndex];
    const div = document.createElement('div');
    div.className = 'feed-item ' + e.kind + (e.side ? ' side-' + e.side : '');
    div.innerHTML = '<span class="feed-time">' + e.t + '</span><span class="feed-text">' + e.text + '</span>';
    feed.appendChild(div);
    feed.scrollTop = feed.scrollHeight;
    $('#sim-score').textContent = e.kills.blue + ' : ' + e.kills.red;
    state.feedIndex++;
    const delay = window.__bpFastSim ? 6 : (e.kind === 'end' ? 900 : (e.kind === 'fight' ? 620 : 480));
    state.feedTimer = setTimeout(playFeed, delay);
  }

  function finishFeed() {
    clearTimeout(state.feedTimer);
    if (state.feedDone) return;
    state.feedDone = true;
    const res = state.sim;
    const m = state.match;
    $('#sim-score').textContent = res.kills.blue + ' : ' + res.kills.red;

    // 侧栏
    let side = '';
    if (res.mvp) side += mvpCard(res);
    side += damageCompare(res);
    side += '<div class="stat-card"><h4>' + m.blue.team + '</h4>' + statTable(res.stats.blue, m.blue.team) + '</div>';
    side += '<div class="stat-card"><h4>' + m.red.team + '</h4>' + statTable(res.stats.red, m.red.team) + '</div>';
    side += commentsCard(res);
    side += '<div class="stat-card"><h4>本局总结</h4><div style="font-size:12.5px;color:#b9c2d6;line-height:1.85">' + res.summary + '</div></div>';
    $('#sim-side').innerHTML = side;
    bindCommentTabs();
    if (res.mvp) {
      if (!window.__bpShotSkipMvp) setTimeout(() => openMvp(res), 900);
      const card = $('#mvp-card');
      if (card) card.onclick = () => openMvp(res);
    }

    const s = state.series;
    const winTeam = res.winner === 'blue' ? m.blue.team : m.red.team;
    D.finishGame(s, res.winner, res);
    if (!state.results) state.results = [];
    state.results.push(res);

    let acts = '<div style="text-align:center;color:var(--gold-l);font-weight:800;font-size:15px;margin-bottom:10px">' +
      winTeam + ' 赢下第 ' + s.cur.no + ' 局，' + res.duration + ' 结束比赛</div>';
    if (s.over) {
      acts += '<button class="primary-btn big" id="btn-series-end">查看系列赛总结</button>';
    } else {
      acts += '<div style="width:100%;text-align:center;color:var(--muted);font-size:13px;margin-bottom:6px">' +
        '总比分 ' + (s.score[m.blue.team] || 0) + ' : ' + (s.score[m.red.team] || 0) + ' · ' + (s.cfg.mode === 'BO3' ? 'BO3' : 'BO5') + ' · 败方选边</div>';
      const loserIsAi = state.playMode === 'eve' || (state.playMode === 'pve' && res.loser === (s.cur.blue === state.myTeam ? 'red' : 'blue'));
      if (loserIsAi) {
        const pick = aiSideChoice(res.loser);
        acts += '<button class="ghost-btn" data-next="' + pick + '" data-loser="' + res.loser + '">AI 选择' + R.SIDE_CN[pick] + '方 · 继续</button>';
      } else {
        acts += '<button class="ghost-btn" data-next="blue" data-loser="' + (res.loser) + '">选择蓝色方</button>';
        acts += '<button class="ghost-btn" data-next="red" data-loser="' + (res.loser) + '">选择红色方</button>';
      }
    }
    $('#sim-actions').innerHTML = acts;

    const endBtn = $('#btn-series-end');
    if (endBtn) endBtn.onclick = showSeriesEnd;
    $$('#sim-actions button[data-next]').forEach((b) => {
      b.onclick = () => nextGame(res.loser, b.dataset.next);
    });
  }

  function statTable(arr, team) {
    const maxPct = Math.max.apply(null, arr.map((s) => s.dmgPct).concat([1]));
    return '<table class="stat-table"><tr><th>选手</th><th>英雄</th><th>K/D/A</th><th>伤害占比</th><th>参团</th><th>评分</th></tr>' +
      arr.map((s) => '<tr><td class="st-n">' + avatarHtml({ n: s.n }, team, 22) + s.n + '</td><td class="st-c">' + s.champ + '</td>' +
        '<td class="st-kda">' + s.k + '/' + s.d + '/' + s.a + '</td>' +
        '<td class="st-dmg"><span class="mini-bar"><i style="width:' + (s.dmgPct / maxPct * 100).toFixed(1) + '%"></i></span>' + s.dmgPct.toFixed(1) + '%</td>' +
        '<td class="st-kda">' + s.kp + '%</td>' +
        '<td class="st-rating"><b class="grade ' + (s.grade || 'B') + '">' + (s.grade || '') + '</b>' + s.rating.toFixed(1) + '</td></tr>').join('') + '</table>';
  }

  function commentsCard(res) {
    const list = res.comments || [];
    if (!list.length) return '';
    const items = list.map((p) => {
      const team = state.match[p.side].team;
      return '<div class="cm-p" data-side="' + p.side + '">' +
        '<div class="cm-phead">' + avatarHtml({ n: p.n }, team, 24) +
        '<b>' + p.n + '</b><em>' + p.champ + '</em>' +
        '<span class="grade ' + p.grade + '">' + p.grade + '</span>' +
        '<span class="cm-rate">' + p.rating.toFixed(1) + '</span></div>' +
        p.comments.map((c) => '<div class="cm-item" data-tone="' + c.tone + '">' +
          '<span class="cm-u">@' + c.u + '</span>' +
          '<span class="cm-txt">' + c.text + '</span>' +
          '<span class="cm-like">👍 ' + c.likes + '</span></div>').join('') +
        '</div>';
    }).join('');
    return '<div class="stat-card cm-card" id="comments-card"><h4>网友评论 <span class="cm-hint">来自峡谷的弹幕，纯属娱乐</span></h4>' +
      '<div class="cm-tabs">' +
      '<button class="cm-tab active" data-tone="all">全部</button>' +
      '<button class="cm-tab" data-tone="praise">好评</button>' +
      '<button class="cm-tab" data-tone="flame">黑榜</button>' +
      '<button class="cm-tab" data-side="blue">蓝方</button>' +
      '<button class="cm-tab" data-side="red">红方</button>' +
      '</div><div class="cm-list">' + items + '</div></div>';
  }

  function bindCommentTabs() {
    $$('.cm-tab').forEach((b) => {
      b.onclick = () => {
        $$('.cm-tab').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        const tone = b.dataset.tone, side = b.dataset.side;
        $$('#comments-card .cm-p').forEach((p) => {
          p.style.display = (!side || p.dataset.side === side) ? '' : 'none';
        });
        $$('#comments-card .cm-item').forEach((it) => {
          it.style.display = (!tone || tone === 'all' || it.dataset.tone === tone) ? '' : 'none';
        });
      };
    });
  }

  function damageCompare(res) {
    const m = state.match;
    const all = res.stats.blue.concat(res.stats.red);
    const maxPct = Math.max.apply(null, all.map((s) => s.dmgPct).concat([1]));
    const row = (role) => {
      const b = res.stats.blue.find((x) => x.role === role) || { n: '—', dmgPct: 0, kp: 0 };
      const r = res.stats.red.find((x) => x.role === role) || { n: '—', dmgPct: 0, kp: 0 };
      const bar = (s, cls) => '<div class="dc-side ' + cls + '">' +
        '<span class="dc-name" title="' + s.n + '">' + s.n + '</span>' +
        '<span class="dc-bar"><i style="width:' + (s.dmgPct / maxPct * 100).toFixed(1) + '%"></i></span>' +
        '<span class="dc-val">' + s.dmgPct.toFixed(1) + '%</span>' +
        '<span class="dc-kp" title="参团率"><i></i>' + s.kp + '%</span></div>';
      return '<div class="dc-row">' + bar(b, 'blue') + '<div class="dc-role">' + R.ROLE_CN[role] + '</div>' + bar(r, 'red') + '</div>';
    };
    const tb = res.stats.blue.reduce((n, s) => n + (s.dmgRaw || 0), 0);
    const tr = res.stats.red.reduce((n, s) => n + (s.dmgRaw || 0), 0);
    return '<div class="stat-card dc-card"><h4>伤害占比 · 参团率对比</h4>' +
      '<div class="dc-head"><span class="blue">' + m.blue.team + '</span><span>对位</span><span class="red">' + m.red.team + '</span></div>' +
      R.ROLES.map(row).join('') +
      '<div class="dc-foot"><span>' + Math.round(tb / 1000) + 'k 总伤害</span><span>' + res.kills.blue + ' : ' + res.kills.red + ' 击杀</span><span>' + Math.round(tr / 1000) + 'k 总伤害</span></div>' +
      '</div>';
  }

  function mvpCard(res) {
    const mvp = res.mvp;
    const team = state.match[mvp.side].team;
    const nk = nickOf(mvp.n);
    return '<div class="mvp-card" id="mvp-card" title="查看 MVP 界面">' +
      '<div class="mvp-label">MVP</div>' +
      '<div class="mvp-card-row">' + avatarHtml({ n: mvp.n }, team, 56) +
      '<div class="mvp-card-info"><div class="mvp-name">' + mvp.n + (nk && nk !== mvp.n ? '<i class="mvp-nick">「' + nk + '」</i>' : '') + '</div>' +
      '<div class="mvp-sub">' + mvp.champ + ' · ' + mvp.k + '/' + mvp.d + '/' + mvp.a + '</div>' +
      '<div class="mvp-sub dim">伤害占比 ' + mvp.dmgPct.toFixed(1) + '% · 参团 ' + mvp.kp + '% · 评分 ' + mvp.rating.toFixed(1) + '</div></div></div>' +
      '<div class="mvp-more">点击查看 MVP 界面 →</div></div>';
  }

  function nickOf(name) {
    const NU = window.NickUtil;
    if (!NU || !NU.of) return '';
    const list = NU.of(name);
    return list && list.length ? list[0] : '';
  }

  function nickRandom(name) {
    const NU = window.NickUtil;
    if (!NU || !NU.of) return '';
    const list = NU.of(name);
    if (!list || !list.length) return '';
    return list[Math.floor(Math.random() * list.length)];
  }

  function mvpQuote(res, mvp) {
    const m = state.match;
    const win = res.winner === mvp.side;
    const nk = nickOf(mvp.n);
    const who = nk && nk !== mvp.n ? nk + '（' + mvp.n + '）' : mvp.n;
    const parts = [];
    parts.push(who + ' 的 ' + mvp.champ + ' 打出 ' + mvp.k + '/' + mvp.d + '/' + mvp.a + '。');
    if (mvp.dmgPct >= 30) parts.push('全场 ' + mvp.dmgPct.toFixed(1) + '% 的伤害占比，输出端一个人顶了半支队伍。');
    else if (mvp.dmgPct >= 22) parts.push('伤害占比 ' + mvp.dmgPct.toFixed(1) + '%，输出稳定且高效。');
    else parts.push('伤害占比 ' + mvp.dmgPct.toFixed(1) + '%，数据不夸张，但每一分都打在关键处。');
    if (mvp.kp >= 70) parts.push('参团率高达 ' + mvp.kp + '%，几乎每波团战都在场。');
    else if (mvp.kp >= 50) parts.push('参团率 ' + mvp.kp + '%，节奏核心之一。');
    else parts.push('参团率 ' + mvp.kp + '%，更多是在自己那条线上打出优势。');
    parts.push(win ? '这一局他所在的 ' + m[ mvp.side ].team + ' 拿下了比赛。' : '虽然 ' + m[mvp.side].team + ' 输掉了这一局，但他的表现依然值得一座 MVP。');
    return parts.join('');
  }

  function mvpBadges(res, mvp) {
    const team = state.match[mvp.side].team;
    const all = [];
    ['blue', 'red'].forEach((sd) => (res.stats[sd] || []).forEach((s) => all.push(s)));
    const maxDmg = Math.max.apply(null, all.map((s) => s.dmgPct));
    const maxRating = Math.max.apply(null, all.map((s) => s.rating));
    const maxKills = Math.max.apply(null, all.map((s) => s.k));
    const list = [];
    if (mvp.dmgPct >= maxDmg - 0.001) list.push(['伤害王', '全场输出第一']);
    if (mvp.kp >= 85) list.push(['全场参团', '参团率 ' + mvp.kp + '%']);
    if (mvp.rating >= maxRating - 0.001) list.push(['评分第一', '本局评分 ' + mvp.rating.toFixed(1)]);
    if (mvp.k >= maxKills) list.push(['击杀王', mvp.k + ' 次击杀']);
    if (mvp.d === 0) list.push(['零阵亡', '一次都没倒']);
    if (mvp.k + mvp.a >= 18) list.push(['团战核心', '击杀参与 ' + (mvp.k + mvp.a) + ' 次']);
    const seriesMvps = (state.results || []).filter((r) => r.mvp && r.mvp.n === mvp.n && r.mvp.side === mvp.side).length;
    if (seriesMvps >= 2) list.push(['大场之王', '本轮第 ' + seriesMvps + ' 次 MVP']);
    if (!list.length) list.push(['本局最佳', '综合评分 ' + mvp.rating.toFixed(1)]);
    return list.slice(0, 4).map((b) => '<span class="mvp-badge"><b>' + b[0] + '</b><i>' + b[1] + '</i></span>').join('');
  }

  function mvpRing(mvp) {
    const pct = Math.max(0, Math.min(100, mvp.dmgPct || 0));
    const R0 = 42;
    const C = 2 * Math.PI * R0;
    const dash = (C * pct) / 100;
    return '<svg class="ring" viewBox="0 0 100 100">' +
      '<circle class="r-bg" cx="50" cy="50" r="' + R0 + '"></circle>' +
      '<circle class="r-fg" cx="50" cy="50" r="' + R0 + '" stroke-dasharray="' + dash.toFixed(2) + ' ' + C.toFixed(2) + '"></circle>' +
      '<text class="r-num" x="50" y="49">' + pct.toFixed(1) + '%</text>' +
      '<text class="r-cap" x="50" y="63">伤害占比</text></svg>';
  }

  function mvpTeamRow(res, mvp) {
    const arr = res.stats[mvp.side] || [];
    const team = state.match[mvp.side].team;
    return arr.map((s) => {
      const on = s.n === mvp.n;
      return '<div class="mtr-card' + (on ? ' is-mvp' : '') + '">' + avatarHtml({ n: s.n }, team, 34) +
        '<div class="mtr-info"><b>' + s.n + '</b><span>' + s.champ + ' · ' + s.k + '/' + s.d + '/' + s.a + '</span></div>' +
        '<i class="grade ' + s.grade + '">' + s.grade + '</i></div>';
    }).join('');
  }

  function openMvp(res) {
    const mvp = res && res.mvp;
    if (!mvp) return;
    const m = state.match;
    const team = m[mvp.side].team;
    const modal = $('#modal-mvp');
    if (!modal) return;
    const splash = $('#mvp-splash');
    const art = champSplash(mvp.cid);
    splash.style.backgroundImage = 'url(' + art + ')';
    const portrait = $('#mvp-portrait');
    if (portrait) portrait.innerHTML = avatarHtml({ n: mvp.n, t: mvp.side === 'blue' ? m.blue.team : m.red.team }, team, 96);
    const nk = nickRandom(mvp.n);
    const tl = $('#mvp-tagline');
    if (tl) tl.textContent = nk ? '「' + nk + '」' : (mvp.side === 'blue' ? m.blue.team : m.red.team);
    $('#mvp-name').textContent = mvp.n;
    const champBox = document.getElementById('mvp-champ');
    if (champBox) {
      champBox.innerHTML = '<img class="mvp-champ-icon" src="' + champImg(mvp.cid) + '" alt="">' +
        '<span class="mvp-champ-name">' + mvp.champ + '</span>' +
        '<span class="mvp-champ-title">' + champTitle(mvp.cid) + '</span>';
    }
    const sc = state.series ? (state.series.score || {}) : {};
    let serTxt = '';
    if (state.series) {
      const no = state.series.cur.no;
      const bw = sc[m.blue.team] || 0;
      const rw = sc[m.red.team] || 0;
      serTxt = ' · 第 ' + no + ' 局｜大场 ' + bw + ' : ' + rw;
    }
    $('#mvp-team').textContent = team + ' · ' + R.ROLE_CN[mvp.role] + serTxt;
    $('#mvp-kda').textContent = mvp.k + ' / ' + mvp.d + ' / ' + mvp.a;
    const cap = document.getElementById('mvp-kda-cap');
    if (cap) cap.textContent = '击杀 / 死亡 / 助攻';
    const gr = document.getElementById('mvp-grade');
    if (gr) { gr.textContent = mvp.grade || 'S'; gr.className = 'mvp-grade grade-' + (mvp.grade || 'S'); }
    const rt = document.getElementById('mvp-rating');
    if (rt) rt.textContent = mvp.rating.toFixed(1);
    const badges = document.getElementById('mvp-badges');
    if (badges) badges.innerHTML = mvpBadges(res, mvp);
    const ring = document.getElementById('mvp-ring');
    if (ring) ring.innerHTML = mvpRing(mvp);
    const bars = document.getElementById('mvp-bars');
    if (bars) {
      const mk = (label, val, hint, cls) => '<div class="mb-row ' + cls + '"><span>' + label + '</span>' +
        '<div class="mb-track"><i style="width:' + Math.max(2, Math.min(100, val)) + '%"></i></div>' +
        '<b>' + (cls === 'is-pct' ? val.toFixed(1) + '%' : val + '%') + '</b><em>' + hint + '</em></div>';
      bars.innerHTML = mk('伤害占比', mvp.dmgPct, '全队输出占比', 'is-pct') + mk('参团率', mvp.kp, '击杀+助攻/队伍击杀', 'is-kp');
    }
    const items = [
      ['击杀', mvp.k],
      ['助攻', mvp.a],
      ['死亡', mvp.d],
      ['分均伤害', mvp.dmgRaw ? Math.round(mvp.dmgRaw * 0.9) : '—'],
      ['经济', mvp.gold ? (mvp.gold / 1000).toFixed(1) + 'k' : '—'],
      ['评分', mvp.rating.toFixed(1)],
    ];
    $('#mvp-grid').innerHTML = items.map((it) => '<div class="mg-item"><span>' + it[0] + '</span><b>' + it[1] + '</b></div>').join('');
    const q = $('#mvp-quote');
    if (q) {
      const nickText = window.NickUtil && window.NickUtil.meme ? window.NickUtil.meme(mvp.n) : '';
      q.innerHTML = '<p>' + mvpQuote(res, mvp) + '</p>' +
        (nickText ? '<p class="mvp-meme">「' + nk + '」' + nickText + '</p>' : '');
    }
    const tr = document.getElementById('mvp-team-row');
    if (tr) tr.innerHTML = mvpTeamRow(res, mvp);
    modal.classList.add('open');
  }

  // AI 败方选边：看自己队红蓝两边哪边更舒服（数据不足时默认蓝）
  function aiSideChoice(loserSide) {
    const s = state.series;
    const team = s && s.cur ? s.cur[loserSide] : state.teams[loserSide];
    const st = (window.TEAM_SIDE || {})[team];
    if (st && st.blue && st.red && (st.blue.g + st.red.g) >= 6) {
      return st.blue.wr >= st.red.wr ? 'blue' : 'red';
    }
    return 'blue';
  }

  function nextGame(loserSide, chooseSide) {
    const s = state.series;
    const g = s.cur;
    const loserTeam = g[loserSide];
    const winnerTeam = g[loserSide === 'blue' ? 'red' : 'blue'];
    const blue = chooseSide === 'blue' ? loserTeam : winnerTeam;
    const red = chooseSide === 'blue' ? winnerTeam : loserTeam;
    D.startGame(s, blue, red);
    state.suggest = [];
    state.filter = { pos: 'all', tag: 'all', q: '' };
    if (state.casterLog) state.casterLog = [];
    $('#champ-search').value = '';
    const mine = blue === state.myTeam ? 'blue' : 'red';
    toast('第 ' + s.cur.no + ' 局开始｜' + blue + ' 蓝色方 vs ' + red + ' 红色方' +
      (state.playMode === 'pve' ? '｜你在' + R.SIDE_CN[mine] : ''));
    showScreen('screen-draft');
    renderDraft();
    startTimer();
    maybeAiStep();
  }

  // ============ 大场 POM / PK ============
  function computePom() {
    const s = state.series;
    const results = state.results || [];
    if (!s || !results.length) return null;
    const acc = {};
    results.forEach((r) => {
      ['blue', 'red'].forEach((sd) => {
        const team = sd === 'blue' ? r.blueTeam : r.redTeam;
        r.stats[sd].forEach((st) => {
          const key = team + '|' + st.n;
          if (!acc[key]) {
            acc[key] = { n: st.n, team: team, role: st.role, champ: st.champ, cid: st.cid, games: 0, wins: 0, k: 0, d: 0, a: 0, dmg: 0, kp: 0, rating: 0, best: 0, mvps: 0 };
          }
          const x = acc[key];
          x.games++; x.wins += (sd === r.winner ? 1 : 0);
          x.k += st.k; x.d += st.d; x.a += st.a;
          x.dmg += st.dmgPct; x.kp += st.kp; x.rating += st.rating; x.best = Math.max(x.best, st.rating);
          if (r.mvp && r.mvp.n === st.n && r.mvp.side === sd) x.mvps++;
          x.champ = st.champ; x.cid = st.cid;
        });
      });
    });
    const list = Object.keys(acc).map((k) => {
      const x = acc[k];
      const avgRating = x.rating / x.games;
      const avgDmg = x.dmg / x.games;
      const avgKp = x.kp / x.games;
      const champion = s.winner && x.team === s.winner ? 0.45 : 0;
      x.avgRating = avgRating; x.avgDmg = avgDmg; x.avgKp = avgKp;
      x.score = avgRating + x.wins * 0.35 + x.mvps * 0.55 + avgDmg * 0.02 + avgKp * 0.01 + champion;
      return x;
    });
    list.sort((a, b) => b.score - a.score);
    return list[0] || null;
  }

  function seriesPomCard(pom) {
    if (!pom) return '';
    const q = pom.mvps >= 2
      ? '一个人拿走 ' + pom.mvps + ' 次单局 MVP，这个大场基本是他扛着走的。'
      : pom.avgDmg >= 28
        ? '场均 ' + pom.avgDmg.toFixed(1) + '% 的伤害占比，输出端最稳的一环。'
        : pom.avgKp >= 68
          ? '场均参团 ' + pom.avgKp.toFixed(0) + '%，每波团都在场上的那种稳定。'
          : '数据不花哨，但每一局都在关键节点上。';
    return '<div class="series-pom">' +
      '<div class="pom-cap">SERIES POM · 大场 MVP</div>' +
      '<div class="pom-body">' +
      '<div class="pom-portrait">' + avatarHtml({ n: pom.n }, pom.team, 92) + '</div>' +
      '<div class="pom-info"><h3>' + pom.n + '</h3>' +
      '<div class="pom-champ"><img src="' + champImg(pom.cid) + '" alt=""><span>' + pom.champ + '</span></div>' +
      '<div class="pom-team">' + pom.team + ' · ' + R.ROLE_CN[pom.role] + '</div></div>' +
      '<div class="pom-grid">' +
      [['出场', pom.games + ' 局'], ['胜场', pom.wins + ' 胜'], ['单局 MVP', pom.mvps + ' 次'],
       ['场均评分', pom.avgRating.toFixed(2)], ['场均伤害', pom.avgDmg.toFixed(1) + '%'], ['场均参团', pom.avgKp.toFixed(0) + '%']]
        .map((it) => '<div class="pom-item"><span>' + it[0] + '</span><b>' + it[1] + '</b></div>').join('') +
      '</div></div>' +
      '<div class="pom-quote">' + pom.n + ' 的 ' + pom.champ + '：' + q + '</div></div>';
  }

  function pkCard() {
    const s = state.series;
    const results = state.results || [];
    if (!s || !results.length) return '';
    if (state.playMode === 'pvp') return '';
    const myTeam = state.myTeam;
    const other = (sd) => (sd === 'blue' ? 'red' : 'blue');
    const sideOf = (r) => (r.blueTeam === myTeam ? 'blue' : 'red');
    const avg = (mine) => results.reduce((n, r) => {
      const sd = mine ? sideOf(r) : other(sideOf(r));
      return n + (r.bpq ? r.bpq[sd] : 0);
    }, 0) / results.length;
    const myBpq = avg(true), oppBpq = avg(false);
    const myWins = results.filter((r) => r.winner === sideOf(r)).length;
    const oppWins = results.length - myWins;
    const swing = myBpq - oppBpq;
    const verdict = Math.abs(swing) < 1.2
      ? '两边的 BP 质量几乎打平，胜负更多落在临场执行上。'
      : swing > 0
        ? '你的 BP 平均比 AI 高 ' + swing.toFixed(1) + ' 分，阵容这一层你先赢了一手。'
        : 'AI 的 BP 平均比你高 ' + Math.abs(swing).toFixed(1) + ' 分，选人阶段被压了一头。';
    const who = state.playMode === 'eve' ? '蓝方 AI 与红方 AI' : myTeam + ' vs ' + (results[0].blueTeam === myTeam ? results[0].redTeam : results[0].blueTeam);
    return '<div class="pk-card"><div class="pk-cap">BP 对局 PK · ' + who + '</div>' +
      '<div class="pk-rows">' +
      '<div class="pk-row"><span class="pk-team blue">' + (state.playMode === 'eve' ? '蓝方 AI' : myTeam) + '</span>' +
      '<b>' + myBpq.toFixed(1) + '</b><em>平均阵容分</em></div>' +
      '<div class="pk-row"><span class="pk-team red">' + (state.playMode === 'eve' ? '红方 AI' : '对手 AI') + '</span>' +
      '<b>' + oppBpq.toFixed(1) + '</b><em>平均阵容分</em></div>' +
      '<div class="pk-row"><span class="pk-team">' + (state.playMode === 'eve' ? '蓝方胜局' : '你赢下的局') + '</span><b>' + myWins + '</b><em>共 ' + results.length + ' 局</em></div>' +
      '</div><div class="pk-verdict">' + verdict + '</div></div>';
  }

  function showSeriesEnd() {
    window.__seRuns = (window.__seRuns || 0) + 1;
    const s = state.series;
    const winTeam = s.winner;
    const loseTeam = s.games[s.games.length - 1].blue === winTeam ? s.games[s.games.length - 1].red : s.games[s.games.length - 1].blue;
    const winScore = s.score[winTeam] || 0;
    const loseScore = s.score[loseTeam] || 0;
    const last = s.games[s.games.length - 1];

    document.getElementById('screen-sim').classList.add('solo');
    const cap = document.querySelector('.sim-score-cap');
    if (cap) cap.textContent = '大场比分';
    $('#sim-score').textContent = winScore + ' : ' + loseScore;
    $('#sim-blue').innerHTML = logoHtml(winTeam) + '<span></span>';
    $('#sim-red').innerHTML = '<span></span>' + logoHtml(loseTeam);
    $('#sim-blue').className = 'sim-team blue champion';
    $('#sim-red').className = 'sim-team red';

    const rows = s.games.map((g, i) => {
      const w = g.winner === 'blue' ? g.blue : g.red;
      const wIsBlue = g.winner === 'blue';
      const k = g.kills || { blue: 0, red: 0 };
      return '<div class="sg-row">' +
        '<div class="sg-no">第 ' + (i + 1) + ' 局</div>' +
        '<div class="sg-team' + (wIsBlue ? ' win' : '') + '">' + logoHtml(g.blue) + '<span>' + g.blue + '</span></div>' +
        '<div class="sg-kills"><b>' + (k.blue || 0) + '</b><i>:</i><b>' + (k.red || 0) + '</b></div>' +
        '<div class="sg-team right' + (!wIsBlue ? ' win' : '') + '"><span>' + g.red + '</span>' + logoHtml(g.red) + '</div>' +
        '</div>';
    }).join('');

    const pom = computePom();
    state.pom = pom;

    const aiMoves = (s.aiMoves || []);
    let aiRecap = '';
    if (aiMoves.length) {
      const byGame = {};
      aiMoves.forEach((mv) => { (byGame[mv.game] = byGame[mv.game] || []).push(mv); });
      const list = Object.keys(byGame).sort((a, b) => a - b).map((gn) => {
        const picks = byGame[gn].filter((x) => x.type === 'pick').length;
        const bans = byGame[gn].filter((x) => x.type === 'ban').length;
        const gg = s.games[gn - 1] || {};
        return '<div class="ai-recap-row"><b>第 ' + gn + ' 局</b><span>' +
          (gg.blue || '蓝方') + ' vs ' + (gg.red || '红方') + '</span><em>AI 出手 ' + (picks + bans) + ' 手（pick ' + picks + ' / ban ' + bans + '）</em></div>';
      }).join('');
      aiRecap = '<div class="ai-recap"><div class="ai-recap-cap">AI 的 BP 记录</div>' + list +
        '<p>每一手的完整思路在 BP 界面的「AI 的 BP 思路」面板里，逐条写了为什么 ban、为什么选。</p></div>';
    }

    const body = '<div class="series-hero">' +
      '<div class="sh-cap">SERIES WINNER · ' + s.cfg.mode + '</div>' +
      logoHtml(winTeam) +
      '<h2>' + winTeam + '</h2>' +
      '<div class="sh-score">' + winScore + ' : ' + loseScore + '</div>' +
      '<p>' + s.games.length + ' 局鏖战，' + winTeam + ' 拿下这个系列赛。</p>' +
      '</div>' +
      '<div class="series-games">' + rows + '</div>' +
      '<p class="series-note">最后一局由 ' + (last.winner === 'blue' ? last.blue : last.red) + ' 拿下，总击杀 ' +
      ((last.kills && last.kills.blue) || 0) + ' : ' + ((last.kills && last.kills.red) || 0) + '。</p>' +
      seriesPomCard(pom) + pkCard() + aiRecap +
      '<div class="series-actions"><button class="primary-btn" id="btn-restart">再来一场</button></div>';

    $('#sim-side').innerHTML = body;
    $('#sim-feed').innerHTML = '';
    $('#sim-actions').innerHTML = '';
    $('#sim-side').scrollIntoView({ behavior: 'smooth' });
    const rb = $('#btn-restart');
    if (rb) rb.onclick = () => {
      state.series = null;
      document.getElementById('screen-sim').classList.remove('solo');
      showScreen('screen-home');
      renderHomeSides();
    };
  }

  // MVP 弹窗关闭
  (function bindMvpModal() {
    const modal = $('#modal-mvp');
    if (!modal) return;
    const close = () => modal.classList.remove('open');
    const btn = $('#mvp-close');
    if (btn) btn.onclick = close;
    modal.onclick = (e) => { if (e.target === modal) close(); };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  })();

  // ================= 选手编辑 =================
  function loadOverrides() {
    try {
      const raw = localStorage.getItem('bp_players_v1');
      if (!raw) return;
      const data = JSON.parse(raw);
      PLAYERS.forEach((p) => {
        const o = data[p.t + '|' + p.n];
        if (!o) return;
        ['a', 'd', 'f', 'b', 'p'].forEach((k) => { if (typeof o[k] === 'number') p[k] = o[k]; });
        if (o.s) p.s = o.s;
        if (o.r) p.r = o.r;
      });
    } catch (e) { /* ignore */ }
  }
  function saveOverrides() {
    const data = {};
    PLAYERS.forEach((p) => { data[p.t + '|' + p.n] = { a: p.a, d: p.d, f: p.f, b: p.b, p: p.p, s: p.s, r: p.r }; });
    try { localStorage.setItem('bp_players_v1', JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  function saveCustomPlayers() {
    const added = PLAYERS.filter((p) => p.custom)
      .map((p) => ({ n: p.n, t: p.t, r: p.r, a: p.a, d: p.d, f: p.f, b: p.b, p: p.p, s: p.s, sub: p.sub || 0 }));
    try { localStorage.setItem(K_CUSTOM, JSON.stringify({ added: added, moved: MOVED })); } catch (e) { /* ignore */ }
  }

  // ===== 编辑器保存状态 =====
  let editorDirty = false;
  function setSaveState(mode) {
    const el = $('#save-state');
    if (!el) return;
    if (mode === 'dirty') {
      el.textContent = '● 有未保存的修改';
      el.className = 'save-state is-dirty';
    } else if (mode === 'saved') {
      const t = new Date();
      const hh = ('0' + t.getHours()).slice(-2);
      const mm = ('0' + t.getMinutes()).slice(-2);
      el.textContent = '✓ 已保存 ' + hh + ':' + mm + '（本地浏览器）';
      el.className = 'save-state is-saved';
    } else {
      el.textContent = '数值 0–99，改完点「保存修改」写入本地';
      el.className = 'save-state';
    }
  }
  function markEditorDirty() {
    editorDirty = true;
    setSaveState('dirty');
  }
  function saveAllEdits(silent) {
    saveOverrides();
    saveCustomPlayers();
    persistPhotos();
    editorDirty = false;
    setSaveState('saved');
    if (!silent) toast('已保存到本地浏览器');
  }

  // 把任意真实选手转入自由选手池 → 任何队伍都能选，用来组梦之队
  function moveToPool(p) {
    if (p.t === POOL) return;
    if (!confirm('把「' + p.n + '」转入自由选手池？\n他会离开 ' + p.t + '，之后每支队伍都能选到他。')) return;
    const oldKey = p.t + '|' + p.n;
    const newKey = POOL + '|' + p.n;
    MOVED.push(oldKey);
    if (PHOTOS[oldKey]) {
      PHOTOS[newKey] = PHOTOS[oldKey];
      delete PHOTOS[oldKey];
      persistPhotos();
    }
    p.t = POOL;
    p.custom = 1;
    saveCustomPlayers();
    saveOverrides();
    renderEditor();
    renderHomeSides();
    toast(p.n + ' 已进入自由池，可以加入任何队伍了');
  }

  // ===== 转会：把选手移到任意队伍 / 自由池 =====
  function openTransfer(p) {
    const modal = $('#modal-transfer');
    if (!modal) return;
    const sel = $('#transfer-team');
    const opts = TEAMS.slice().sort((a, b) => a.t.localeCompare(b.t)).map((t) =>
      '<option value="' + t.t + '">' + t.t + (t.custom ? '（自建）' : '') + '</option>').join('') +
      '<option value="' + POOL + '">★ ' + POOL_CN + '</option>';
    sel.innerHTML = opts;
    sel.value = p.t;
    $('#transfer-title').textContent = '选手转会 · ' + p.n;
    modal.classList.add('open');
    const ok = $('#btn-transfer-ok');
    ok.onclick = () => {
      modal.classList.remove('open');
      const to = sel.value;
      if (to && to !== p.t) transferPlayer(p, to);
    };
  }

  function transferPlayer(p, to) {
    const from = p.t;
    const oldKey = from + '|' + p.n;
    const newKey = to + '|' + p.n;
    if (PHOTOS[oldKey] && !PHOTOS[newKey]) {
      PHOTOS[newKey] = PHOTOS[oldKey];
      delete PHOTOS[oldKey];
      persistPhotos();
    }
    if (!p.custom && MOVED.indexOf(oldKey) < 0) MOVED.push(oldKey);
    p.t = to;
    p.custom = 1;
    p.sub = 0;
    state.lineup = { blue: {}, red: {} };
    state.players = { blue: {}, red: {} };
    saveCustomPlayers();
    saveOverrides();
    renderEditor();
    renderHomeSides();
    refreshTeamSelects();
    toast(p.n + ' 从 ' + (from === POOL ? POOL_CN : from) + ' 转会至 ' + (to === POOL ? POOL_CN : to));
  }

  // ===== 自定义选手创建表单 =====
  function createPlayerFromForm() {
    const nameEl = $('#np-name');
    const name = (nameEl ? nameEl.value : '').trim();
    if (!name) { toast('先填一个选手 ID'); return; }
    if (name.length > 16) { toast('ID 太长，16 个字符以内'); return; }
    const team = $('#np-team').value || TEAMS[0].t;
    const role = $('#np-role').value || 'mid';
    const champsRaw = ($('#np-champs').value || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (PLAYERS.some((p) => p.t === team && p.n === name)) { toast('这个队伍里已经有同名选手了'); return; }
    const toId = (x) => {
      if (CHAMP_BY_ID[x]) return x;
      const hit = CHAMPIONS.find((c) => c.c === x || c.t === x || c.i.toLowerCase() === x.toLowerCase());
      return hit ? hit.i : null;
    };
    const champs = champsRaw.map(toId).filter(Boolean);
    if (champsRaw.length && champs.length < champsRaw.length) toast('部分英雄没认出来，已忽略');
    const p = {
      n: name, t: team, r: role, a: 78, d: 78, f: 78, b: 78, p: 80,
      s: champs, sub: 0, custom: 1,
    };
    PLAYERS.push(p);
    saveCustomPlayers();
    state.lineup = { blue: {}, red: {} };
    renderEditor();
    renderHomeSides();
    if (nameEl) nameEl.value = '';
    const cEl = $('#np-champs');
    if (cEl) cEl.value = '';
    toast('已创建 ' + name + '（' + R.ROLE_CN[role] + '）· ' + (team === POOL ? POOL_CN : team) + '，可在编辑器里改数值、传头像、转队');
  }

  function persistPhotos() {
    const out = {};
    Object.keys(PHOTOS).forEach((k) => { if (String(PHOTOS[k]).indexOf('data:') === 0) out[k] = PHOTOS[k]; });
    try { localStorage.setItem(K_PHOTOS, JSON.stringify(out)); } catch (e) { toast('头像太大，浏览器存不下，换张小图试试'); }
  }
  function savePhoto(team, name, dataUrl) {
    const key = team + '|' + name;
    if (dataUrl) PHOTOS[key] = dataUrl; else delete PHOTOS[key];
    persistPhotos();
  }

  function refreshTeamSelects() {
    ['#home-blue-team', '#home-red-team'].forEach((s) => {
      const el = $(s);
      if (!el) return;
      const cur = el.value;
      el.innerHTML = TEAMS.slice().sort((a, b) => a.t.localeCompare(b.t))
        .map((t) => '<option value="' + t.t + '">' + t.t + '（' + t.tag + '）</option>').join('');
      el.value = cur;
    });
    const es = $('#editor-team');
    if (es && es.dataset.built) {
      const cur = es.value;
      es.innerHTML = TEAMS.map((t) => '<option value="' + t.t + '">' + t.t + (t.custom ? '（自建）' : '') + '</option>').join('') +
        '<option value="' + POOL + '">★ ' + POOL_CN + '（可加入任意队伍）</option>';
      es.value = cur;
    }
  }

  // 选图 → 裁剪成 200x200 JPEG 存本地（不联网）
  let imgInput = null;
  function pickImage(cb) {
    if (!imgInput) {
      imgInput = document.createElement('input');
      imgInput.type = 'file';
      imgInput.accept = 'image/*';
      imgInput.style.display = 'none';
      document.body.appendChild(imgInput);
    }
    imgInput.value = '';
    imgInput.onchange = () => {
      const f = imgInput.files && imgInput.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const size = 200;
          const c = document.createElement('canvas');
          c.width = size; c.height = size;
          const g = c.getContext('2d');
          const s = Math.min(img.width, img.height);
          g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
          cb(c.toDataURL('image/jpeg', 0.86));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(f);
    };
    imgInput.click();
  }

  function addPlayer() {
    const team = $('#editor-team').value || TEAMS[0].t;
    const where = team === POOL ? POOL_CN : team;
    const name = (prompt('新增选手的 ID / 名字（' + where + '）\n建议用英文 ID，头像和存档都靠它识别') || '').trim();
    if (!name) return;
    if (PLAYERS.some((p) => p.t === team && p.n === name)) { toast('这个名单里已经有同名选手了'); return; }
    const role = (prompt('位置：top / jg / mid / bot / sup', 'mid') || 'mid').trim().toLowerCase();
    const p = {
      n: name, t: team, r: R.ROLES.indexOf(role) >= 0 ? role : 'mid',
      a: 78, d: 78, f: 78, b: 78, p: 78, s: [], sub: 0, custom: 1,
    };
    PLAYERS.push(p);
    saveCustomPlayers();
    renderEditor();
    renderHomeSides();
    toast('已加入 ' + where + '：' + name + '，点「头像」上传照片');
  }

  function removePlayer(p) {
    if (!confirm('删除自定义选手「' + p.n + '」？')) return;
    const i = PLAYERS.indexOf(p);
    if (i >= 0) PLAYERS.splice(i, 1);
    savePhoto(p.t, p.n, null);
    ['blue', 'red'].forEach((sd) => {
      if (state.players[sd] && state.players[sd][p.r] === p) state.players[sd][p.r] = null;
      if (state.lineup[sd] && state.lineup[sd][p.r] === p.n) delete state.lineup[sd][p.r];
    });
    saveCustomPlayers();
    saveOverrides();
    renderEditor();
    renderHomeSides();
  }

  function addTeam() {
    const name = (prompt('新队伍的队名（会出现在选队下拉里）', '') || '').trim();
    if (!name) return;
    if (TEAM_BY_NAME[name]) { toast('已经有一支同名队伍了'); return; }
    const tag = ((prompt('队伍缩写（2–4 个字母，用作队标占位）', name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'NEW') || '').trim() || 'NEW').toUpperCase();
    const c1 = (prompt('队伍主色（CSS 颜色）', '#c9a227') || '#c9a227').trim();
    const c2 = (prompt('队伍辅色（CSS 颜色）', '#1b2333') || '#1b2333').trim();
    const team = { t: name, tag: tag, c1: c1, c2: c2, custom: 1 };
    TEAMS.push(team);
    TEAM_BY_NAME[name] = team;
    try {
      const arr = TEAMS.filter((x) => x.custom).map((x) => ({ t: x.t, tag: x.tag, c1: x.c1, c2: x.c2 }));
      localStorage.setItem(K_TEAMS, JSON.stringify(arr));
    } catch (e) { /* ignore */ }
    refreshTeamSelects();
    const es = $('#editor-team');
    if (es && es.dataset.built) { es.value = name; fillNewPlayerTeams(name); renderEditor(); }
    toast('已创建「' + name + '」，接着用「＋ 新增选手」给它加人');
  }

  function fillNewPlayerTeams(keep) {
    const np = $('#np-team');
    if (!np) return;
    const cur = keep || np.value || '';
    np.innerHTML = TEAMS.slice().sort((a, b) => a.t.localeCompare(b.t))
      .map((t) => '<option value="' + t.t + '">' + t.t + (t.custom ? '（自建）' : '') + '</option>').join('') +
      '<option value="' + POOL + '">★ ' + POOL_CN + '</option>';
    let has = false;
    for (let i = 0; i < np.options.length; i++) if (np.options[i].value === cur) has = true;
    if (has) np.value = cur;
  }

  function pickTeamLogo(team) {
    pickImage((dataUrl) => {
      LOGOS[team] = dataUrl;
      if (TEAM_BY_NAME[team]) TEAM_BY_NAME[team].logo = dataUrl;
      try {
        const arr = TEAMS.filter((x) => x.custom).map((x) => ({ t: x.t, tag: x.tag, c1: x.c1, c2: x.c2, logo: x.logo || null }));
        localStorage.setItem(K_TEAMS, JSON.stringify(arr));
      } catch (e) { /* ignore */ }
      renderHomeSides();
      renderEditor();
      toast('队标已更新');
    });
  }

  function openEditor() {
    const sel = $('#editor-team');
    if (!sel.dataset.built) {
      sel.innerHTML = TEAMS.map((t) => '<option value="' + t.t + '">' + t.t + (t.custom ? '（自建）' : '') + '</option>').join('') +
        '<option value="' + POOL + '">★ ' + POOL_CN + '（可加入任意队伍）</option>';
      sel.dataset.built = '1';
      sel.onchange = renderEditor;
      $('#btn-add-player').onclick = addPlayer;
      $('#btn-add-team').onclick = addTeam;
      $('#btn-team-logo').onclick = () => {
        const team = $('#editor-team').value;
        if (!team || team === POOL) { toast('先在左边选一支队伍，再换队标'); return; }
        pickTeamLogo(team);
      };
      $('#btn-reset-data').onclick = () => {
        if (confirm('恢复默认？（会清空你自己加的队伍、选手、头像与所有数值修改）')) {
          ['bp_players_v1', K_CUSTOM, K_PHOTOS, K_TEAMS].forEach((k) => localStorage.removeItem(k));
          location.reload();
        }
      };
      const npTeam = $('#np-team');
      if (npTeam) {
        npTeam.innerHTML = TEAMS.slice().sort((a, b) => a.t.localeCompare(b.t))
          .map((t) => '<option value="' + t.t + '">' + t.t + (t.custom ? '（自建）' : '') + '</option>').join('') +
          '<option value="' + POOL + '">★ ' + POOL_CN + '</option>';
      }
      const cBtn = $('#btn-create-player');
      if (cBtn) cBtn.onclick = createPlayerFromForm;
    }
    const cBtn2 = $('#btn-create-player');
    if (cBtn2) cBtn2.onclick = createPlayerFromForm;
    const saveBtn = $('#btn-save-all');
    if (saveBtn) saveBtn.onclick = () => saveAllEdits(false);
    if (!editorDirty) setSaveState('idle');
    fillNewPlayerTeams($('#editor-team').value);
    $('#modal-editor').classList.add('open');
    renderEditor();
  }

  function renderEditor() {
    const team = $('#editor-team').value || TEAMS[0].t;
    const isPool = team === POOL;
    const list = isPool ? PLAYERS.filter((p) => p.t === POOL) : rosterOf(team);
    const teamInfo = TEAM_BY_NAME[team];
    let html = '<div class="editor-sub">' +
      '<b>' + (isPool ? '★ ' + POOL_CN : team) + '</b>' +
      '<span class="muted">' + (isPool
        ? '这里的选手会出现在每支队伍的上场名单里，用来组梦之队'
        : (teamInfo ? teamInfo.tag : '') + ' · ' + list.length + ' 人') + '</span>' +
      '<button class="ghost-btn mini" id="btn-team-logo-inline">' + (isPool ? '' : '换队标') + '</button>' +
      '</div>' +
      '<div class="editor-row head"><div>选手</div><div>位置</div><div>进攻</div><div>防守</div><div>团战</div><div>运营</div><div>英雄池</div><div>擅长英雄（中文名或英文 ID，逗号分隔）</div><div>头像</div></div>';
    if (!list.length) {
      html += '<div class="editor-empty">还没有选手。点上方「＋ 新增选手」加一个' + (isPool ? '自由选手' : '') + '，再点「头像」上传照片。</div>';
    }
    html += list.map((p) => {
      const roleOpts = R.ROLES.map((r) => '<option value="' + r + '"' + (p.r === r ? ' selected' : '') + '>' + R.ROLE_CN[r] + '</option>').join('');
      return '<div class="editor-row" data-key="' + p.t + '|' + p.n + '">' +
        '<div class="ed-name">' + avatarHtml(p, p.t) + '<span>' + p.n + '</span>' +
        (p.custom ? '<em class="ed-badge">自建</em>' : '') + '</div>' +
        '<div class="ed-role"><select data-f="r">' + roleOpts + '</select></div>' +
        ['a', 'd', 'f', 'b', 'p'].map((k) => '<input type="number" min="1" max="99" data-f="' + k + '" value="' + p[k] + '">').join('') +
        '<input type="text" data-f="s" value="' + (p.s || []).join(', ') + '">' +
        '<div class="ed-act"><button class="ghost-btn mini" data-act="avatar">头像</button>' +
        '<button class="ghost-btn mini" data-act="transfer">转会</button>' +
        (!isPool ? '<button class="ghost-btn mini" data-act="pool">转池</button>' : '') +
        (p.custom ? '<button class="ghost-btn mini danger" data-act="del">删除</button>' : '') + '</div>' +
        '</div>';
    }).join('');
    $('#editor-list').innerHTML = html;

    const inlineLogo = $('#btn-team-logo-inline');
    if (inlineLogo) {
      inlineLogo.style.display = isPool ? 'none' : '';
      inlineLogo.onclick = () => pickTeamLogo(team);
    }

    $$('#editor-list .editor-row[data-key]').forEach((row) => {
      const idx = row.dataset.key.indexOf('|');
      const tm = row.dataset.key.slice(0, idx), nm = row.dataset.key.slice(idx + 1);
      const p = PLAYERS.find((x) => x.t === tm && x.n === nm);
      if (!p) return;
      $$('input,select', row).forEach((inp) => {
        inp.onchange = () => {
          const f = inp.dataset.f;
          if (f === 's') {
            const toks = inp.value.split(',').map((x) => x.trim()).filter(Boolean);
            const toId = (x) => {
              if (CHAMP_BY_ID[x]) return x;
              const hit = CHAMPIONS.find((c) => c.c === x || c.t === x || c.c.replace(/\s/g, '') === x);
              return hit ? hit.i : null;
            };
            p.s = toks.map(toId).filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i);
            if (p.s.length !== toks.length) toast('有英雄没认出来，已自动忽略（可填英文 ID 或中文名）');
          } else if (f === 'r') {
            p.r = inp.value;
          } else {
            p[f] = Math.max(1, Math.min(99, parseInt(inp.value, 10) || 60));
            inp.value = p[f];
          }
          markEditorDirty();
          renderHomeSides();
        };
      });
      $$('.ed-act button', row).forEach((btn) => {
        btn.onclick = () => {
          if (btn.dataset.act === 'avatar') pickImage((dataUrl) => {
            savePhoto(p.t, p.n, dataUrl);
            renderEditor();
            renderHomeSides();
            toast(p.n + ' 的头像已更新');
          });
          else if (btn.dataset.act === 'transfer') openTransfer(p);
          else if (btn.dataset.act === 'pool') moveToPool(p);
          else removePlayer(p);
        };
      });
    });
  }

  // ================= 规则说明 =================
  function openHelp() {
    $('#help-body').innerHTML = [
      '<h4>BP 顺序（标准职业赛制）</h4>',
      '<ul>',
      '<li>第一轮禁用：蓝、红交替各 3 个（共 6 ban）</li>',
      '<li>第一轮选人：蓝 1 → 红 2 → 蓝 2 → 红 1</li>',
      '<li>第二轮禁用：红、蓝交替各 2 个（共 4 ban）</li>',
      '<li>第二轮选人：红 1 → 蓝 2 → 红 1</li>',
      '<li>合计每队 5 ban / 5 pick，全场 20 手</li>',
      '</ul>',
      '<h4>无畏征召（全局 BP）</h4>',
      '<ul>',
      '<li>同一场 BO3 / BO5 内，前面小局<b>被选用</b>过的英雄，双方在后续小局都不能再选。</li>',
      '<li>禁用只在当前小局有效，每局重置（这是 Riot Fearless Draft 的标准口径）。</li>',
      '<li>所以 BO5 打满时，第 5 局最多会有 4 × 10 = 40 个英雄因被选用而消失，加上本局 10 个 ban。</li>',
      '<li>「硬核模式」把禁用也计入继承池，属于自定义规则，默认关闭。</li>',
      '</ul>',
      '<h4>BP 之后能做什么</h4>',
      '<ul>',
      '<li>调整楼位与分路：把英雄拖到任意位置，或点击两张卡片交换，也可以直接换选手。</li>',
      '<li>「BP 质量」面板给出双方阵容评分、体系标签、下路组合的<b>本赛季真实胜率</b>、最大结构缺陷，以及这局 BP 折算的胜率百分点。</li>',
      '<li>再往下是 13 个阵容维度对比、分路对位、结构性点评和胜率预测。</li>',
      '<li>最后点「模拟这一把」，生成一整局从开局到水晶爆炸的全程解说文案。</li>',
      '</ul>',
      '<h4>BP 分析依据（以 S16 为主 + 2025 赛季参照）</h4>',
      '<ul>',
      '<li>抓到 LPL / LCK / LEC / MSI / Worlds / First Stand / 德杯 共 <b>2159 局</b>的实际 BP 与胜负（<b>2026 赛季 1660 局按 1.0 计权，2025 赛季 499 局按 0.3 计权</b>，其中 2026 季后赛单独存了一份 <b>348 局</b>的数据集，用来复盘季后赛的版本与 ban 思路）。</li>',
      '<li>统计出每个英雄的 ban 率、选取率、胜率、各位置表现，以及下路组合和同位置对位的真实胜率；蓝方胜率约 <b>55.4%</b>（季后赛 53.2%），各队自己的红蓝边胜率也单独统计进了胜率模型。</li>',
      '<li>胜率模型里纸面实力只占 <b>30%</b> 左右，其余看阵容合理性：体系是否成套、组合有没有配合、对位是否被克、版本强度够不够、BP 有没有被对面牵着走。</li>',
      '<li>硬实力差 30 分以上基本无法用 BP 逆转；20 分左右，一手好 BP 是能翻的。</li>',
      '<li>AI 也用这套数据：先看版本 T0 和摇摆位，再看自家体系要补什么，最后针对你已成型的体系见招拆招（你冲阵它就摸风女/波比，你消耗它就摸索拉卡/希维尔，你出大肉它就摸薇恩/克格莫），并且保证五个英雄一定能摆满五个位置。</li>',
      '<li><b>AI 的思路是公开的</b>：只要是 AI 出手，BP 页上方的「AI 的 BP 思路」面板会写出它这一手为什么 ban、为什么选，包含版本强度、体系完成度、克制关系、选手本命和选边计划。</li>',
      '<li>BP 阶段右边还有<b>解说席</b>（可开可关）：每一手都会给出「妙手 / 好手 / 常规 / 一般 / 疑问手」的评价和理由——比如这手是不是拆了对面的组合、有没有踩在对面已经锁好的位置上浪费 ban、是不是把上一局的痛点又放出来了。<b>2026 LPL 第三赛段季后赛的完整复盘</b>（55 局，含 ban/pick 率、红蓝边、系列赛比分）写在 <code>docs/lpl-2026-split3-playoffs.md</code>。</li>',
      '</ul>',
      '<h4>整场跟随一支队伍（不再是「选红/蓝边」）</h4>',
      '<ul>',
      '<li>现在你选的是<b>队伍</b>，不是边。BO3 / BO5 会换边，但你整场都在替同一支队伍 BP——它这局在蓝你就坐蓝，下局换到红你就坐红。</li>',
      '<li>输掉一局后由败方选边：轮到 AI 选边时，它会参考那支队伍本季在红/蓝两边的胜率（样本不足时默认蓝）；轮到你自己选时，会给你「蓝色方 / 红色方」两个按钮。</li>',
      '<li>右侧 AI 日志会一直写「你执 XXX（本局蓝/红方）」，赛后 PK 面板也按「你在哪边」逐局统计，不会把两边的数据混在一起。</li>',
      '</ul>',
      '<h4>解说模式（BP 时实时点评每一手）</h4>',
      '<ul>',
      '<li>BP 页右侧的解说席会把最近几手逐条点评，带一个评级标签：<b>妙手</b>（这手比当前最优解只差不到 1 分）、<b>好手</b>、<b>常规</b>、<b>一般</b>、<b>疑问手</b>。</li>',
      '<li>点评会结合：选手招牌与英雄池、队伍本季的 ban/pick 习惯、体系缺件、组合拆不拆、版本 ban 率、对位克制，以及<b>上一局谁赢在哪一手</b>。</li>',
      '<li>右上角「解说：开/关」随时切换；首页规则行也有「解说模式」勾选框。</li>',
      '</ul>',
      '<h4>对局模式</h4>',
      '<ul>',
      '<li><b>玩家 vs 玩家</b>：两边都由你自己点，标准 BP。</li>',
      '<li><b>玩家 vs AI</b>：你选一支队伍，整场跟着它走；对手的 ban/pick 由 AI 自动完成，可自选 AI 风格（运营流 / 节奏流 / 混合）。</li>',
      '<li><b>AI vs AI</b>：两边都交给 AI，可暂停、可调速度（×1 / ×2 / ×4），适合看两种风格互掐。大场结束会给 AI 的 BP 复盘和 PK 面板。</li>',
      '</ul>',
      '<h4>AI 是按职业赛的路子出牌的</h4>',
      '<ul>',
      '<li><b>只走职业分路</b>：每个英雄能打哪几个位置，是从 2159 局职业比赛的实际上场位置统计出来的（比如妮蔻只打过辅助、杰斯 96% 在上路、库奇 96% 在下路）；近几年没在职业赛打过中单的英雄，AI 不会把它塞到中单。</li>',
      '<li><b>按队伍风格组阵容</b>：24 支队伍各有主副风格——Gen.G 是「玄武大阵」（视野与阵型优先，双核三件套再打），BLG、TES、IG 是强压/冲阵，KT 是强开连招，NS 是消耗拉扯。AI 会优先补齐这套体系缺的位置和核心件，而不是照着 rank 热门选。</li>',
      '<li><b>先抢什么、后手拿什么</b>：一抢优先摇摆位和队伍舒适区（本季第一顺位常用），辅助和只会一个位置的英雄晚点亮；二轮再拿克制位，最后一手专门 counter 对面的已亮英雄。</li>',
      '<li><b>ban 位用人情世故</b>：除了版本和绝活，还会读两边的 ban 数据——「对面本季被 ban 最多的点」和「我们队习惯第一轮处理谁」，所以你会看到 AI 帮自家 Chovy 留 Orianna、转头去 ban 对手最舒服的那个。</li>',
      '<li><b>ban 位按位置算账</b>：如果对面某个位置已经锁好了（比如打野已经出了），再往那个位置上丢 ban 就是浪费——AI 会给这种 ban 扣一大截分，转去踩对面还没补的坑。对面亮了两手体系件，它也会优先拆组合，而不是照着热榜抄。</li>',
      '<li><b>二三局不照抄第一局</b>：同一场里，如果某手已经按过两次而对面一次没拿，AI 第三局会主动换口子；上一局对面赢在哪一手，下一局那手会被优先处理。无畏征召下已经进全局池的英雄则不用再浪费 ban。</li>',
      '<li><b>阵容有底线</b>：五手拿完还缺前排、缺法术伤害、或者后排三个脆皮没人保，AI 会在最后两手补结构，不会为了抢热门把阵容拼成五个输出。</li>',
      '</ul>',
      '<h4>一局比赛里能看到什么</h4>',
      '<ul>',
      '<li><b>经济走势图</b>：按时间画出双方经济差，标出潮虫、先锋、小龙、龙魂、大龙五个资源点，鼠标悬停看具体分钟与归属。</li>',
      '<li><b>资源条</b>：每个资源点的时间、归属一眼扫完，底部还有双方的击杀 / 小龙 / 潮虫 / 大龙汇总。</li>',
      '<li><b>选手评分</b>：每人一个 3.0–9.9 的评分和 S / A / B / C / D 等级，由 KDA、伤害占比、参团率和胜负算出。</li>',
      '<li><b>网友评论</b>：每位选手都有弹幕式评论，打得好是夸，打得差是真骂；可按「好评 / 黑榜 / 蓝方 / 红方」筛选。</li>',
      '<li><b>大场 POM</b>：BO3 / BO5 打完后按整场数据评出大场 MVP（SERIES POM），不是只看最后一局。</li>',
      '<li><b>单局 MVP 界面</b>：每局结束会弹出 MATCH MVP——选手头像、英雄原画、外号、KDA、评分等级、伤害占比圆环、徽章（伤害王 / 评分第一 / 零阵亡…）和五名队友的对比小卡，也可以点侧栏的 MVP 卡片再打开一次。</li>',
      '<li><b>评论带梗</b>：评论会叫选手的外号，夸的时候用「太子」「大魔王」「尺帝」，打得差会切到虎扑式的黑称（巧克力、臭克斯、断手这类），并且是拿数据与 BP 说事——不是随机骂人，也不是复读同一句话。</li>',
      '</ul>',
      '<h4>数值说明</h4>',
      '<ul>',
      '<li>每位选手有 <code>进攻 / 防守 / 团战 / 运营 / 英雄池</code> 五项评分，可在「编辑选手数据」里随便改。</li>',
      '<li>128 名选手的数值按「队伍本季战绩 + 队内位置 + 明星系数」重新校准过一遍：强队核心（Chovy、Faker、Ruler、Canyon）在 94–97，中游队主力在 82–88，弱队与替补在 77–82，不再是随手填的数字。</li>',
      '<li><b>改完记得点「保存修改」</b>（或按 Ctrl/Cmd+S）：工具条右侧会显示「● 有未保存的修改 / ✓ 已保存 时间」；直接关掉编辑器也会自动保存，改动存在你自己浏览器里。</li>',
      '<li>英雄的位置、伤害类型、标签来自内置元数据 + 1534 局能对上 24 队的职业分路统计，会影响阵容强度与胜率计算；每队的红蓝边胜率也来自同一批数据。</li>',
      '</ul>',
      '<h4>自定义（全部存在你自己浏览器里）</h4>',
      '<ul>',
      '<li><b>快捷新建选手</b>：编辑器顶部一行表单——ID + 队伍 + 位置 + 擅长英雄（中文名或英文 ID，逗号分隔），点「创建」即入队，数值默认 78。</li>',
      '<li><b>换头像</b>：右上角「编辑选手数据」→ 任意一行点「头像」，选一张图，会自动裁成 200×200 存到本地。</li>',
      '<li><b>转会</b>：任意一行点「转会」，选目标队伍（或自由选手池）确认即可，阵地名单立刻更新，头像也跟着走。</li>',
      '<li><b>新增选手</b>：「＋ 新增选手」给当前队伍加人，填 ID 和位置，五项数值默认 78，可再改。</li>',
      '<li><b>自由选手池</b>：队伍下拉最后一项 <code>★ 自由选手池</code>，这里加的选手每支队伍都能选，用来组梦之队。</li>',
      '<li><b>自建队伍</b>：「＋ 新增队伍」填队名、缩写、主色辅色，然后切到这支队伍加选手、换队标。</li>',
      '<li><b>恢复默认</b>：一键清空自建队伍、自建选手、自定义头像和所有数值修改。</li>',
      '</ul>',
    ].join('');
    $('#modal-help').classList.add('open');
  }

  // ================= 事件绑定 =================
  $('#btn-editor').onclick = openEditor;
  $('#btn-help').onclick = openHelp;
  $$('[data-close]').forEach((b) => {
    b.onclick = () => {
      const modal = b.closest('.modal');
      if (modal && modal.id === 'modal-editor' && editorDirty) {
        saveAllEdits(true);
        toast('修改已自动保存到本地');
      }
      if (modal) modal.classList.remove('open');
    };
  });
  $$('.modal').forEach((m) => {
    m.onclick = (e) => {
      if (e.target !== m) return;
      if (m.id === 'modal-editor' && editorDirty) { saveAllEdits(true); toast('修改已自动保存到本地'); }
      m.classList.remove('open');
    };
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const ed = $('#modal-editor');
      if (ed && ed.classList.contains('open') && editorDirty) { saveAllEdits(true); toast('修改已自动保存到本地'); }
      $$('.modal.open').forEach((m) => m.classList.remove('open'));
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      const ed = $('#modal-editor');
      if (ed && ed.classList.contains('open')) { e.preventDefault(); saveAllEdits(false); }
    }
  });

  // ================= 启动 =================
  loadOverrides();
  $('#patch-label').textContent = window.PATCH_VERSION || '16.20.1';
  initHome();
  window.__bp = state;
  // 无头验收用的最小调试钩子（不参与正常玩法）
  window.__bpTest = {
    showSeriesEnd: showSeriesEnd,
    finishFeed: finishFeed,
    commentsCard: commentsCard,
    seriesPomCard: seriesPomCard,
    computePom: computePom,
    openMvp: openMvp,
    mvpBadges: mvpBadges,
    mvpTeamRow: mvpTeamRow,
    mySideNow: mySideNow,
    isMySide: isMySide,
    isAiSide: isAiSide,
    aiSideChoice: aiSideChoice,
  };
})();
