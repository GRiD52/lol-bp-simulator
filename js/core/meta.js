// 版本理解知识库：体系、组合、克制、强势期
// 数据侧（真实赛事 pick/ban/胜率）由 prostats.js 提供，这里放「怎么读这个版本」的经验规则。
(function () {
  // ===== 1. 体系（阵容原型）=====
  // need: 需要凑齐的标签数量；w: 每个标签在体系里的权重（3 为核心）；prio: 同分时的识别优先级
  // tip: 一句话描述；strong/weak: 体系相性（k 指向 ARCH 的 k）
  const ARCH = [
    {
      k: 'front', cn: '前后排团战', short: '5v5 正面',
      need: { front: 2, cc: 1, scale: 1 }, w: { front: 3, cc: 1.2, scale: 1.4 }, prio: 9, sig: { front: 2 },
      tip: '两个人以上的前排顶住第一波，后排双核站桩输出，团战越打越强。',
      strong: ['dive', 'pick'], weak: ['poke', 'split'],
    },
    {
      k: 'dive', cn: '冲阵突脸', short: '冲阵',
      need: { mobi: 2, burst: 1, engage: 1 }, w: { mobi: 2.6, burst: 2, engage: 1.4 }, prio: 7, sig: { engage: 2 },
      tip: '多段位移直接越过前排切后排，怕的是减伤、解控和反手留人。',
      strong: ['poke', 'scale'], weak: ['front', 'disengage'],
    },
    {
      k: 'poke', cn: '消耗拉扯', short: 'poke',
      need: { poke: 2, wave: 1 }, w: { poke: 3, wave: 1.4 }, prio: 5, sig: { poke: 2 },
      tip: '靠血量和线权把对手压出资源区，怕强开一波把团战打起来。',
      strong: ['front', 'wombo'], weak: ['engage', 'dive'],
    },
    {
      k: 'pick', cn: '抓单秒人', short: '抓单',
      need: { engage: 1, burst: 1, mobi: 1 }, w: { engage: 2, burst: 2.2, mobi: 1.6 }, prio: 6, sig: { engage: 1 },
      tip: '用视野和先手把落单的人秒掉，再滚雪球拿大龙。',
      strong: ['scale', 'poke'], weak: ['front', 'disengage'],
    },
    {
      k: 'split', cn: '边路分带', short: '分带',
      need: { split: 1, wave: 1 }, w: { split: 3, wave: 1.2 }, prio: 5, sig: { split: 1 },
      tip: '一条边路单带牵扯，剩下四个人清线守塔，逼对面做两难选择。',
      strong: ['scale'], weak: ['engage', 'pick'],
    },
    {
      k: 'siege', cn: '速推压制', short: '速推',
      need: { early: 2, wave: 1 }, w: { early: 3, wave: 1.6 }, prio: 6, sig: { early: 2 },
      tip: '前 15 分钟靠线权和塔皮堆经济，用节奏把对手拖死。',
      strong: ['scale'], weak: ['front', 'engage'],
    },
    {
      k: 'scale', cn: '后期双核', short: '后期',
      need: { scale: 2, front: 1 }, w: { scale: 3, front: 1.3 }, prio: 8, sig: { scale: 2 },
      tip: '三件套之后正面无敌，但前期必须不崩、资源不能放太多。',
      strong: [], weak: ['early', 'siege', 'pick'],
    },
    {
      k: 'wombo', cn: 'AOE 连招', short: '连招',
      need: { engage: 1, cc: 1, burst: 1 }, w: { engage: 2.4, cc: 2, burst: 1.6 }, prio: 7, sig: { engage: 1, cc: 1 },
      tip: '一套大范围控制加爆发直接打掉整条血线，站位一聚团就出事。',
      strong: ['front', 'dive'], weak: ['poke', 'disengage'],
    },
    {
      k: 'disengage', cn: '反手拆团', short: '反手',
      need: { util: 1, heal: 1, cc: 1 }, w: { util: 2.6, heal: 1.8, cc: 1.2 }, prio: 4, sig: { util: 1 },
      tip: '不主动开团，靠解控、减伤、治疗把对面的第一波全部卸掉。',
      strong: ['dive', 'pick', 'wombo'], weak: ['poke', 'split'],
    },
  ];
  const ARCH_BY_K = {};
  ARCH.forEach((a) => { ARCH_BY_K[a.k] = a; });

  // ===== 2. 双人组合（下路为主）=====
  // 'A|B': [强度(0-10), 风格, 中文名]
  const DUOS = {
    'Xayah|Rakan': [10, 'allin', 'Xia Luo'],
    'Lucian|Milio': [9, 'allin', 'Lu Mi'],
    'Ezreal|Karma': [9, 'poke', 'EZ Karma'],
    'Yunara|Lulu': [9, 'scale', 'Yun Lu'],
    'Caitlyn|Lux': [9, 'siege', 'Cait Lux'],
    'Jinx|Lulu': [9, 'scale', 'Jinx Lulu'],
    'Zeri|Lulu': [9, 'scale', 'Zeri Lulu'],
    'Zeri|Yuumi': [9, 'scale', 'Zeri Yuumi'],
    'KogMaw|Lulu': [9, 'scale', 'Kog Lulu'],
    'Kalista|Renata': [9, 'allin', 'Kalista Renata'],
    'Nilah|Taric': [9, 'allin', 'Nilah Taric'],
    'Lucian|Nami': [8, 'allin', 'Lu Na'],
    'Caitlyn|Morgana': [8, 'catch', 'Cait Morgana'],
    'Draven|Leona': [8, 'allin', 'Draven Leona'],
    'Jhin|Nautilus': [8, 'catch', 'Jhin Naut'],
    'Varus|Rakan': [8, 'catch', 'Varus Rakan'],
    'Ashe|Seraphine': [8, 'poke', 'Ashe Seraphine'],
    'Kaisa|Nautilus': [8, 'allin', 'Kaisa Naut'],
    'Samira|Rell': [8, 'allin', 'Samira Rell'],
    'Draven|Nautilus': [8, 'allin', 'Draven Naut'],
    'Aphelios|Thresh': [8, 'catch', 'Aphelios Thresh'],
    'Sivir|Karma': [8, 'poke', 'Sivir Karma'],
    'Smolder|Milio': [8, 'scale', 'Smolder Milio'],
    'Vayne|Lulu': [8, 'scale', 'Vayne Lulu'],
    'Twitch|Lulu': [8, 'scale', 'Twitch Lulu'],
    'Jinx|Thresh': [8, 'catch', 'Jinx Thresh'],
    'Aphelios|Milio': [8, 'scale', 'Aphelios Milio'],
    'Xayah|Milio': [8, 'allin', 'Xayah Milio'],
    'Lucian|Braum': [7, 'allin', 'Lucian Braum'],
    'Kaisa|Rakan': [7, 'dive', 'Kaisa Rakan'],
    'Varus|Karma': [7, 'poke', 'Varus Karma'],
    'Ezreal|Yuumi': [7, 'poke', 'EZ Yuumi'],
    'Sivir|Janna': [7, 'safe', 'Sivir Janna'],
    'Tristana|Rakan': [7, 'allin', 'Trist Rakan'],
    'Corki|Karma': [7, 'poke', 'Corki Karma'],
    'Jhin|Karma': [7, 'poke', 'Jhin Karma'],
    'Smolder|Nami': [7, 'scale', 'Smolder Nami'],
    'Ashe|Karma': [7, 'poke', 'Ashe Karma'],
  };

  // ===== 3. 跨位协同（体系组合件）=====
  const PAIRS = {
    'Orianna|Malphite': [9, 'wombo', 'Ori Malph'],
    'Orianna|Amumu': [8, 'wombo', 'Ori Amumu'],
    'Orianna|JarvanIV': [8, 'wombo', 'Ori J4'],
    'Orianna|Rakan': [8, 'wombo', 'Ori Rakan'],
    'Malphite|Yasuo': [8, 'wombo', 'Malph Yasuo'],
    'Galio|Camille': [9, 'wombo', 'Galio Camille'],
    'Galio|Nocturne': [8, 'wombo', 'Galio Noct'],
    'Sejuani|Taliyah': [8, 'wombo', 'Sej Taliyah'],
    'Sejuani|Yasuo': [7, 'wombo', 'Sej Yasuo'],
    'Amumu|MissFortune': [7, 'wombo', 'Amumu MF'],
    'MonkeyKing|Orianna': [7, 'wombo', 'Wu Ori'],
    'Vi|Ahri': [8, 'pick', 'Vi Ahri'],
    'Nidalee|Renekton': [7, 'early', 'Nid Renekton'],
    'JarvanIV|Galio': [7, 'wombo', 'J4 Galio'],
    'Poppy|Yasuo': [7, 'wombo', 'Poppy Yasuo'],
    'Shen|Twitch': [7, 'protect', 'Shen Twitch'],
    'Shen|Katarina': [6, 'protect', 'Shen Kata'],
    'Taric|MasterYi': [7, 'protect', 'Taric Yi'],
    'Zilean|Karthus': [7, 'protect', 'Zilean Karthus'],
    'Karma|Ezreal': [9, 'poke', 'Karma EZ'],
    'Lulu|Jinx': [9, 'scale', 'Lulu Jinx'],
    'Milio|Lucian': [9, 'allin', 'Milio Lucian'],
    'Rakan|Xayah': [10, 'allin', 'Rakan Xayah'],
    'Renata|Kalista': [9, 'allin', 'Renata Kalista'],
    'Lulu|Zeri': [9, 'scale', 'Lulu Zeri'],
    'Seraphine|Ashe': [8, 'poke', 'Seraphine Ashe'],
    'Braum|Lucian': [7, 'allin', 'Braum Lucian'],
    'Thresh|Aphelios': [8, 'catch', 'Thresh Aphelios'],
    'Nautilus|Jhin': [8, 'catch', 'Naut Jhin'],
    'Nami|Lucian': [8, 'allin', 'Nami Lucian'],
  };

  // ===== 4. 英雄克制（a 强于 b）=====
  // [a, b, 强度(1-6), 原因]
  const COUNTERS = [
    // 塞拉斯偷大招机制：对面有塞拉斯，牛头这类「大招即价值」的英雄会送强度
    ['Sylas', 'Alistar', 6, '偷不屈意志，解控加免伤，牛头最核心的开团价值反过来打自己'],
    ['Sylas', 'Malphite', 6, '偷不可阻挡的整队击飞，正面团战直接翻盘'],
    ['Sylas', 'Amumu', 6, '偷大范围缠绕，团战控链反打'],
    ['Sylas', 'Rell', 5, '偷大范围击飞加眩晕'],
    ['Sylas', 'Leona', 5, '偷日蚀与大招的控场，配合自身突进'],
    ['Sylas', 'Nautilus', 5, '偷深海冲击的击晕链'],
    ['Sylas', 'Sejuani', 5, '偷极寒之链的团控'],
    ['Sylas', 'Lulu', 5, '偷变羊与狂野生长，反打和保护全吃满'],
    ['Sylas', 'Janna', 5, '偷季风把自家阵型吹乱，反手开团'],
    ['Sylas', 'Ornn', 5, '偷元素之怒的远距离开团'],
    ['Sylas', 'Gnar', 4, '偷咆哮把人拍墙'],
    ['Sylas', 'Maokai', 4, '偷自然之握的群体定身'],
    ['Sylas', 'Kennen', 5, '偷雷霆风暴的 AOE 眩晕'],
    ['Sylas', 'Zilean', 5, '偷时光倒流救自己人'],
    ['Sylas', 'Taric', 4, '偷宇宙光辉的无敌'],
    ['Sylas', 'Galio', 4, '偷英雄登场远程支援'],
    ['Sylas', 'Shen', 4, '偷并肩作战护盾'],
    ['Sylas', 'Braum', 4, '偷冰川裂隙的大范围减速'],
    ['Sylas', 'Zac', 4, '偷弹力冲击的团控'],
    ['Sylas', 'MonkeyKing', 4, '偷旋风棍群体击飞'],
    ['Sylas', 'Karthus', 4, '偷安魂曲收残血'],
    ['Sylas', 'Rakan', 4, '偷盛大登场'],
    ['Sylas', 'AurelionSol', 4, '偷星火漫天'],
    // 位移克星
    ['Poppy', 'Yasuo', 5, 'W 站定，亚索位移全被断，连 E 都过不来'],
    ['Poppy', 'Yone', 5, '断 E 与连招，前排一挡就废'],
    ['Poppy', 'Akali', 4, '断突进和烟雾弹位移'],
    ['Poppy', 'Riven', 4, '断 Q3 与 E，抓突进'],
    ['Poppy', 'Camille', 4, '钩索被站定直接断'],
    ['Poppy', 'LeeSin', 4, '断二段 Q 与摸眼'],
    ['Poppy', 'Viego', 4, '断突进，逼正面打'],
    ['Poppy', 'Irelia', 4, '断 Q 冲刺'],
    ['Poppy', 'KSante', 3, '断位移'],
    ['Poppy', 'Ezreal', 3, '断 E 位移，压走位'],
    // 反开团/解控
    ['Janna', 'Leona', 5, '大招吹散开团，EQ 打断进场'],
    ['Janna', 'Alistar', 5, '把牛头的进场全部吹走'],
    ['Janna', 'Nautilus', 4, '打断进场，拉走人'],
    ['Janna', 'Rell', 4, '断开团，反手拉扯'],
    ['Janna', 'Rakan', 4, '拆洛的进场'],
    ['Janna', 'Amumu', 4, '木木进场被吹散'],
    ['Janna', 'JarvanIV', 3, '断 EQ'],
    ['Janna', 'Vi', 3, '断突进和留人'],
    ['Morgana', 'Leona', 5, '黑盾直接免疫整套控链接'],
    ['Morgana', 'Nautilus', 4, '黑盾废掉深海冲击'],
    ['Morgana', 'Thresh', 4, '黑盾挡钩'],
    ['Morgana', 'Blitzcrank', 4, '黑盾挡钩'],
    ['Morgana', 'Sejuani', 4, '黑盾挡极寒之链'],
    ['Morgana', 'Rell', 4, '黑盾挡开团'],
    ['Morgana', 'Rakan', 3, '挡进场控制'],
    ['Milio', 'Leona', 3, '净化解控拉开距离'],
    ['Milio', 'Nautilus', 3, '解控反打'],
    ['Milio', 'Amumu', 2, '解控拖过控制链'],
    ['Braum', 'Ezreal', 4, '举盾吃掉主要 Poke 伤害'],
    ['Braum', 'Varus', 3, '挡 Q 与大招'],
    ['Braum', 'Ashe', 3, '挡大招'],
    ['Braum', 'Caitlyn', 3, '挡子弹'],
    ['Braum', 'Jinx', 3, '挡火箭'],
    ['Braum', 'Lucian', 3, '挡弹道爆发'],
    ['Yasuo', 'Ezreal', 3, '风墙吃掉主要输出'],
    ['Yasuo', 'Varus', 3, '风墙挡 Q 与大招'],
    ['Yasuo', 'Ashe', 3, '风墙挡大招'],
    ['Yasuo', 'Caitlyn', 3, '风墙挡弹道'],
    ['Yasuo', 'Lux', 3, '风墙挡全部伤害'],
    ['Yasuo', 'Xerath', 3, '风墙挡炮'],
    ['Yasuo', 'Hwei', 3, '风墙挡主要输出'],
    ['Yasuo', 'Seraphine', 3, '风墙挡连招'],
    // 破坦
    ['Trundle', 'Ornn', 4, 'R 偷双抗，Q 咬攻击，正面啃得动'],
    ['Trundle', 'Malphite', 4, 'R 偷护甲，石头人废一半'],
    ['Trundle', 'Sion', 4, 'R 偷抗性，砍肉极快'],
    ['Trundle', 'Chogath', 4, '越肉越好吃'],
    ['Trundle', 'Sejuani', 3, '偷抗性破前排'],
    ['Trundle', 'Zac', 3, '偷抗性，肉也咬穿'],
    ['Vayne', 'Ornn', 4, '真实伤害无视护甲'],
    ['Vayne', 'Malphite', 4, '三环打穿石头人'],
    ['Vayne', 'Sion', 4, '真伤砍肉'],
    ['Vayne', 'Chogath', 4, '真伤不吃血量'],
    ['Vayne', 'Zac', 4, '切肉神器'],
    ['Vayne', 'Sejuani', 3, '真伤破前排'],
    ['KogMaw', 'Ornn', 4, '百分比伤害融化前排'],
    ['KogMaw', 'Malphite', 4, '打得动纯护甲坦克'],
    ['KogMaw', 'Sion', 4, '血量越多越好打'],
    ['KogMaw', 'Chogath', 4, '百分比切坦'],
    ['Gwen', 'Ornn', 4, '真实伤害加减伤，前排克星'],
    ['Gwen', 'Malphite', 4, '无视护甲'],
    ['Gwen', 'Sion', 3, '切坦极强'],
    ['Gwen', 'DrMundo', 3, '百分比真伤'],
    ['Fiora', 'Sion', 4, '剑姬打肉是本命'],
    ['Fiora', 'Ornn', 3, '真实伤害打前排'],
    ['Fiora', 'Malphite', 3, '决斗压制'],
    ['Camille', 'Ornn', 3, '二段 Q 真伤'],
    ['Camille', 'Sion', 3, '切坦强'],
    ['Camille', 'Jinx', 3, '切后排锁定'],
    ['Camille', 'Ashe', 3, '锁死无位移 ADC'],
    ['Camille', 'Varus', 3, '锁人切后排'],
    // 反刺客
    ['Zilean', 'Zed', 4, 'R 直接复活，刺客白给'],
    ['Zilean', 'Akali', 4, '复活让刺杀失效'],
    ['Zilean', 'Katarina', 4, '复活加减速'],
    ['Zilean', 'Talon', 4, '复活反打'],
    ['Zilean', 'Rengar', 4, '复活吃掉一波爆发'],
    ['Zilean', 'Khazix', 3, '复活反打'],
    ['Zilean', 'Fizz', 3, '复活解爆发'],
    ['Zilean', 'Leblanc', 3, '复活反打'],
    ['Zilean', 'Evelynn', 3, '复活拆刺杀'],
    ['Taric', 'Zed', 4, 'R 无敌扛过爆发'],
    ['Taric', 'Talon', 4, '团战无敌'],
    ['Taric', 'Katarina', 4, '无敌反打'],
    ['Taric', 'Rengar', 4, '无敌化解'],
    ['Taric', 'Akali', 3, '无敌扛刺'],
    ['Taric', 'Fizz', 3, '无敌拆爆发'],
    ['Malzahar', 'Zed', 4, '被动护盾加大招压制'],
    ['Malzahar', 'Akali', 4, '压制直接锁死'],
    ['Malzahar', 'Katarina', 4, '压制打断大招'],
    ['Malzahar', 'Talon', 4, '压制反打'],
    ['Malzahar', 'Fizz', 4, '压制让鱼人无法秀'],
    ['Malzahar', 'Qiyana', 4, '压制抓单'],
    ['Malzahar', 'Leblanc', 3, '压制链'],
    ['Lissandra', 'Zed', 3, '自我锁定躲爆发'],
    ['Lissandra', 'Akali', 3, '大招锁人'],
    ['Lissandra', 'Katarina', 3, 'W 与大招控住'],
    ['Lissandra', 'Talon', 3, '锁死突进'],
    ['Lissandra', 'Yasuo', 3, '大招锁'],
    ['Vex', 'Yasuo', 4, '被动与大招对突进有额外惩罚'],
    ['Vex', 'Yone', 4, '突进越多越强'],
    ['Vex', 'Akali', 4, '恐惧断连招'],
    ['Vex', 'Irelia', 4, '反突进'],
    ['Vex', 'Riven', 3, '反冲阵'],
    ['Vex', 'Kaisa', 3, '大招锁突进'],
    ['Vex', 'Zeri', 3, '恐惧拆机动'],
    ['Anivia', 'Riven', 3, '墙与眩晕断突进'],
    ['Anivia', 'Akali', 3, '冰墙锁走位'],
    ['Anivia', 'Yasuo', 3, '墙与输出'],
    ['Anivia', 'Camille', 3, '断钩索'],
    // 功能克制
    ['Soraka', 'Ezreal', 3, '把 Poke 血量全奶回来'],
    ['Soraka', 'Varus', 3, '续航吃掉消耗'],
    ['Soraka', 'Caitlyn', 3, '奶住对线压制'],
    ['Soraka', 'Xerath', 3, '抵消消耗'],
    ['Soraka', 'Jayce', 3, '扛住炮击'],
    ['Soraka', 'Ziggs', 3, '奶住推塔'],
    ['Seraphine', 'Xerath', 3, '护盾与治疗吃消耗'],
    ['Seraphine', 'Ziggs', 3, '盾奶抵消'],
    ['Seraphine', 'Ezreal', 2, '续航拉扯'],
    ['Janna', 'Ezreal', 3, '盾与吹散 Poke 节奏'],
    ['Janna', 'Karma', 2, '拆消耗体系'],
    // 对线压制
    ['Draven', 'Kaisa', 3, '对线压穿'],
    ['Draven', 'Vayne', 3, '前期经济碾压'],
    ['Draven', 'Jinx', 3, '压线滚雪球'],
    ['Draven', 'Sivir', 3, '压线'],
    ['Caitlyn', 'Kaisa', 3, '射程压制'],
    ['Caitlyn', 'Vayne', 3, '对线打爆'],
    ['Caitlyn', 'Samira', 4, '射程克制短手'],
    ['Caitlyn', 'Nilah', 3, '射程拉开'],
    ['Leona', 'Ashe', 3, '无位移 ADC 的死敌'],
    ['Leona', 'Jinx', 3, '一套秒杀'],
    ['Leona', 'Kaisa', 3, '压力拉满'],
    ['Leona', 'Varus', 3, '对线强开'],
    ['Nautilus', 'Ashe', 3, '钩中即死'],
    ['Nautilus', 'Jinx', 3, '锁死站桩'],
    ['Nautilus', 'KogMaw', 3, '无位移大嘴'],
    ['Blitzcrank', 'Ashe', 3, '钩中必死'],
    ['Blitzcrank', 'Jinx', 3, '压制无位移'],
    ['Blitzcrank', 'KogMaw', 3, '钩中秒杀'],
    // 上路对线
    ['Renekton', 'Riven', 3, '怒气换血压制'],
    ['Renekton', 'Akali', 3, '前期越塔强杀'],
    ['Renekton', 'Yasuo', 3, '暴君压线'],
    ['Renekton', 'KSante', 3, '前期压穿'],
    ['Renekton', 'Irelia', 2, '线权压制'],
    ['Jayce', 'Sion', 3, '炮击压线'],
    ['Jayce', 'Chogath', 3, '远程压制'],
    ['Jayce', 'Ornn', 3, '消耗压制'],
    ['Jayce', 'Malphite', 3, '拉线压制'],
    ['Jax', 'Tryndamere', 3, '格挡反击'],
    ['Jax', 'MasterYi', 3, '单挑无敌'],
    ['Jax', 'Vayne', 3, '反击风暴'],
    // 爆发刺客对无位移法师
    ['Zed', 'Syndra', 3, '切无位移法师'],
    ['Zed', 'Orianna', 3, '切后排'],
    ['Zed', 'Viktor', 3, '切无位移'],
    ['Zed', 'Xerath', 3, '切站桩'],
    ['Zed', 'Ziggs', 3, '切后排'],
    ['Zed', 'Hwei', 3, '切法师'],
    ['Fizz', 'Syndra', 3, '切无位移法师'],
    ['Fizz', 'Orianna', 3, '贴身爆发'],
    ['Fizz', 'Viktor', 3, '切后排'],
    ['Fizz', 'Xerath', 3, '贴脸'],
    ['Akali', 'Syndra', 3, '切法师'],
    ['Akali', 'Orianna', 3, '切后排'],
    ['Akali', 'Viktor', 3, '切站桩'],
    ['Akali', 'Xerath', 3, '绕后'],
    ['Talon', 'Syndra', 3, '切法师'],
    ['Talon', 'Orianna', 3, '切后排'],
    ['Talon', 'Viktor', 3, '爆发切'],
    ['Qiyana', 'Orianna', 3, '切无位移'],
    ['Qiyana', 'Viktor', 3, '切法师'],
    ['Khazix', 'Ashe', 3, '孤立秒杀'],
    ['Khazix', 'Varus', 3, '切无位移'],
    ['Rengar', 'Jinx', 3, '绕后秒 ADC'],
    ['Rengar', 'KogMaw', 3, '切无位移大嘴'],
    ['Rengar', 'Ashe', 3, '秒杀'],
    // 其他机制（负值表示 a 被 b 克制）
    ['DrMundo', 'Vayne', -3, '被真实伤害吊打'],
    ['Sion', 'Vayne', -3, '血量越多越被切'],
    ['Ornn', 'KogMaw', -3, '被百分比融化'],
    ['Malphite', 'Vayne', -3, '护甲被真伤无视'],
  ];

  // ===== 5. 强势期 =====
  // 'early' 6 级前一套流；'mid' 两件套团战；'late' 三件套以上
  const SPIKE = {
    Renekton: 'early', Draven: 'early', Caitlyn: 'early', Lucian: 'early', Olaf: 'early',
    LeeSin: 'early', Elise: 'early', Nidalee: 'early', XinZhao: 'early', JarvanIV: 'early',
    Vi: 'early', Rell: 'early', Leona: 'early', Blitzcrank: 'early', Nautilus: 'early',
    Karma: 'early', Ashe: 'early', Varus: 'early', Jayce: 'early', Kled: 'early', Quinn: 'early',
    Akshan: 'early', RekSai: 'early', Talon: 'early', Pantheon: 'early', MissFortune: 'early',
    Braum: 'early',
    Lulu: 'mid', Milio: 'mid', Thresh: 'mid', Orianna: 'mid', Syndra: 'mid', Azir: 'mid',
    Ahri: 'mid', Sylas: 'mid', Akali: 'mid', Rakan: 'mid', Sejuani: 'mid', Gnar: 'mid',
    KSante: 'mid', Ornn: 'mid', Maokai: 'mid', Amumu: 'mid', Malphite: 'mid', Rumble: 'mid',
    Lissandra: 'mid', Vex: 'mid', Zoe: 'mid', Leblanc: 'mid', Qiyana: 'mid', Hwei: 'mid',
    Mel: 'mid', Locke: 'mid', Zaahen: 'mid', Ambessa: 'mid', Diana: 'mid',
    Kayle: 'late', Nasus: 'late', Veigar: 'late', Smolder: 'late', AurelionSol: 'late',
    KogMaw: 'late', Vayne: 'late', Jinx: 'late', Aphelios: 'late', Sivir: 'late', Zeri: 'late',
    Vladimir: 'late', Kassadin: 'late', Ryze: 'late', Gangplank: 'late', Twitch: 'late',
    Karthus: 'late', MasterYi: 'late', Belveth: 'late', Gwen: 'late', Fiora: 'late',
    Camille: 'late', DrMundo: 'late', Yasuo: 'late', Yone: 'late', Nilah: 'late',
    Yunara: 'late', Kaisa: 'late', Xayah: 'late', Tristana: 'late', Jax: 'late',
    Tryndamere: 'late', Kayn: 'late', Evelynn: 'mid', Fizz: 'mid', Zed: 'mid', Khazix: 'mid',
    Rengar: 'mid', Samira: 'mid', Viego: 'mid',
  };

  // 适合盲选（摇摆/难被针对）的英雄
  const BLIND = ['JarvanIV', 'Orianna', 'Rakan', 'Milio', 'Renekton', 'Gnar', 'KSante', 'Azir',
    'Sylas', 'Vi', 'Sejuani', 'Maokai', 'Karma', 'Lulu', 'Thresh', 'Nautilus', 'Rell', 'Braum',
    'Xayah', 'Ezreal', 'Varus', 'Corki', 'Jayce', 'Zaahen', 'Ambessa', 'Yone', 'Aurora', 'Mel',
    'Locke', 'Hwei', 'Ahri', 'Poppy', 'Gwen', 'Camille', 'Jax'];

  // 针对敌方特征的最优解英雄（AI 见招拆招用）
  const ANSWER = {
    dive: ['Janna', 'Poppy', 'Lulu', 'Braum', 'Taric', 'Morgana', 'Milio', 'Zilean', 'Rakan'],
    engage: ['Janna', 'Morgana', 'Braum', 'Poppy', 'Xayah', 'Thresh', 'Milio'],
    poke: ['Soraka', 'Sona', 'Yuumi', 'Seraphine', 'Nami', 'Karma', 'Sivir', 'Janna', 'Milio', 'Fiora',
      'Malphite', 'Amumu', 'Leona', 'Nautilus', 'Vi'],
    tank: ['Vayne', 'KogMaw', 'Gwen', 'Trundle', 'Fiora', 'Camille', 'Belveth', 'Kaisa', 'Varus'],
    fullAd: ['Malphite', 'Rammus', 'Shen', 'KSante', 'Ornn', 'Taric'],
    fullAp: ['Galio', 'Kassadin', 'Shen', 'Soraka', 'Rammus'],
    split: ['Camille', 'Jax', 'Fiora', 'KSante', 'Gwen', 'Shen', 'Malphite', 'Poppy'],
    wombo: ['Janna', 'Morgana', 'Xayah', 'Braum', 'Poppy', 'Milio'],
    sylas: ['Jinx', 'Caitlyn', 'Ezreal', 'Vayne', 'Zeri', 'KogMaw'],
    hypercarry: ['Leona', 'Nautilus', 'Blitzcrank', 'Rell', 'Vi', 'Camille', 'Rengar', 'Khazix'],
  };

  // ===== 工具函数 =====
  function key(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
  const DUO_BY_KEY = {};
  Object.keys(DUOS).forEach((k) => { const [a, b] = k.split('|'); DUO_BY_KEY[key(a, b)] = DUOS[k]; });
  const PAIR_BY_KEY = {};
  Object.keys(PAIRS).forEach((k) => { const [a, b] = k.split('|'); PAIR_BY_KEY[key(a, b)] = PAIRS[k]; });

  function duo(a, b) { return DUO_BY_KEY[key(a, b)] || null; }
  function pair(a, b) { return PAIR_BY_KEY[key(a, b)] || null; }

  // 协同分：下路组合权重更高
  function synergy(a, b) {
    const d = duo(a, b);
    if (d) return d[0];
    const p = pair(a, b);
    return p ? p[0] * 0.9 : 0;
  }

  // a 对 b 的克制强度（正数表示 a 占优）
  const C_MAP = {};
  COUNTERS.forEach(([a, b, v]) => {
    C_MAP[a + '>' + b] = v;
    if (!C_MAP[b + '>' + a]) C_MAP[b + '>' + a] = -v;
  });
  function counter(a, b) {
    if (!a || !b || a === b) return 0;
    return C_MAP[a + '>' + b] || 0;
  }
  function counterWhy(a, b) {
    for (const [x, y, v, why] of COUNTERS) {
      if (x === a && y === b) return { v, why };
      if (x === b && y === a) return { v: -v, why };
    }
    return null;
  }

  function spikeOf(id, tags) {
    if (SPIKE[id]) return SPIKE[id];
    const t = tags || [];
    if (t.indexOf('scale') >= 0) return 'late';
    if (t.indexOf('early') >= 0) return 'early';
    return 'mid';
  }

  window.META = {
    ARCH, ARCH_BY_K, DUOS, PAIRS, COUNTERS, SPIKE, BLIND, ANSWER,
    duo, pair, synergy, counter, counterWhy, spikeOf, key,
  };
})();
