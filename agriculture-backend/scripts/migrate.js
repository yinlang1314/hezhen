#!/usr/bin/env node
/**
 * 迁移命令行
 *
 *   node scripts/migrate.js status   # 看哪些没跑
 *   node scripts/migrate.js up       # 手动跑（平时启动会自动跑）
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const { dbRun, dbAll } = require('../config/db')
const { loadMigrationFiles, runMigrations } = require('../lib/migrate')

const dialect = (process.env.DB_DRIVER || 'sqlite').toLowerCase() === 'mysql' ? 'mysql' : 'sqlite'
const cmd = process.argv[2] || 'status'

async function main() {
  const files = loadMigrationFiles()
  if (cmd === 'up') {
    const res = await runMigrations({ run: dbRun, all: dbAll, dialect })
    console.log('完成：执行 ' + res.applied.length + ' 个迁移')
    return
  }
  const applied = new Set()
  try {
    const rows = await dbAll('SELECT id FROM schema_version')
    rows.forEach((r) => applied.add(String(r.id)))
  } catch (e) { /* 表还不存在 */ }
  console.log('驱动：' + dialect + ' · 迁移文件 ' + files.length + ' 个')
  for (const f of files) {
    console.log('  ' + (applied.has(String(f.id)) ? '✅ 已执行' : '⬜ 待执行') + '  ' + f.id + '  ' + (f.name || f.file))
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1) })
