// 比赛规则：BP 顺序、赛制、无畏征召（全局 BP）
// 标准职业 BP：每队 5 ban / 5 pick，共 20 手
// 蓝->红: 1B 1R 2B 2R 3B 3R | 蓝选1 红选2 蓝选2 红选1 | 红ban 蓝ban 红ban 蓝ban | 红选1 蓝选2 红选1
window.RULES = {
  // 单手顺序（标准职业赛制）
  STEPS: (() => {
    const s = [];
    // 第一轮 ban：蓝红交替 3 轮
    for (let i = 0; i < 3; i++) { s.push({ side: 'blue', type: 'ban' }); s.push({ side: 'red', type: 'ban' }); }
    // 第一轮 pick：蓝1 红2 蓝2 红1
    s.push({ side: 'blue', type: 'pick' });
    s.push({ side: 'red', type: 'pick' }); s.push({ side: 'red', type: 'pick' });
    s.push({ side: 'blue', type: 'pick' }); s.push({ side: 'blue', type: 'pick' });
    s.push({ side: 'red', type: 'pick' });
    // 第二轮 ban：红蓝交替 2 轮
    for (let i = 0; i < 2; i++) { s.push({ side: 'red', type: 'ban' }); s.push({ side: 'blue', type: 'ban' }); }
    // 第二轮 pick：红1 蓝2 红1
    s.push({ side: 'red', type: 'pick' });
    s.push({ side: 'blue', type: 'pick' }); s.push({ side: 'blue', type: 'pick' });
    s.push({ side: 'red', type: 'pick' });
    return s;
  })(),

  SERIES: { BO3: 2, BO5: 3 },

  ROLES: ['top', 'jg', 'mid', 'bot', 'sup'],
  ROLE_CN: { top: '上单', jg: '打野', mid: '中单', bot: '下路', sup: '辅助' },
  ROLE_EN: { top: 'TOP', jg: 'JUG', mid: 'MID', bot: 'BOT', sup: 'SUP' },
  SIDE_CN: { blue: '蓝色方', red: '红色方' },

  // 默认设置
  DEFAULTS: {
    mode: 'BO5',
    fearless: true,      // 无畏征召：选过的英雄后续小局不可再选
    banCarry: false,     // 硬核模式：禁用也继承到后续小局
    timer: 30,           // 每手思考时间（秒），0 = 不限时
    sideSelect: 'loser', // 败者选边 / 'alternate' 交替 / 'manual' 手动
    blind: false,        // 盲选（最后一手不显示对面）
  },
};

window.roleCn = (r) => window.RULES.ROLE_CN[r] || r;
