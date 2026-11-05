#!/usr/bin/env node
/**
 * 清掉"待核实记录"上的核实日期
 *
 * 背景：scripts/fetch-registry.js 以前补用药时会顺手写 verify_date，
 * 但 verified 没动，于是 71 条待核实记录带着"核实日期"，
 * 看起来像已核实，容易误导人工审核。
 *
 *   node scripts/clean-stale-verify-date.js            # 预演
 *   node scripts/clean-stale-verify-date.js --apply    # 执行
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const { dbAll, dbRun } = require('../config/db')

const APPLY = process.argv.includes('--apply')

async function main() {
  const rows = await dbAll("SELECT id, name, verify_source, verify_date FROM diseases WHERE verified = 0 AND TRIM(COALESCE(verify_date, '')) <> ''")
  console.log('待核实但带核实日期的记录：' + rows.length + ' 条')
  if (!rows.length) return
  console.log('  示例：' + rows.slice(0, 5).map((r) => '#' + r.id + ' ' + r.name + '（' + r.verify_date + '）').join('、'))
  if (!APPLY) { console.log('\n预演结束，加 --apply 才会清理'); return }
  const res = await dbRun("UPDATE diseases SET verify_date = NULL WHERE verified = 0 AND TRIM(COALESCE(verify_date, '')) <> ''")
  console.log('已清理：' + ((res && res.changes) || rows.length) + ' 条（来源字段保留，可用于溯源）')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1) })
