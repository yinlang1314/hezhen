/**
 * MySQL 驱动适配层（DB_DRIVER=mysql 时启用）
 *
 * 目的：让 config/db.js 对外暴露的 dbRun / dbGet / dbAll 三个函数在 MySQL 下行为一致，
 *       业务路由（routes/*.js、controllers/*.js）一行都不用改。
 *
 * 与 SQLite 的差异都在这里抹平：
 *   - dbRun 返回 { changes, insertId }  ← SQLite 的 this.changes / this.lastID
 *   - DATETIME 返回字符串（dateStrings）← 和 SQLite 的行为一致
 *   - datetime('now','-N days') → DATE_SUB(NOW(), INTERVAL N DAY)
 *   - INSERT OR IGNORE → INSERT IGNORE
 */

const mysql = require('mysql2/promise')

const CFG = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'hezhen',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,          // DATETIME → 字符串，和 sqlite 返回一致
  timezone: 'local'
}

let pool = null
function getPool() {
  if (!pool) {
    pool = mysql.createPool(CFG)
    // 每个新连接都把会话时区设成 UTC：SQLite 的 datetime('now') 是 UTC，
    // 这样 NOW() / CURRENT_TIMESTAMP 与迁移过来的旧数据语义一致
    pool.pool.on('connection', (conn) => {
      conn.query("SET time_zone = '+00:00'")
    })
    console.log('✅ 数据库连接成功 (MySQL ' + CFG.host + ':' + CFG.port + '/' + CFG.database + ')')
  }
  return pool
}

// SQLite 写法 → MySQL 写法（只做确定安全的替换）
function dialect(sql) {
  return String(sql)
    // datetime('now') / datetime("now") / datetime('now','-15 minutes') / ('-1 day') 全兼容
    .replace(
      /datetime\(\s*["']now["']\s*(?:,\s*["']([+-]?)(\d+)\s*(days?|hours?|minutes?|seconds?)["']\s*)?\)/gi,
      (m, sign, n, unit) => {
        if (!n) return 'NOW()'
        const U = String(unit).toUpperCase().replace(/S$/, '')
        return (sign === '-' ? 'DATE_SUB' : 'DATE_ADD') + '(NOW(), INTERVAL ' + n + ' ' + U + ')'
      }
    )
    .replace(/\bINSERT\s+OR\s+IGNORE\b/gi, 'INSERT IGNORE')
    .replace(/\bINSERT\s+OR\s+REPLACE\b/gi, 'REPLACE')
    .replace(new RegExp('\\bdate\\(\\s*([a-z_.]+)\\s*\\)', 'gi'), 'DATE($1)')
}

const dbRun = async (sql, params = []) => {
  const [res] = await getPool().query(dialect(sql), params)
  const insertId = res.insertId || 0
  // lastID 是 sqlite3 的写法，业务代码里在用，这里保持兼容
  return { changes: res.affectedRows || 0, insertId, lastID: insertId }
}

const dbGet = async (sql, params = []) => {
  const [rows] = await getPool().query(dialect(sql), params)
  return (rows && rows[0]) || null
}

const dbAll = async (sql, params = []) => {
  const [rows] = await getPool().query(dialect(sql), params)
  return rows || []
}

// ==================== 建表（列与 SQLite 版本保持一致）====================
const TABLE_DDL = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_admin TINYINT DEFAULT 0,
    nickname VARCHAR(64),
    avatar VARCHAR(255),
    pwd_changed_at DATETIME
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS histories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    disease_name VARCHAR(191) NOT NULL,
    image_url VARCHAR(255),
    confidence DOUBLE DEFAULT 0,
    level INT DEFAULT 2,
    level_text VARCHAR(32) DEFAULT '中度危害',
    symptom MEDIUMTEXT,
    spread MEDIUMTEXT,
    occurrence MEDIUMTEXT,
    medicines MEDIUMTEXT,
    suggestions MEDIUMTEXT,
    prevention MEDIUMTEXT,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    plant_name VARCHAR(64),
    image VARCHAR(255),
    ai_source VARCHAR(128),
    evidence MEDIUMTEXT,
    corrected VARCHAR(8),
    INDEX idx_histories_user (user_id, create_time)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS collections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    disease_id INT NOT NULL,
    name VARCHAR(191) NOT NULL,
    type VARCHAR(64),
    image VARCHAR(255),
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_collections_user (user_id, create_time)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS diseases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(191) NOT NULL UNIQUE,
    type VARCHAR(64) DEFAULT '',
    category VARCHAR(64) DEFAULT '',
    level INT DEFAULT 2,
    level_text VARCHAR(32) DEFAULT '中度危害',
    image VARCHAR(255),
    host VARCHAR(64),
    period VARCHAR(64),
    symptom MEDIUMTEXT,
    cause MEDIUMTEXT,
    spread MEDIUMTEXT,
    occurrence MEDIUMTEXT,
    medicines MEDIUMTEXT,
    suggestions MEDIUMTEXT,
    prevention MEDIUMTEXT,
    verified TINYINT NOT NULL DEFAULT 1,
    verify_source VARCHAR(255),
    verify_date VARCHAR(16)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS warnings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(191) NOT NULL,
    level VARCHAR(32) NOT NULL,
    level_text VARCHAR(32) NOT NULL,
    location VARCHAR(128) NOT NULL,
    area VARCHAR(128) NOT NULL,
    suggestion MEDIUMTEXT,
    is_new TINYINT DEFAULT 0,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS corrections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    history_id INT,
    user_id INT,
    ai_name VARCHAR(191),
    correct_name VARCHAR(191),
    plant_name VARCHAR(64),
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_corrections_history (history_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS login_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64),
    user_id INT,
    ip VARCHAR(64),
    success TINYINT DEFAULT 0,
    reason VARCHAR(191),
    source VARCHAR(64),
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_login_logs (username, create_time)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS feedback (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    type VARCHAR(64),
    content MEDIUMTEXT NOT NULL,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
]

async function initDB() {
  const p = getPool()
  for (const ddl of TABLE_DDL) await p.query(ddl)
  console.log('✅ 数据库表初始化完成 (MySQL)')

  // 结构升级：基于 TABLE_DDL 之后，跑 migrations/ 里没执行过的迁移
  await require('../lib/migrate').runMigrations({ run: dbRun, all: dbAll, dialect: 'mysql' })
  return p
}

function safeParseJSON(str) {
  if (!str) return []
  if (Array.isArray(str)) return str
  try {
    const v = JSON.parse(str)
    return Array.isArray(v) ? v : []
  } catch (e) {
    return String(str).split(/\n|；|;/).map((x) => x.trim()).filter(Boolean)
  }
}

module.exports = {
  initDB,
  TABLE_DDL,
  getDB: getPool,
  dbRun,
  dbGet,
  dbAll,
  safeParseJSON,
  DB_PATH: null
}
