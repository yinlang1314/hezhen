#!/usr/bin/env node
/**
 * 批量建库脚本
 *
 *   node scripts/batch-import.js                     # 读 scripts/disease-names.txt
 *   node scripts/batch-import.js 我的清单.txt          # 指定文件
 *   node scripts/batch-import.js --dry-run           # 只看会加哪些，不调 AI、不改库
 *   node scripts/batch-import.js --limit=10          # 最多处理 10 条
 *
 * 清单格式：一行一个病害，可带寄主（用 | 分隔），# 开头是注释
 *   水稻稻曲病
 *   番茄灰霉病|番茄
 */

const fs = require('fs')
const path = require('path')

// 先加载 .env，否则拿不到 AI 密钥
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const { dbRun, dbAll } = require('../config/db')
const router = require('../routes/disease')
const { enrichDiseasePlan, sameDisease, cleanDiseaseName } = router.__helpers

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limitArg = args.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) || 999 : 999
const fileArg = args.find((a) => !a.startsWith('--'))
const file = path.resolve(fileArg || path.join(__dirname, 'disease-names.txt'))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const j = (v) => JSON.stringify(Array.isArray(v) ? v : [])

async function main() {
  if (!fs.existsSync(file)) {
    console.error('❌ 找不到清单文件：' + file)
    process.exit(1)
  }
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('❌ 没有 DEEPSEEK_API_KEY，检查 agriculture-backend/.env')
    process.exit(1)
  }

  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))

  const items = lines.slice(0, limit).map((line) => {
    const [rawName, rawHost] = line.split('|')
    return { name: cleanDiseaseName(rawName), host: (rawHost || '').trim() }
  }).filter((x) => x.name)

  console.log('清单：' + items.length + ' 条' + (dryRun ? '（预演模式，不调 AI、不改库）' : ''))
  console.log('文件：' + file + '\n')

  const existing = await dbAll('SELECT id, name FROM diseases')
  const added = []
  const skipped = []
  const failed = []

  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const tag = '[' + String(i + 1) + '/' + items.length + '] '

    // 已存在（模糊匹配 0.72，跟识别时的判定一致）
    const hit = existing.find((row) => sameDisease(it.name, row.name))
    if (hit) {
      skipped.push(it.name + ' → 已有「' + hit.name + '」')
      console.log(tag + '跳过 ' + it.name + '（已有 ' + hit.name + '）')
      continue
    }

    if (dryRun) {
      added.push(it.name)
      console.log(tag + '会新增 ' + it.name + (it.host ? '（寄主 ' + it.host + '）' : ''))
      continue
    }

    let plan = null
    for (let attempt = 1; attempt <= 2 && !plan; attempt++) {
      try {
        plan = await enrichDiseasePlan(it.name, it.host)
      } catch (e) {
        console.log(tag + '第 ' + attempt + ' 次失败：' + e.message)
        if (attempt < 2) await sleep(2000)
      }
    }

    if (!plan) {
      failed.push(it.name)
      console.log(tag + '❌ 失败 ' + it.name)
      continue
    }

    const level = plan.level === 1 ? 1 : plan.level === 3 ? 3 : 2
    const levelText = level === 1 ? '轻度危害' : level === 3 ? '重度危害' : '中度危害'
    try {
      await dbRun(
        // verified=0：先入待核实队列，人工核实后才在 App 显示
      `INSERT INTO diseases (name, type, category, level, level_text, image, verified, host, symptom, cause, spread, occurrence, medicines, suggestions, prevention)
         VALUES (?, ?, ?, ?, ?, '', 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [cleanText(it.name), it.host ? cleanText(it.host) + '病害' : 'AI 批量生成', 'AI 批量生成（待核实）', level, levelText,
         cleanText(it.host || ''), cleanText(plan.symptom), cleanText(plan.cause), cleanText(plan.spread), cleanText(plan.occurrence),
         j(plan.medicines), j(plan.suggestions), j(plan.prevention)]
      )
      added.push(it.name)
      existing.push({ id: -1, name: it.name })
      console.log(tag + '✅ 新增 ' + it.name + '（' + (plan.medicines || []).length + ' 种药）')
    } catch (e) {
      failed.push(it.name + '：' + e.message)
      console.log(tag + '❌ 入库失败 ' + it.name + '：' + e.message)
    }

    await sleep(1200)   // 控制调用频率
  }

  console.log('\n================ 结果 ================')
  console.log('新增 ' + added.length + ' 条 / 跳过 ' + skipped.length + ' / 失败 ' + failed.length)
  if (added.length) console.log('新增：' + added.join('、'))
  if (skipped.length) console.log('跳过：' + skipped.join('；'))
  if (failed.length) console.log('失败：' + failed.join('；'))
  console.log('=====================================')
  if (!dryRun && added.length) console.log('\n⚠️ 新条目都是「待核实」状态，不会出现在 App 里。')
  console.log('   去后台逐条检查 → 点「核实」才会上线：http://localhost:3000/admin/diseases')
}

main().catch((e) => { console.error('脚本异常：', e); process.exit(1) })
