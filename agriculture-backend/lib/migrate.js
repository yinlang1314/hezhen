// ==================================================================
// 数据库迁移（Migrations）
//
// 为什么需要：以前每次加字段都往 initTables() 里塞 ALTER，
// 表多了以后分不清哪个字段是哪一版加的，也没法在别的电脑上复现。
//
// 现在的约定：
//   · 新建表 / 加字段 / 加索引 → 写在 migrations/ 下的新文件里
//   · initTables() 保持不动，只当"第一版基线"
//   · 启动时自动执行没跑过的迁移，并在 schema_version 里记一笔
//
// 迁移文件格式（migrations/003_xxx.js）：
//   module.exports = {
//     id: '003',            // 排序用，建议三位数字
//     name: '加天气预警表',
//     async up({ run, all, dialect, ensureIndex, ensureColumn }) {
//       await run('CREATE TABLE ...')
//     }
//   }
// ==================================================================
const fs = require('fs')
const path = require('path')

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations')

// ---------- 方言差异的小工具 ----------
function makeHelpers(run, all, dialect) {
  const isMySQL = dialect === 'mysql'

  // 列是否存在
  async function hasColumn(table, column) {
    if (isMySQL) {
      const rows = await all(
        'SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [table, column]
      )
      return rows.length > 0
    }
    const rows = await all('PRAGMA table_info(' + table + ')')
    return rows.some((r) => r.name === column)
  }

  async function ensureColumn(table, column, typeSql) {
    if (await hasColumn(table, column)) return false
    await run('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + typeSql)
    return true
  }

  // 索引是否存在（MySQL 没有 CREATE INDEX IF NOT EXISTS）
  async function hasIndex(table, indexName) {
    if (isMySQL) {
      const rows = await all(
        'SELECT INDEX_NAME AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
        [table, indexName]
      )
      return rows.length > 0
    }
    const rows = await all('PRAGMA index_list(' + table + ')')
    return rows.some((r) => r.name === indexName || r.name === indexName.replace(/\[.*$/, ''))
  }

  async function ensureIndex(table, indexName, columns) {
    if (await hasIndex(table, indexName)) return false
    const cols = Array.isArray(columns) ? columns.join(', ') : columns
    await run('CREATE INDEX ' + indexName + ' ON ' + table + ' (' + cols + ')')
    return true
  }

  return { hasColumn, ensureColumn, hasIndex, ensureIndex }
}

// ---------- 迁移表 ----------
async function ensureVersionTable(run, dialect) {
  const isMySQL = dialect === 'mysql'
  const ddl = isMySQL
    ? `CREATE TABLE IF NOT EXISTS schema_version (
        id VARCHAR(16) PRIMARY KEY,
        name VARCHAR(200),
        driver VARCHAR(20),
        applied_at VARCHAR(40)
      ) DEFAULT CHARSET = utf8mb4`
    : `CREATE TABLE IF NOT EXISTS schema_version (
        id TEXT PRIMARY KEY,
        name TEXT,
        driver TEXT,
        applied_at TEXT
      )`
  await run(ddl)
}

function loadMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return []
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .map((f) => {
      const mod = require(path.join(MIGRATIONS_DIR, f))
      if (!mod || !mod.id || typeof mod.up !== 'function') {
        throw new Error('迁移文件格式不对：' + f)
      }
      return Object.assign({ file: f }, mod)
    })
}

async function runMigrations({ run, all, dialect }) {
  await ensureVersionTable(run, dialect)
  const applied = new Set((await all('SELECT id FROM schema_version')).map((r) => String(r.id)))
  const files = loadMigrationFiles()
  const pending = files.filter((m) => !applied.has(String(m.id)))

  if (!pending.length) {
    if (files.length) console.log('✅ 数据库结构已是最新（' + files.length + ' 个迁移）')
    return { applied: [], total: files.length }
  }

  const helpers = makeHelpers(run, all, dialect)
  const done = []
  for (const m of pending) {
    const started = Date.now()
    try {
      await m.up(Object.assign({ run, all, dialect }, helpers))
      await run(
        'INSERT INTO schema_version (id, name, driver, applied_at) VALUES (?, ?, ?, ?)',
        [String(m.id), m.name || m.file, dialect, new Date().toISOString()]
      )
      done.push(m.id)
      console.log('✅ 迁移 ' + m.id + ' · ' + (m.name || m.file) + ' (' + (Date.now() - started) + 'ms)')
    } catch (e) {
      console.error('❌ 迁移失败 ' + m.id + ' · ' + (m.name || m.file))
      console.error('   ' + e.message)
      throw e
    }
  }
  return { applied: done, total: files.length }
}


module.exports = { runMigrations, loadMigrationFiles, MIGRATIONS_DIR }
