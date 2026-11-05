#!/usr/bin/env node
/**
 * 把「已核实但没有数据来源」的病害退回待核实
 *
 * 背景：项目原则是"没来源不上线"。早期测试阶段有几条是直接改库置 verified=1 的，
 * 没有 verify_source，结果对用户可见——等于把没依据的内容放出去了。
 *
 *   node scripts/unverify-no-source.js            # 预演
 *   node scripts/unverify-no-source.js --apply    # 真改
 *   node scripts/unverify-no-source.js --apply --id=40   # 只处理某条
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const { dbAll, dbRun } = require('../config/db')

const APPLY = process.argv.includes('--apply')
const ONLY = (process.argv.find((a) => a.startsWith('--id=')) || '').split('=')[1]

async function main() {
  let rows = await dbAll("SELECT id, name, category, verify_source, verify_date FROM diseases WHERE verified = 1 AND (verify_source IS NULL OR TRIM(verify_source) = '')")
  if (ONLY) rows = rows.filter((r) => String(r.id) === ONLY)
  if (!rows.length) { console.log('没有需要处理的记录 ✅'); return }

  console.log('已核实但缺来源的记录：' + rows.length + ' 条')
  for (const r of rows) {
    console.log('  #' + r.id + ' ' + r.name + '（' + r.category + '）')
  }
  if (!APPLY) { console.log('\n预演结束，加 --apply 才会改动数据库'); return }

  const ids = rows.map((r) => r.id)
  const marks = ids.map(() => '?').join(',')
  const res = await dbRun('UPDATE diseases SET verified = 0 WHERE id IN (' + marks + ')', ids)
  console.log('\n已退回待核实：' + ((res && res.changes) || ids.length) + ' 条')
  console.log('恢复方式：后台「病虫害库」给该条填数据来源，再点「核实」')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1) })
