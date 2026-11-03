#!/usr/bin/env node
/**
 * 把 SQLite 里的数据搬到 MySQL（一次性）
 *
 *   node scripts/migrate-to-mysql.js --dry-run   # 只看数量
 *   node scripts/migrate-to-mysql.js             # 实际迁移
 *
 * 前置：
 *   1. 已执行 scripts/mysql-init.sql 建好库和账号
 *   2. .env 里配好 MYSQL_HOST / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE
 *   3. 表结构由 config/db-mysql.js 的 initDB 自动创建
 */

const path = require('path')
const fs = require('fs')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const sqlite3 = require('sqlite3')
const mysql = require('mysql2/promise')

const DRY = process.argv.includes('--dry-run')
const SQLITE_FILE = path.join(__dirname, '..', 'agriculture.db')
const TABLES = ['users', 'diseases', 'histories', 'collections', 'warnings', 'corrections', 'login_logs', 'feedback']
// 必须保留原 id：histories.user_id / corrections.history_id / collections.disease_id 都靠它关联
// （早期版本跳过 id 导致 id 整体前移、关系断裂）
const SKIP_COLS = {}

const sqliteAll = (db, sql) => new Promise((res, rej) => db.all(sql, [], (e, r) => (e ? rej(e) : res(r || []))))
const sqliteCols = (db, t) => new Promise((res, rej) => db.all('PRAGMA table_info(' + t + ')', [], (e, r) => (e ? rej(e) : res(r || []))))

async function main() {
  const cfg = {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || 'hezhen',
    charset: 'utf8mb4',
    dateStrings: true
  }
  if (!cfg.user) { console.error('❌ .env 里没有 MYSQL_USER'); process.exit(1) }

  console.log('SQLite :', SQLITE_FILE)
  console.log('MySQL  :', cfg.user + '@' + cfg.host + ':' + cfg.port + '/' + cfg.database)
  console.log('模式   :', DRY ? '预演（不写入）' : '实际迁移')
  console.log('')

  // 建表：直接用适配层导出的 DDL，在同一个连接里执行（避免创建连接池导致进程不退出）
  const { TABLE_DDL } = require('../config/db-mysql')
  const my = DRY ? null : await mysql.createConnection(cfg)
  if (my) {
    for (const ddl of TABLE_DDL) await my.query(ddl)
    // 清空目标表：迁移是"整表重建"，重复执行不会产生重复数据
    for (const t of TABLES) await my.query('DELETE FROM ' + t)
    console.log('MySQL 表结构就绪（已清空目标表）\n')
  }
  const lite = new sqlite3.Database(SQLITE_FILE)
  let total = 0

  for (const t of TABLES) {
    const rows = await sqliteAll(lite, 'SELECT * FROM ' + t)
    const cols = (await sqliteCols(lite, t)).map((c) => c.name)
    const useCols = cols.filter((c) => !(SKIP_COLS[t] || []).includes(c))
    console.log(t.padEnd(14) + 'SQLite ' + String(rows.length).padStart(4) + ' 行')
    if (DRY || !rows.length) { total += rows.length; continue }

    for (const r of rows) {
      const vals = useCols.map((c) => (r[c] === undefined ? null : r[c]))
      await my.query('INSERT IGNORE INTO ' + t + ' (' + useCols.map((c) => '`' + c + '`').join(',') + ') VALUES (' + useCols.map(() => '?').join(',') + ')', vals)
    }
    const maxRow = await my.query('SELECT MAX(id) mx FROM ' + t)
    const mx = (maxRow[0][0] && maxRow[0][0].mx) || 0
    if (mx) await my.query('ALTER TABLE ' + t + ' AUTO_INCREMENT = ' + (mx + 1))
    const [cnt] = await my.query('SELECT COUNT(*) c FROM ' + t)
    console.log('              MySQL  ' + String(cnt[0].c).padStart(4) + ' 行 ✅')
    total += rows.length
  }

  lite.close()
  if (my) await my.end()
  console.log('\n合计处理 ' + total + ' 行' + (DRY ? '（预演）' : '') )
  if (!DRY) console.log('\n下一步：把 .env 里的 DB_DRIVER 改成 mysql，重启后端')
}

main().then(() => process.exit(0)).catch((e) => { console.error('迁移失败：', e); process.exit(1) })
