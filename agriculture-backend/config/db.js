// ==================== 数据库驱动开关 ====================
// DB_DRIVER=mysql  → 使用 MySQL（config/db-mysql.js）
// 不配或 DB_DRIVER=sqlite → 继续用 SQLite（原逻辑，完全不动）
if (String(process.env.DB_DRIVER || 'sqlite').toLowerCase() === 'mysql') {
  module.exports = require('./db-mysql')
  return
}

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../agriculture.db');

// sqlite3 单例连接
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('❌ 数据库连接失败:', err.message);
  else console.log('✅ 数据库连接成功 (sqlite3)');
});

// 启用 WAL 模式提升并发性能
db.run('PRAGMA journal_mode=WAL');
db.run('PRAGMA foreign_keys=ON');

// Promise 包装工具函数
const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });

const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });

async function initDB() {
  await initTables();
  console.log('✅ 数据库表初始化完成');
  return db;
}

// 启动时清理知识库里的垃圾记录（以前随机逻辑写入的、不是病害名的条目）
async function cleanupJunkDiseases() {
  try {
    const rows = await dbAll('SELECT id, name, verify_source FROM diseases')
    // 垃圾记录特征：以前随机匹配时把症状/描述片段当成了病害名
    const JUNK_WORDS = /(发病|易发|天气|条件下|危害|症状|病斑|防治|建议|用药|稀释|喷雾|侵染|浸染|后期|初期|严重时|生长季|分泌|诱发|导致|造成|连作|多雨|偏施|及时|果期|花期|苗期|成株期|收获|皮孔|梭形|梭条|感病|利于|易感|中度|重度|轻度)/
    // 虫害名字常常不含「虫」字（稻飞虱/草地贪夜蛾/飞蝗/蓟马…），这里补全虫类字
    const PEST_CHARS = /(病|虫|害|蝗|螟|虱|蛾|蚜|螨|蝽|蛉|蚧|蝇|蛆|蚁|蜂|象|蝶|螺|鼠|蓟马|蜗牛)/
    const junk = rows.filter((r) => {
      const n = String(r.name || '').trim()
      if (!n) return true
      // 来自官方名录 / 人工录入的，一律不动（防止把正确数据当垃圾删掉）
      if (/农业农村部|NY\/T|农药登记/.test(String(r.verify_source || ''))) return false
      // 只要不是超长句子、也不含"发病/症状/防治"这类描述词，就当正常病害名保留
      if (n.length > 12) return true
      if (n.length > 5 && JUNK_WORDS.test(n)) return true
      return false
    })
    for (const r of junk) await dbRun('DELETE FROM diseases WHERE id = ?', [r.id])
    if (junk.length) console.log('🧹 知识库已清理 ' + junk.length + ' 条无效记录：' + junk.map((r) => r.name).join('、'))
    else console.log('🧹 知识库检查完毕，无无效记录')
  } catch (e) {
    console.error('清理知识库失败:', e.message)
  }
}

// 清理历史表里完全重复的记录（旧代码前后端各存一次造成的）
async function cleanupDuplicateHistories() {
  try {
    const res = await dbRun(`DELETE FROM histories WHERE id NOT IN (
      SELECT MIN(id) FROM histories GROUP BY disease_name, image_url, create_time
    )`)
    const n = res && res.changes ? res.changes : 0
    if (n) console.log('🧹 历史记录已去重：删除 ' + n + ' 条重复记录')
  } catch (e) {
    console.error('历史记录去重失败:', e.message)
  }
}

async function initTables() {
  // 用户对 AI 诊断的纠错记录：既保留 AI 的原判断，也保留用户给出的正确答案
  await dbRun(`CREATE TABLE IF NOT EXISTS corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    history_id INTEGER,
    user_id INTEGER,
    ai_name TEXT,
    correct_name TEXT,
    plant_name TEXT,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 给旧库补上历史记录缺失的详情字段（已存在则跳过）
  // 登录日志：记录每次登录尝试（成功/失败、来源 IP、时间），用于排查“谁在猜密码”
  await dbRun(`CREATE TABLE IF NOT EXISTS login_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    user_id INTEGER,
    ip TEXT,
    success INTEGER DEFAULT 0,
    reason TEXT,
    source TEXT,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 用户意见反馈：以前只打日志，重启/轮转就丢了
  await dbRun(`CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT,
    content TEXT NOT NULL,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 用户表补充管理员标记（后台是给管理员用的，普通注册用户不应能进）
  const userCols = await dbAll('PRAGMA table_info(users)')
  if (!userCols.some((c) => c.name === 'is_admin')) {
    await dbRun('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0')
    console.log('🔧 users 表新增字段：is_admin')
  }
  if (!userCols.some((c) => c.name === 'nickname')) {
    await dbRun('ALTER TABLE users ADD COLUMN nickname TEXT')
    console.log('🔧 users 表新增字段：nickname')
  }
  if (!userCols.some((c) => c.name === 'avatar')) {
    await dbRun('ALTER TABLE users ADD COLUMN avatar TEXT')
    console.log('🔧 users 表新增字段：avatar')
  }
  if (!userCols.some((c) => c.name === 'pwd_changed_at')) {
    await dbRun('ALTER TABLE users ADD COLUMN pwd_changed_at DATETIME')
    console.log('🔧 users 表新增字段：pwd_changed_at（用于提示“仍在用初始密码”）')
  }

  const histCols = await dbAll('PRAGMA table_info(histories)')
  const hasCol = (n) => histCols.some((c) => c.name === n)
  for (const col of ['plant_name', 'image', 'ai_source', 'evidence', 'corrected']) {
    if (!hasCol(col)) {
      await dbRun('ALTER TABLE histories ADD COLUMN ' + col + ' TEXT')
      console.log('🔧 histories 表新增字段：' + col)
    }
  }

  await dbRun(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS histories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    disease_name TEXT NOT NULL,
    image_url TEXT,
    confidence REAL DEFAULT 0,
    level INTEGER DEFAULT 2,
    level_text TEXT DEFAULT '中度危害',
    symptom TEXT,
    spread TEXT,
    occurrence TEXT,
    medicines TEXT,
    suggestions TEXT,
    prevention TEXT,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    disease_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    image TEXT,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS diseases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT DEFAULT '',
    category TEXT DEFAULT '',
    level INTEGER DEFAULT 2,
    level_text TEXT DEFAULT '中度危害',
    image TEXT,
    host TEXT,
    period TEXT,
    symptom TEXT,
    cause TEXT,
    spread TEXT,
    occurrence TEXT,
    medicines TEXT,
    suggestions TEXT,
    prevention TEXT
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    level TEXT NOT NULL,
    level_text TEXT NOT NULL,
    location TEXT NOT NULL,
    area TEXT NOT NULL,
    suggestion TEXT,
    is_new INTEGER DEFAULT 0,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 常用查询字段建立索引（列表按用户和时间查，数据量大了差别明显）
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_histories_user ON histories(user_id, create_time DESC)',
    'CREATE INDEX IF NOT EXISTS idx_collections_user ON collections(user_id, create_time DESC)',
    'CREATE INDEX IF NOT EXISTS idx_diseases_name ON diseases(name)',
    'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
    'CREATE INDEX IF NOT EXISTS idx_corrections_history ON corrections(history_id)',
    'CREATE INDEX IF NOT EXISTS idx_login_logs ON login_logs(username, create_time DESC)'
  ]
  for (const sql of indexes) {
    try { await dbRun(sql) } catch (e) { console.error('建索引失败:', e.message) }
  }

  // 病害名唯一索引：防止同名病害被重复写入（AI 自动收录时并发可能产生重复）
  try {
    const dups = await dbAll('SELECT name, COUNT(*) c FROM diseases GROUP BY name HAVING c > 1')
    for (const d of dups) {
      const rows = await dbAll('SELECT id FROM diseases WHERE name = ? ORDER BY id', [d.name])
      for (const r of rows.slice(1)) await dbRun('DELETE FROM diseases WHERE id = ?', [r.id])
    }
    if (dups.length) console.log('🧹 合并了 ' + dups.length + ' 组同名病害')
    await dbRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_diseases_name_unique ON diseases(name)')
  } catch (e) {
    console.error('病害名唯一索引创建失败:', e.message)
  }

  // 插入默认用户数据
  await initDefaultUsers();
  // 插入默认病虫害数据
  await initDefaultDiseases();
  // 老库补齐分类字段（早期数据只有 type，没有 category，导致百科筛选全空）
  await backfillDiseaseCategories();
  // 清理无效记录
  await cleanupJunkDiseases();
  // 历史记录去重
  await cleanupDuplicateHistories();
  // 插入默认预警数据
  await initDefaultWarnings();
}

async function initDefaultUsers() {
  const bcrypt = require('bcryptjs');
  const admin = await dbGet('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!admin) {
    // 初始密码可用 .env 的 ADMIN_INIT_PASSWORD 指定；未设置时用 123456 并提示尽快修改
    const initPwd = process.env.ADMIN_INIT_PASSWORD || '123456'
    const hashedPassword = await bcrypt.hash(initPwd, 10)
    await dbRun('INSERT INTO users (username, password, is_admin) VALUES (?, ?, 1)', ['admin', hashedPassword])
    console.log('✅ 默认管理员账号已创建 (admin / ' + (process.env.ADMIN_INIT_PASSWORD ? '见 ADMIN_INIT_PASSWORD' : '123456，请尽快修改') + ')')
  } else {
    // 已有 admin 账号的旧库，补上管理员标记
    await dbRun('UPDATE users SET is_admin = 1 WHERE username = ?', ['admin']);
    console.log('admin 账号已存在（已确保具备管理员权限）');
  }
}

async function initDefaultDiseases() {
  const existing = await dbGet('SELECT COUNT(*) as cnt FROM diseases');
  if (existing && existing.cnt > 0) {
    console.log('默认病虫害数据已存在，跳过初始化');
    return;
  }

  const defaults = [
    {
      name: '柑橘溃疡病',
      type: '细菌性病害',
      category: '细菌性病害',
      level: 3,
      level_text: '重度危害',
      image: '/uploads/disease-1779518034379-497275823.jpg',
      symptom: '叶片上出现黄色油渍状小斑点，逐渐扩大成圆形或不规则形病斑，病斑中央凹陷呈火山口状，周围有黄色晕圈。果实上的病斑与叶片相似，但更凸起，严重时导致果实脱落。',
      cause: '由柑橘黄单胞菌引起，病菌在病叶、病枝和病果上越冬，通过风雨、昆虫传播。',
      spread: '主要通过风雨、昆虫、农事操作传播，病菌可从叶片气孔、皮孔和伤口侵入。',
      occurrence: '每年4-10月为高发期，高温高湿环境下发病严重，新梢抽发期和幼果期最易感染。',
      medicines: JSON.stringify([{ name: '春雷霉素', usage: '稀释800-1000倍液喷雾' }, { name: '氢氧化铜', usage: '稀释500-700倍液喷雾' }, { name: '噻唑锌', usage: '稀释600-800倍液喷雾' }]),
      suggestions: JSON.stringify(['加强果园管理，及时清除病叶、病枝和病果，集中烧毁', '合理修剪，保持果园通风透光，降低湿度', '在新梢抽发期和幼果期，每隔7-10天喷药一次']),
      prevention: JSON.stringify(['种植无病苗木，严格检疫', '冬季清园，全园喷施石硫合剂', '加强肥水管理，增强树势'])
    },
    {
      name: '稻飞虱',
      type: '虫害',
      category: '虫害',
      level: 2,
      level_text: '中度危害',
      image: '',
      symptom: '成虫和若虫群集在稻株基部吸食汁液，导致稻株枯黄、倒伏，严重时造成"虱烧"现象，整片稻田枯死。',
      cause: '由褐飞虱、白背飞虱等引起，成虫具有迁飞性，随气流远距离传播。',
      spread: '主要通过气流迁飞传播，也能通过秧苗调运传播，夏季从南方虫源地迁入。',
      occurrence: '每年6-9月为高发期，多雨高湿环境有利于繁殖，短日照条件促进成虫迁飞。',
      medicines: JSON.stringify([{ name: '吡蚜酮', usage: '稀释1500-2000倍液喷雾' }, { name: '噻虫嗪', usage: '稀释2000-3000倍液喷雾' }]),
      suggestions: JSON.stringify(['安装杀虫灯诱杀成虫', '保护和利用蜘蛛、黑肩绿盲蝽等天敌', '合理施肥，避免偏施氮肥']),
      prevention: JSON.stringify(['选用抗虫品种', '合理布局，避免混栽', '加强田间管理，适时晒田'])
    },
    {
      name: '番茄晚疫病',
      type: '真菌性病害',
      category: '真菌性病害',
      level: 2,
      level_text: '中度危害',
      image: '',
      symptom: '叶片上出现水渍状暗绿色病斑，湿度大时叶背出现白色霉层。茎部出现黑褐色条斑，果实出现暗绿色至褐色水渍状病斑。',
      cause: '由致病疫霉菌引起，病菌在病残体或马铃薯块茎中越冬，通过风雨传播。',
      spread: '主要通过风雨传播，孢子囊可通过气流远距离传播，也可通过灌溉水传播。',
      occurrence: '低温高湿（温度18-22℃，相对湿度>90%）条件下易发病，每年4-6月和9-11月为高发期。',
      medicines: JSON.stringify([{ name: '甲霜灵锰锌', usage: '稀释600-800倍液喷雾' }, { name: '霜霉威盐酸盐', usage: '稀释500-700倍液喷雾' }]),
      suggestions: JSON.stringify(['及时整枝打杈，改善通风透光条件', '发现病株及时拔除并销毁', '发病初期及时喷药防治']),
      prevention: JSON.stringify(['选用抗病品种', '合理轮作，避免连作', '控制田间湿度，采用高畦栽培'])
    },
    {
      name: '稻瘟病', type: '真菌性病害', category: '真菌性病害', level: 3, level_text: '重度危害', image: '',
      symptom: '苗期发病形成梭形或不规则形病斑，灰绿色至黄褐色。成株期叶瘟出现典型梭形病斑，中央灰白色，边缘黄褐色，外围有黄色晕圈。节瘟导致茎节变黑腐烂，穗瘟造成白穗。',
      cause: '由稻瘟病菌引起，病菌以菌丝体和分生孢子在病稻草和病谷上越冬。',
      spread: '分生孢子借风雨传播，适宜温度24-28℃、相对湿度>90%时迅速蔓延。',
      occurrence: '每年6-9月为流行期，多雨、多雾、多露天气有利于发病，偏施氮肥加重病害。',
      medicines: JSON.stringify([{ name: '三环唑', usage: '稀释500-700倍液喷雾' }, { name: '稻瘟灵', usage: '稀释800-1000倍液喷雾' }]),
      suggestions: JSON.stringify(['合理施肥，避免偏施氮肥', '浅水勤灌，适时晒田', '发现发病中心立即喷药封锁']),
      prevention: JSON.stringify(['选用抗病品种', '种子消毒处理', '处理病稻草，减少菌源'])
    },
    {
      name: '小麦锈病', type: '真菌性病害', category: '真菌性病害', level: 2, level_text: '中度危害', image: '',
      symptom: '叶片和茎秆上出现铁锈色疱状突起（夏孢子堆），表皮破裂后散出锈褐色粉末。严重时叶片枯黄，植株矮小，籽粒不饱满。',
      cause: '由锈菌引起，分条锈、叶锈和秆锈三种，病菌随风远距离传播。',
      spread: '夏孢子借气流远距离传播，从叶片气孔侵入。',
      occurrence: '条锈病在早春低温（9-15℃）时发生，叶锈和秆锈在较高温（15-25℃）时流行。',
      medicines: JSON.stringify([{ name: '戊唑醇', usage: '稀释1500-2000倍液喷雾' }, { name: '吡唑醚菌酯', usage: '稀释2000-3000倍液喷雾' }]),
      suggestions: JSON.stringify(['发病初期及时喷药', '合理密植，增加通风透光', '雨后及时排水']),
      prevention: JSON.stringify(['种植抗锈品种', '适时播种，避免过早过晚', '种子药剂处理'])
    },
    {
      name: '玉米螟', type: '虫害', category: '虫害', level: 2, level_text: '中度危害', image: '',
      symptom: '幼虫钻入玉米茎秆、雌穗和雄穗取食，造成茎秆折断、雌穗发育不良。心叶被蛀食后展开出现整齐的排孔。',
      cause: '由亚洲玉米螟引起，以老熟幼虫在玉米秸秆和穗轴中越冬。',
      spread: '成虫夜间活动，有趋光性，卵块产于叶片背面。幼虫孵化后先群集后分散钻蛀。',
      occurrence: '每年发生2-4代，6-8月为幼虫危害盛期。',
      medicines: JSON.stringify([{ name: '氯虫苯甲酰胺', usage: '稀释2000-3000倍液喷雾' }, { name: '苏云金杆菌(Bt)', usage: '稀释500-800倍液喷雾' }]),
      suggestions: JSON.stringify(['在心叶末期施药防治', '释放赤眼蜂进行生物防治', '处理越冬秸秆，减少虫源']),
      prevention: JSON.stringify(['选用抗虫品种', '合理轮作', '安装频振式杀虫灯诱杀成虫'])
    },
    {
      name: '棉铃虫', type: '虫害', category: '虫害', level: 3, level_text: '重度危害', image: '',
      symptom: '幼虫蛀食棉花的嫩叶、花蕾和青铃，造成落蕾落铃和烂铃。一头幼虫可为害10-20个蕾铃。',
      cause: '由棉铃虫引起，以蛹在土壤中越冬。',
      spread: '成虫迁飞能力强，可远距离扩散。卵散产于嫩叶正面和嫩蕾苞叶上。',
      occurrence: '每年发生3-5代，6-8月为危害高峰，干旱年份发生更重。',
      medicines: JSON.stringify([{ name: '甲维盐', usage: '稀释1500-2000倍液喷雾' }, { name: '茚虫威', usage: '稀释2000-3000倍液喷雾' }]),
      suggestions: JSON.stringify(['及时整枝打杈，减少虫卵', '保护利用天敌如赤眼蜂、草蛉', '轮换用药，延缓抗药性']),
      prevention: JSON.stringify(['冬耕灌水消灭越冬蛹', '种植诱集作物', '选用转基因抗虫棉'])
    },
    {
      name: '水稻纹枯病', type: '真菌性病害', category: '真菌性病害', level: 2, level_text: '中度危害', image: '',
      symptom: '叶鞘上出现水渍状暗绿色病斑，后扩大成不规则云纹状斑块，边缘褐色，中央灰白色。严重时叶片枯死，茎秆软化倒伏。',
      cause: '由立枯丝核菌引起，病菌以菌核在土壤中越冬。',
      spread: '菌核漂浮水面随灌溉水传播，菌丝在稻株间蔓延传播。',
      occurrence: '高温高湿（温度25-32℃、湿度>95%）条件下易流行，分蘖盛期至抽穗期为高发期。',
      medicines: JSON.stringify([{ name: '井冈霉素', usage: '稀释500-700倍液喷雾' }, { name: '己唑醇', usage: '稀释1500-2000倍液喷雾' }]),
      suggestions: JSON.stringify(['合理密植，改善通风条件', '浅水勤灌，适时晒田', '发病初期喷药防治']),
      prevention: JSON.stringify(['打捞菌核，减少菌源', '合理施肥，增施磷钾肥', '选用抗病品种'])
    },
    {
      name: '苹果腐烂病', type: '真菌性病害', category: '真菌性病害', level: 3, level_text: '重度危害', image: '',
      symptom: '枝干皮层出现红褐色水渍状病斑，稍隆起，组织松软腐烂，有酒糟味。后期病部干缩凹陷，表面产生黑色小粒点。严重时枝干枯死，整株死亡。',
      cause: '由苹果黑腐皮壳菌引起，病菌以菌丝体、分生孢子器和子囊壳在病皮中越冬。',
      spread: '分生孢子和子囊孢子借风雨和昆虫传播，从伤口侵入。',
      occurrence: '每年3-5月和9-11月为发病高峰，冻害、修剪过重、树势衰弱时发病重。',
      medicines: JSON.stringify([{ name: '戊唑醇', usage: '稀释800-1000倍液涂抹病疤' }, { name: '甲基硫菌灵', usage: '稀释300-500倍液涂抹' }]),
      suggestions: JSON.stringify(['及时刮除病斑并涂药保护', '剪除病枯枝并集中烧毁', '增施有机肥，增强树势']),
      prevention: JSON.stringify(['涂白树干防冻防日灼', '合理负载，避免树势衰弱', '修剪后涂药保护伤口'])
    },
    {
      name: '黄瓜霜霉病', type: '真菌性病害', category: '真菌性病害', level: 2, level_text: '中度危害', image: '',
      symptom: '叶片正面出现黄色至黄褐色多角形病斑，湿度大时叶背产生紫灰色霉层。严重时叶片枯黄卷缩，整株枯死。',
      cause: '由古巴假霜霉菌引起，病菌通过气流远距离传播。',
      spread: '孢子囊借风雨和气流传播，从叶片气孔侵入。',
      occurrence: '温度16-24℃、相对湿度>85%时易流行，保护地栽培周年均可发生。',
      medicines: JSON.stringify([{ name: '烯酰吗啉', usage: '稀释1500-2000倍液喷雾' }, { name: '霜脲·锰锌', usage: '稀释600-800倍液喷雾' }]),
      suggestions: JSON.stringify(['加强通风降湿', '及时清除病叶', '发病初期交替用药']),
      prevention: JSON.stringify(['选用抗病品种', '合理密植，高畦栽培', '膜下滴灌降低湿度'])
    },
    {
      name: '蚜虫', type: '虫害', category: '虫害', level: 1, level_text: '轻度危害', image: '',
      symptom: '成虫和若虫群集在嫩叶背面、嫩梢、花蕾和幼果上吸食汁液，导致叶片卷曲、发黄、畸形。分泌蜜露诱发煤污病，还可传播多种植物病毒。',
      cause: '由棉蚜、桃蚜、麦蚜等多种蚜虫引起，以卵或成虫在寄主上越冬。',
      spread: '有翅蚜借风力迁飞扩散，无翅蚜在植株间爬行传播，蚂蚁可帮助蚜虫扩散。',
      occurrence: '春秋两季为繁殖高峰，温暖干燥天气利于发生，每年可繁殖10-30代。',
      medicines: JSON.stringify([{ name: '吡虫啉', usage: '稀释2000-3000倍液喷雾' }, { name: '啶虫脒', usage: '稀释1500-2000倍液喷雾' }]),
      suggestions: JSON.stringify(['保护和利用瓢虫、草蛉等天敌', '黄板诱杀有翅蚜', '及时清除田间杂草']),
      prevention: JSON.stringify(['合理施肥，避免偏施氮肥', '银灰色地膜驱避蚜虫', '种植前清除残株'])
    },
    {
      name: '烟草花叶病毒病', type: '病毒性病害', category: '病毒性病害', level: 2, level_text: '中度危害', image: '',
      symptom: '叶片出现黄绿相间的花叶斑驳，叶面皱缩不平，植株矮化。严重时叶片畸形呈带状或线状，果实出现坏死斑或畸形。',
      cause: '由烟草花叶病毒(TMV)引起，病毒在病残体和种子中越冬，通过汁液接触传播。',
      spread: '主要通过农事操作（整枝、打杈等）汁液接触传播，也可通过种子和土壤传播。',
      occurrence: '苗期至成株期均可发病，高温干旱条件下症状加重。',
      medicines: JSON.stringify([{ name: '氨基寡糖素', usage: '稀释500-800倍液喷雾' }, { name: '盐酸吗啉胍', usage: '稀释600-800倍液喷雾' }]),
      suggestions: JSON.stringify(['操作前用肥皂水洗手消毒', '发现病株立即拔除销毁', '防治蚜虫等传毒媒介']),
      prevention: JSON.stringify(['选用无病种子', '种子用10%磷酸三钠浸泡消毒', '实行轮作，避免连作'])
    },
    {
      name: '梨二叉蚜', type: '虫害', category: '虫害', level: 2, level_text: '中度危害', image: '',
      symptom: '成虫和若虫群集在梨树嫩叶、嫩梢和花蕾上刺吸汁液。受害叶片向正面纵向卷曲成筒状，严重时叶片变黑枯死脱落。新梢生长受阻，树势衰弱，果实品质下降。蚜虫分泌蜜露诱发煤污病。',
      cause: '由梨二叉蚜引起，以卵在梨树芽腋、枝杈裂缝处越冬。',
      spread: '春季梨树萌芽时越冬卵孵化，有翅蚜可随风迁飞扩散到其他梨树。',
      occurrence: '每年春季3-5月为高发期，梨树萌芽至开花期受害最重。温暖干旱天气利于发生，每年可繁殖10余代。',
      medicines: JSON.stringify([{ name: '吡虫啉', usage: '稀释2000-3000倍液喷雾' }, { name: '啶虫脒', usage: '稀释1500-2000倍液喷雾' }, { name: '高效氯氟氰菊酯', usage: '稀释1500-2000倍液喷雾' }]),
      suggestions: JSON.stringify(['春季梨树萌芽前喷施石硫合剂杀灭越冬卵', '保护和利用瓢虫、草蛉、食蚜蝇等天敌', '发生初期及时摘除卷叶并喷药防治', '悬挂黄板诱杀有翅蚜']),
      prevention: JSON.stringify(['冬季刮除老翘皮，消灭越冬虫卵', '合理修剪，保持树冠通风透光', '避免偏施氮肥，增强树体抗性', '萌芽前全园喷施5波美度石硫合剂'])
    },
    {
      name: '梨锈病', type: '真菌性病害', category: '真菌性病害', level: 2, level_text: '中度危害', image: '',
      symptom: '叶片正面出现橙黄色至橘红色圆形病斑，表面密生橙黄色小粒点（性孢子器），后期病斑背面长出灰褐色毛状物（锈孢子器）。严重时叶片枯焦早落，幼果畸形。',
      cause: '由梨胶锈菌引起，病菌需在梨树和桧柏等转主寄主间交替完成生活史。',
      spread: '春季桧柏上的冬孢子角遇雨萌发产生担孢子，借风传播到梨树上侵染。',
      occurrence: '每年4-5月为发病高峰，多雨潮湿天气利于流行。梨园周围5公里内有桧柏等转主寄主时发病严重。',
      medicines: JSON.stringify([{ name: '三唑酮', usage: '稀释1000-1500倍液喷雾' }, { name: '戊唑醇', usage: '稀释2000-3000倍液喷雾' }]),
      suggestions: JSON.stringify(['梨树展叶期和落花后各喷一次保护性杀菌剂', '清除梨园周围5公里内的桧柏等转主寄主', '春雨前对桧柏喷施波尔多液抑制冬孢子萌发']),
      prevention: JSON.stringify(['新建梨园远离桧柏栽植区', '选用抗病品种', '合理施肥，增强树势'])
    },
    {
      name: '桃小食心虫', type: '虫害', category: '虫害', level: 3, level_text: '重度危害', image: '',
      symptom: '幼虫蛀入果实后，在果内串食果肉并排粪于果内，形成"豆沙馅"状。蛀孔周围果皮凹陷变褐，早期受害果实畸形脱落，后期受害果实失去商品价值。',
      cause: '由桃小食心虫引起，以老熟幼虫在土壤中结茧越冬。',
      spread: '成虫夜间活动，卵散产于果实萼洼处。幼虫孵化后很快蛀入果内。',
      occurrence: '每年发生1-3代，6-8月为幼虫蛀果盛期。降雨早、雨量多的年份发生重。',
      medicines: JSON.stringify([{ name: '氯虫苯甲酰胺', usage: '稀释2000-3000倍液喷雾' }, { name: '高效氯氟氰菊酯', usage: '稀释1500-2000倍液喷雾' }]),
      suggestions: JSON.stringify(['地面喷药杀死出土幼虫', '及时摘除和捡拾虫果并深埋', '成虫发生期悬挂性诱剂诱杀', '果实套袋防止蛀果']),
      prevention: JSON.stringify(['冬季深翻树盘冻死越冬幼虫', '果实套袋栽培', '合理轮作'])
    },
    {
      name: '葡萄霜霉病', type: '真菌性病害', category: '真菌性病害', level: 2, level_text: '中度危害', image: '',
      symptom: '叶片正面出现黄色至黄褐色多角形病斑，湿度大时叶背产生白色霜状霉层。严重时病叶焦枯早落，嫩梢、幼果也可受害，果粒变硬僵化。',
      cause: '由葡萄生单轴霉菌引起，病菌以卵孢子在病残体中越冬。',
      spread: '孢子囊借风雨传播，从叶片气孔侵入。',
      occurrence: '温度20-25℃、相对湿度>95%时易流行。每年6-9月为发病高峰，多雨年份发病重。',
      medicines: JSON.stringify([{ name: '烯酰吗啉', usage: '稀释1500-2000倍液喷雾' }, { name: '霜脲·锰锌', usage: '稀释600-800倍液喷雾' }]),
      suggestions: JSON.stringify(['加强夏季修剪，改善通风透光', '及时摘除病叶病果并销毁', '雨季来临前喷施保护性杀菌剂']),
      prevention: JSON.stringify(['选用抗病品种', '合理密植，高架栽培', '清园处理病残体', '雨后及时排水降湿'])
    },
    {
      name: '红蜘蛛', type: '虫害', category: '虫害', level: 2, level_text: '中度危害', image: '',
      symptom: '成螨和若螨群集在叶片背面刺吸汁液，受害叶片出现黄白色小斑点，严重时叶片失绿变灰白、焦枯脱落。在叶片和枝梢间结网，影响光合作用。',
      cause: '由柑橘全爪螨、二斑叶螨等多种叶螨引起，以成螨或卵在枝干裂缝、落叶中越冬。',
      spread: '可借风雨、农事操作和苗木调运传播，自身也能爬行扩散。',
      occurrence: '高温干旱季节（25-30℃）繁殖最快，每年可发生10-20代。春夏季为危害高峰。',
      medicines: JSON.stringify([{ name: '阿维菌素', usage: '稀释2000-3000倍液喷雾' }, { name: '哒螨灵', usage: '稀释1500-2000倍液喷雾' }, { name: '螺螨酯', usage: '稀释2000-3000倍液喷雾' }]),
      suggestions: JSON.stringify(['保护和利用捕食螨、瓢虫等天敌', '发生初期及时喷药，重点喷叶背', '交替使用不同杀螨剂，延缓抗药性', '干旱季节及时灌水增加田间湿度']),
      prevention: JSON.stringify(['冬季清园，刮除老翘皮', '合理施肥，增强树势', '人工释放捕食螨进行生物防治'])
    },
    {
      name: '稻纵卷叶螟', type: '虫害', category: '虫害', level: 3, level_text: '重度危害', image: '',
      symptom: '幼虫吐丝将水稻叶片纵卷成筒状，在其中取食叶肉，形成白色条斑。受害叶片枯白卷曲，严重时全田一片枯白，剑叶受害导致千粒重下降。',
      cause: '由稻纵卷叶螟引起，成虫具有远距离迁飞习性，随季风从南方虫源地迁入。',
      spread: '成虫迁飞能力强，产卵于叶片正反面。幼虫孵化后即爬至叶尖吐丝卷叶。',
      occurrence: '每年6-9月为危害盛期，多雨高湿、适温（22-28℃）条件下发生重。偏施氮肥、叶色浓绿的田块受害更重。',
      medicines: JSON.stringify([{ name: '氯虫苯甲酰胺', usage: '稀释2000-3000倍液喷雾' }, { name: '阿维菌素', usage: '稀释1500-2000倍液喷雾' }]),
      suggestions: JSON.stringify(['在幼虫2-3龄期施药效果最好', '合理施肥，避免偏施氮肥使叶片过于嫩绿', '安装频振式杀虫灯诱杀成虫']),
      prevention: JSON.stringify(['选用抗虫品种', '合理密植', '保护利用赤眼蜂等天敌'])
    },
    {
      name: '小麦赤霉病', type: '真菌性病害', category: '真菌性病害', level: 3, level_text: '重度危害', image: '',
      symptom: '穗部发病初期在小穗颖壳上出现水渍状淡褐色病斑，后扩展至整个小穗，湿度大时颖壳合缝处和小穗基部产生粉红色霉层。籽粒干瘪皱缩，产生呕吐毒素等真菌毒素，严重威胁人畜食品安全。',
      cause: '由禾谷镰刀菌等多种镰刀菌引起，病菌在病残体上越冬。',
      spread: '子囊孢子借风雨传播，在小麦扬花期从花药侵入。',
      occurrence: '小麦抽穗扬花期遇连续阴雨天气（温度>15℃，相对湿度>85%）极易暴发流行。每年4-5月为发病关键期。',
      medicines: JSON.stringify([{ name: '戊唑醇', usage: '稀释1500-2000倍液喷雾' }, { name: '氰烯菌酯', usage: '稀释1500-2000倍液喷雾' }, { name: '多菌灵', usage: '稀释500-800倍液喷雾' }]),
      suggestions: JSON.stringify(['扬花期是防治关键期，见花就打药', '遇连续阴雨要抢晴喷药', '收获后及时晾晒，防止毒素积累']),
      prevention: JSON.stringify(['选用抗病品种', '合理轮作，深翻灭茬', '开沟排水降低田间湿度'])
    },
    {
      name: '玉米大斑病', type: '真菌性病害', category: '真菌性病害', level: 2, level_text: '中度危害', image: '',
      symptom: '叶片上出现大型梭形或长条形病斑，初期水渍状灰绿色，后变灰褐色至黄褐色，严重时病斑连片导致叶片枯死，整株呈"烘烤"状。',
      cause: '由玉米大斑病菌引起，病菌以菌丝体和分生孢子在病残体上越冬。',
      spread: '分生孢子借风雨传播，从叶片气孔侵入。',
      occurrence: '温度20-25℃、高湿条件下易流行。玉米拔节至抽雄期为感病关键期，连作地块发病重。',
      medicines: JSON.stringify([{ name: '吡唑醚菌酯', usage: '稀释1500-2000倍液喷雾' }, { name: '苯醚甲环唑', usage: '稀释1500-2000倍液喷雾' }]),
      suggestions: JSON.stringify(['发病初期及时喷药保护功能叶片', '合理密植，增加田间通风', '收获后及时清除田间病残体']),
      prevention: JSON.stringify(['选用抗病品种', '实行2年以上轮作', '增施有机肥，合理配施磷钾肥'])
    },
    {
      name: '辣椒疫病', type: '真菌性病害', category: '真菌性病害', level: 3, level_text: '重度危害', image: '',
      symptom: '茎基部出现水渍状暗绿色病斑，后变褐色缢缩腐烂，地上部萎蔫枯死。叶片产生暗绿色水渍状圆形病斑，果实出现暗绿色水渍状病斑后变褐色软腐。',
      cause: '由辣椒疫霉菌引起，病菌以卵孢子在土壤中越冬。',
      spread: '孢子囊借雨水飞溅和灌溉水传播，从伤口侵入。',
      occurrence: '高温高湿（温度>25℃，田间积水）条件下发病迅猛，夏季暴雨后3-5天可暴发成灾。',
      medicines: JSON.stringify([{ name: '烯酰吗啉', usage: '稀释1000-1500倍液喷雾' }, { name: '甲霜灵锰锌', usage: '稀释500-600倍液灌根' }]),
      suggestions: JSON.stringify(['发现病株立即拔除并用药剂灌根处理病穴', '雨后及时排除田间积水', '发病初期灌根与叶面喷雾相结合']),
      prevention: JSON.stringify(['高畦栽培，避免田间积水', '合理轮作，避免连作', '选用抗病砧木嫁接'])
    },
    {
      name: '菜青虫', type: '虫害', category: '虫害', level: 1, level_text: '轻度危害', image: '',
      symptom: '幼虫咬食叶片形成孔洞和缺刻，严重时仅留叶脉。幼虫排出的粪便污染菜心，影响蔬菜品质和商品价值。',
      cause: '由菜粉蝶（菜青虫）引起，以蛹在菜园附近的枯枝落叶、墙壁缝隙等处越冬。',
      spread: '成虫白天活动，卵散产于叶片背面。幼虫孵化后即在叶片上取食。',
      occurrence: '春季和秋季为发生高峰，每年可发生5-8代。十字花科蔬菜连作地块发生重。',
      medicines: JSON.stringify([{ name: '苏云金杆菌(Bt)', usage: '稀释500-800倍液喷雾' }, { name: '高效氯氰菊酯', usage: '稀释1500-2000倍液喷雾' }]),
      suggestions: JSON.stringify(['低龄幼虫期施药效果最佳', '人工捕捉高龄幼虫和蛹', '收获后及时清除田间残株落叶']),
      prevention: JSON.stringify(['安装防虫网阻隔成虫产卵', '合理轮作，避免连作十字花科蔬菜', '保护利用寄生蜂等天敌'])
    },
    {
      name: '马铃薯晚疫病', type: '真菌性病害', category: '真菌性病害', level: 3, level_text: '重度危害', image: '',
      symptom: '叶片边缘出现水渍状暗绿色病斑，湿度大时叶背出现白色霉层。茎部出现褐色条斑，块茎受害后出现褐色至紫褐色不规则病斑，切开可见褐色坏死组织。',
      cause: '由致病疫霉菌引起，病菌在病薯中越冬。',
      spread: '孢子囊借风雨传播，也可通过种薯调运远距离传播。',
      occurrence: '温度16-22℃、相对湿度>90%时易流行。花期前后为感病关键期，多雨多雾天气发病重。',
      medicines: JSON.stringify([{ name: '霜脲·锰锌', usage: '稀释500-700倍液喷雾' }, { name: '氟吡菌胺·霜霉威', usage: '稀释600-800倍液喷雾' }]),
      suggestions: JSON.stringify(['发病前喷施保护剂预防', '发现病株立即拔除深埋', '收获前割除地上茎叶减少薯块感染']),
      prevention: JSON.stringify(['选用无病种薯', '合理轮作', '高垄栽培，雨后及时排水'])
    },
    {
      name: '大豆食心虫', type: '虫害', category: '虫害', level: 2, level_text: '中度危害', image: '',
      symptom: '幼虫蛀入大豆荚内取食豆粒，将豆粒咬成缺刻或全部吃光。豆荚内充满虫粪，严重影响大豆产量和品质。',
      cause: '由大豆食心虫引起，以老熟幼虫在土壤中结茧越冬。',
      spread: '成虫傍晚活动，卵散产于嫩豆荚上。幼虫孵化后很快蛀入荚内。',
      occurrence: '每年发生1代，8月中下旬为成虫盛发期和产卵高峰期。',
      medicines: JSON.stringify([{ name: '高效氯氟氰菊酯', usage: '稀释1500-2000倍液喷雾' }, { name: '敌百虫', usage: '稀释800-1000倍液喷雾' }]),
      suggestions: JSON.stringify(['成虫盛发期喷药防治', '收获后及时脱粒晒干', '秋季深翻土壤消灭越冬幼虫']),
      prevention: JSON.stringify(['选用抗虫品种', '合理轮作', '远距离大面积连片种植可减轻危害'])
    },
    {
      name: '苹果轮纹病', type: '真菌性病害', category: '真菌性病害', level: 2, level_text: '中度危害', image: '',
      symptom: '枝干上出现以皮孔为中心的圆形病斑，呈红褐色瘤状突起，后期病斑边缘开裂呈马鞍形。果实受害后在近成熟期出现以皮孔为中心的褐色圆形轮纹病斑，迅速扩展导致果实腐烂。',
      cause: '由苹果轮纹病菌引起，病菌以菌丝体和分生孢子器在枝干病斑上越冬。',
      spread: '分生孢子借风雨传播，从皮孔和伤口侵入。',
      occurrence: '温暖多雨季节（温度>20℃，相对湿度>85%）利于发病。果实近成熟期为感病高峰。',
      medicines: JSON.stringify([{ name: '戊唑醇', usage: '稀释2000-3000倍液喷雾' }, { name: '甲基硫菌灵', usage: '稀释800-1000倍液喷雾' }]),
      suggestions: JSON.stringify(['果实套袋防止病菌侵染', '生长季刮除枝干病斑并涂药保护', '果实膨大期每隔15天喷一次保护性杀菌剂']),
      prevention: JSON.stringify(['加强栽培管理，增强树势', '合理修剪，改善通风透光', '冬季清园，减少越冬菌源'])
    },
    {
      name: '地老虎', type: '虫害', category: '虫害', level: 3, level_text: '重度危害', image: '',
      symptom: '幼虫夜间出土，将幼苗茎基部咬断拖入土中取食，造成缺苗断垄。3龄后幼虫食量暴增，一夜可咬断多株幼苗，对春播作物危害极大。',
      cause: '由小地老虎和黄地老虎引起，以老熟幼虫或蛹在土壤中越冬。',
      spread: '成虫有趋光性和趋化性（喜食糖醋液），卵散产于杂草和土块上。',
      occurrence: '春季4-5月为幼虫危害盛期，地势低洼、杂草多的田块发生重。',
      medicines: JSON.stringify([{ name: '毒死蜱', usage: '制成毒饵撒施或灌根' }, { name: '高效氯氰菊酯', usage: '稀释1500倍液地面喷雾' }]),
      suggestions: JSON.stringify(['清晨在断苗附近扒土人工捕捉幼虫', '用炒香的麦麸拌药制成毒饵傍晚撒施', '清除田间杂草减少产卵场所']),
      prevention: JSON.stringify(['秋冬季深翻土地冻死越冬虫体', '春季糖醋液诱杀成虫', '清洁田园，铲除杂草'])
    }
  ];

  for (const d of defaults) {
    await dbRun(
      `INSERT OR IGNORE INTO diseases (name, type, category, level, level_text, image, symptom, cause, spread, occurrence, medicines, suggestions, prevention)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.name, d.type, d.category, d.level, d.level_text, d.image, d.symptom, d.cause, d.spread, d.occurrence, d.medicines, d.suggestions, d.prevention]
    );
  }
  console.log('✅ 默认病虫害数据初始化完成');
}

// 老库早期只有 type，没有 category；补一次，百科的 4 个分类才不会全空。
// 只在 type 是已知分类时覆盖，AI 自动收录/人工纠正的标记保持不变。
async function backfillDiseaseCategories() {
  const types = ['细菌性病害', '真菌性病害', '病毒性病害', '虫害'];
  let changed = 0;
  for (const t of types) {
    const r = await dbRun(
      "UPDATE diseases SET category = ? WHERE type = ? AND (category IS NULL OR category = '' OR category <> ?)",
      [t, t, t]
    );
    changed += (r && r.changes) || 0;
  }
  if (changed) console.log('🧹 已补齐 ' + changed + ' 条病害的分类字段');
}

async function initDefaultWarnings() {
  const existing = await dbGet('SELECT COUNT(*) as cnt FROM warnings');
  if (existing && existing.cnt > 0) {
    console.log('默认预警数据已存在，跳过初始化');
    return;
  }

  const defaults = [
    {
      title: '柑橘溃疡病高发预警',
      level: 'high', level_text: '高风险',
      location: '江西省赣州市', area: '全市18个区县柑橘种植区',
      suggestion: '加强果园巡查，及时清除病叶病枝并集中烧毁；在新梢抽发期喷施噻唑锌或春雷霉素进行预防。',
      is_new: 1
    },
    {
      title: '稻飞虱迁飞预警',
      level: 'medium', level_text: '中风险',
      location: '江西省吉安市', area: '赣江沿岸水稻种植区',
      suggestion: '安装杀虫灯诱杀成虫；选用吡蚜酮、噻虫嗪等药剂进行喷雾防治。',
      is_new: 1
    },
    {
      title: '番茄晚疫病预警',
      level: 'low', level_text: '低风险',
      location: '广东省广州市', area: '城郊蔬菜种植基地',
      suggestion: '及时整枝打杈，改善通风透光条件；发病初期喷施甲霜灵锰锌或霜霉威盐酸盐。',
      is_new: 0
    }
  ];

  for (const w of defaults) {
    await dbRun(
      `INSERT INTO warnings (title, level, level_text, location, area, suggestion, is_new) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [w.title, w.level, w.level_text, w.location, w.area, w.suggestion, w.is_new]
    );
  }
  console.log('✅ 默认预警数据初始化完成');
}

// 安全解析 JSON 数组字段
function safeParseJSON(str) {
  if (!str || str.trim() === '') return [];
  if (Array.isArray(str)) return str;
  try {
    const result = JSON.parse(str);
    return Array.isArray(result) ? result : [];
  } catch {
    return str.trim().split('\n').filter(item => item.trim());
  }
}

// 优雅关闭
const gracefulShutdown = () => {
  db.close((err) => {
    if (err) console.error('关闭数据库失败:', err);
    else console.log('数据库已安全关闭');
    process.exit(0);
  });
};
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

module.exports = {
  initDB,
  getDB: () => db,
  dbRun,
  dbGet,
  dbAll,
  safeParseJSON,
  DB_PATH
}