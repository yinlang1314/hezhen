#!/usr/bin/env node
/**
 * 给「待核实」的病害生成症状/发生规律草稿（AI 生成，必须人工核实）
 *
 *   node scripts/fill-drafts.js --dry-run --limit=3     # 预演
 *   node scripts/fill-drafts.js                        # 全部待核实
 *   node scripts/fill-drafts.js --limit=20             # 先跑 20 条
 *
 * 规则：
 *   - 只填空着的字段，已有内容不动（比如从农药登记库抓到的用药绝不覆盖）
 *   - 分类里打上「（AI草稿）」标记，后台一眼能看出哪些是生成内容
 *   - 全部保持 verified=0，人工核实前不会进 App
 */

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const { dbRun, dbAll } = require('../config/db')
const router = require('../routes/disease')
const { enrichDiseasePlan } = router.__helpers

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limitArg = args.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) || 999 : 999
const onlyArg = args.find((a) => a.startsWith('--only='))
const only = onlyArg ? decodeURIComponent(onlyArg.split('=')[1]) : ''

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const j = (v) => JSON.stringify(Array.isArray(v) ? v : [])

async function main() {
  if (!process.env.DEEPSEEK_API_KEY) { console.error('缺少 DEEPSEEK_API_KEY'); process.exit(1) }

  let rows = await dbAll("SELECT id, name, host, category, symptom, cause, spread, occurrence, prevention FROM diseases WHERE verified = 0 ORDER BY id")
  if (only) rows = rows.filter((r) => r.name.indexOf(only) >= 0)
  // 已经有症状的不重复生成
  rows = rows.filter((r) => !String(r.symptom || '').trim())
  rows = rows.slice(0, limit)

  console.log('待生成草稿: ' + rows.length + ' 条' + (dryRun ? '（预演）' : ''))
  let done = 0, failed = 0

  for (const d of rows) {
    const tag = '[' + (done + failed + 1) + '/' + rows.length + '] ' + d.name
    let plan = null
    for (let attempt = 1; attempt <= 2 && !plan; attempt++) {
      try {
        plan = await enrichDiseasePlan(d.name, d.host || '')
      } catch (e) {
        if (attempt === 2) { console.log(tag + ' ❌ ' + e.message) }
        else await sleep(2000)
      }
    }
    if (!plan) { failed++; continue }

    if (dryRun) {
      console.log(tag + ' 会填：症状 ' + String(plan.symptom || '').slice(0, 30) + '… | 规律 ' + String(plan.occurrence || '').slice(0, 30) + '…')
      done++
      await sleep(300)
      continue
    }

    const cat = String(d.category || '').indexOf('AI草稿') >= 0 ? d.category : (String(d.category || '') + '（AI草稿）')
    await dbRun(
      `UPDATE diseases SET
         symptom = CASE WHEN COALESCE(symptom,'') = '' THEN ? ELSE symptom END,
         cause   = CASE WHEN COALESCE(cause,'') = '' THEN ? ELSE cause END,
         spread  = CASE WHEN COALESCE(spread,'') = '' THEN ? ELSE spread END,
         occurrence = CASE WHEN COALESCE(occurrence,'') = '' THEN ? ELSE occurrence END,
         prevention = CASE WHEN COALESCE(prevention,'[]') = '[]' THEN ? ELSE prevention END,
         suggestions = CASE WHEN COALESCE(suggestions,'[]') = '[]' THEN ? ELSE suggestions END,
         category = ?
       WHERE id = ?`,
      [plan.symptom || '', plan.cause || '', plan.spread || '', plan.occurrence || '',
       j(plan.prevention), j(plan.suggestions), cat, d.id]
    )
    done++
    console.log(tag + ' ✅ 症状 ' + String(plan.symptom || '').length + ' 字 / 规律 ' + String(plan.occurrence || '').length + ' 字')
    await sleep(1000)
  }

  console.log('\n============ 结果 ============')
  console.log((dryRun ? '会生成 ' : '已生成 ') + done + ' 条 / 失败 ' + failed + (dryRun ? '（预演）' : ''))
  if (!dryRun) {
    console.log('\n⚠️ 这些都是 AI 草稿，分类里带「AI草稿」标记。')
    console.log('   后台核对后填「数据来源」再点核实；核实时会自动去掉那个标记。')
  }
}

main().catch((e) => { console.error('生成异常：', e); process.exit(1) })
