// 003 · 病害风险规则表
//
// 预警从"管理员手填"升级为"按天气自动算"。
// 规则全部来自知识库里每条病害的 `occurrence`（发病条件）原文，
// note 字段存原文摘录，可追溯、不凭空捏造。
module.exports = {
  id: '003',
  name: '病害风险规则表',
  async up({ run, all, dialect }) {
    const isMySQL = dialect === 'mysql'
    await run(isMySQL
      ? `CREATE TABLE IF NOT EXISTS risk_rules (
          id INT AUTO_INCREMENT PRIMARY KEY,
          disease_id INT,
          disease_name VARCHAR(120),
          temp_min DOUBLE,
          temp_max DOUBLE,
          humidity_min DOUBLE,
          humidity_max DOUBLE,
          rain_min DOUBLE,
          rain_max DOUBLE,
          months VARCHAR(40),
          note TEXT,
          enabled INT DEFAULT 1
        ) DEFAULT CHARSET = utf8mb4`
      : `CREATE TABLE IF NOT EXISTS risk_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          disease_id INTEGER,
          disease_name TEXT,
          temp_min REAL,
          temp_max REAL,
          humidity_min REAL,
          humidity_max REAL,
          rain_min REAL,
          rain_max REAL,
          months TEXT,
          note TEXT,
          enabled INTEGER DEFAULT 1
        )`)

    // 规则来源：每条病害的"发病条件"原文（已核实记录）
    const SEED = [
      { name: '番茄晚疫病', t: [16, 24], h: [90, null], r: [0, null], months: '', note: '低温高湿（18-22℃，相对湿度>90%）' },
      { name: '稻瘟病', t: [22, 29], h: [85, null], r: [1, null], months: '6,7,8,9', note: '6-9月流行，多雨多雾多露' },
      { name: '小麦锈病', t: [9, 25], h: [80, null], r: [0, null], months: '', note: '早春9-15℃、叶锈秆锈15-25℃' },
      { name: '水稻纹枯病', t: [25, 32], h: [95, null], r: [0, null], months: '', note: '25-32℃、湿度>95%' },
      { name: '黄瓜霜霉病', t: [16, 24], h: [85, null], r: [0, null], months: '', note: '16-24℃、相对湿度>85%' },
      { name: '梨锈病', t: [12, 25], h: [80, null], r: [2, null], months: '4,5', note: '4-5月多雨潮湿' },
      { name: '葡萄霜霉病', t: [20, 25], h: [95, null], r: [0, null], months: '6,7,8,9', note: '20-25℃、湿度>95%，6-9月高峰' },
      { name: '小麦赤霉病', t: [15, 30], h: [85, null], r: [0.5, null], months: '4,5', note: '抽穗扬花期连续阴雨、>15℃、湿度>85%' },
      { name: '玉米大斑病', t: [18, 27], h: [85, null], r: [0, null], months: '', note: '温暖20-25℃、高湿多雨结露' },
      { name: '辣椒疫病', t: [25, 35], h: [80, null], r: [15, null], months: '', note: '>25℃、暴雨积水后3-5天暴发' },
      { name: '马铃薯晚疫病', t: [15, 23], h: [90, null], r: [0, null], months: '', note: '16-22℃、相对湿度>90%' },
      { name: '苹果轮纹病', t: [20, 30], h: [85, null], r: [0, null], months: '', note: '>20℃、湿度>85%' },
      { name: '菜豆炭疽病', t: [20, 25], h: [95, null], r: [0, null], months: '', note: '20-25℃、湿度95%以上' },
      { name: '芍药炭疽病', t: [25, 30], h: [90, null], r: [0, null], months: '', note: '25-30℃、湿度90%以上' },
      { name: '柑橘溃疡病', t: [20, 32], h: [80, null], r: [0, null], months: '4,5,6,7,8,9,10', note: '4-10月高温高湿，新梢幼果期易感' },
      { name: '月季白粉病', t: [15, 25], h: [60, 85], r: [0, 3], months: '3,4,5,9,10', note: '15-25℃、温暖干燥与高湿交替' },
      { name: '棉铃虫', t: [22, 35], h: [30, 70], r: [0, 5], months: '6,7,8', note: '6-8月危害高峰，干旱年份更重' },
      { name: '蚜虫', t: [15, 28], h: [30, 70], r: [0, 3], months: '', note: '春秋繁殖高峰，温暖干燥有利' }
    ]

    let added = 0
    for (const s of SEED) {
      const rows = await all('SELECT id FROM diseases WHERE name = ?', [s.name])
      if (!rows.length) continue          // 知识库里没有这条病害就跳过，不硬塞
      const exists = await all('SELECT id FROM risk_rules WHERE disease_name = ?', [s.name])
      if (exists.length) continue
      await run(
        `INSERT INTO risk_rules (disease_id, disease_name, temp_min, temp_max, humidity_min, humidity_max, rain_min, rain_max, months, note, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [rows[0].id, s.name, s.t[0], s.t[1], s.h[0], s.h[1], s.r[0], s.r[1], s.months, s.note]
      )
      added++
    }
    console.log('   风险规则写入 ' + added + ' 条')
  }
}
