#!/usr/bin/env node
/**
 * 抽检清单生成器
 *
 * 用途：批量核实之前，先随机抽几条「待核实」记录，把完整内容导出来给人看。
 * 判断质量合格再批量点核实，避免把 AI 写错的内容放上线。
 *
 *   node scripts/sample-review.cjs                 # 默认抽 10 条
 *   node scripts/sample-review.cjs --count=20      # 抽 20 条
 *   node scripts/sample-review.cjs --seed=123      # 换随机种子（同一作物/类别会被打散）
 *   node scripts/sample-review.cjs --out=文件.md   # 指定输出路径
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const fs = require('fs')
const { dbAll } = require('../config/db')

const arg = (k, def) => {
  const hit = process.argv.find((a) => a.startsWith('--' + k + '='))
  return hit ? hit.split('=').slice(1).join('=') : def
}
const COUNT = parseInt(arg('count', '10'), 10) || 10
const SEED = parseInt(arg('seed', '20261105'), 10) || 20261105
const OUT = arg('out', path.join(__dirname, '..', '..', 'docs', '抽检清单.md'))

// 简单可复现的伪随机
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function arr(v) {
  if (Array.isArray(v)) return v
  try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : [] } catch (e) { return [] }
}

function fmtList(list, max) {
  const items = (list || []).slice(0, max)
  if (!items.length) return '（空）'
  return items.map((x, i) => (i + 1) + '. ' + String(x)).join('\n   ')
}

async function main() {
  const rows = await dbAll("SELECT * FROM diseases WHERE verified = 0 AND TRIM(COALESCE(verify_source,'')) <> '' ORDER BY id")
  if (!rows.length) { console.log('没有可抽检的记录'); return }

  // 分层抽样：按类别分组后轮流取，保证病害/虫害都有
  const groups = {}
  for (const r of rows) {
    const k = String(r.category || '未分类').split('·')[0]
    ;(groups[k] = groups[k] || []).push(r)
  }
  const rand = rng(SEED)
  Object.keys(groups).forEach((k) => groups[k].sort(() => rand() - 0.5))
  const picked = []
  const keys = Object.keys(groups)
  let i = 0
  while (picked.length < COUNT && keys.length) {
    const k = keys[i % keys.length]
    if (groups[k].length) picked.push(groups[k].pop())
    i++
    if (picked.length >= COUNT) break
    if (keys.every((kk) => !groups[kk].length)) break
  }

  const today = new Date().toISOString().slice(0, 10)
  const lines = []
  lines.push('# 禾诊 · 待核实内容抽检清单')
  lines.push('')
  lines.push('> 生成时间：' + today + '　随机种子：' + SEED + '　抽样数：' + picked.length)
  lines.push('> 说明：这些条目**还没有在 App 里显示**。请按下面每条的内容判断"能不能上线"，')
  lines.push('> 判断完再回后台批量核实。来源只证明"名录里有这个病"，不代表这段文字准确。')
  lines.push('')
  lines.push('## 一、先看数据概况')
  lines.push('')
  const withMed = rows.filter((r) => arr(r.medicines).length > 0).length
  const withImg = rows.filter((r) => String(r.image || '').trim()).length
  const avgSym = Math.round(rows.reduce((s, r) => s + String(r.symptom || '').length, 0) / rows.length)
  lines.push('| 指标 | 数值 |')
  lines.push('|---|---:|')
  lines.push('| 待核实且带来源 | ' + rows.length + ' |')
  lines.push('| 其中有用药方案 | ' + withMed + ' |')
  lines.push('| 其中有配图 | ' + withImg + ' |')
  lines.push('| 症状平均字数 | ' + avgSym + ' |')
  lines.push('')
  lines.push('## 二、抽检记录（逐条判断）')
  lines.push('')

  picked.forEach((d, idx) => {
    const meds = arr(d.medicines)
    lines.push('---')
    lines.push('')
    lines.push('### ' + (idx + 1) + '. ' + d.name + '（id ' + d.id + '）')
    lines.push('')
    lines.push('| 项 | 内容 |')
    lines.push('|---|---|')
    lines.push('| 分类 | ' + (d.category || '-') + ' |')
    lines.push('| 类型 | ' + (d.type || '-') + ' |')
    lines.push('| 危害等级 | ' + (d.level_text || '-') + ' |')
    lines.push('| 寄主 | ' + (d.host || '-') + ' |')
    lines.push('| 数据来源 | ' + (d.verify_source || '-') + ' |')
    lines.push('| 配图 | ' + (String(d.image || '').trim() ? '有' : '无') + ' |')
    lines.push('| 用药条数 | ' + meds.length + ' |')
    lines.push('')
    lines.push('**发病症状**')
    lines.push('')
    lines.push(String(d.symptom || '（空）').slice(0, 400))
    lines.push('')
    lines.push('**病因**')
    lines.push('')
    lines.push(String(d.cause || '（空）').slice(0, 300))
    lines.push('')
    lines.push('**传播途径**')
    lines.push('')
    lines.push(String(d.spread || '（空）').slice(0, 300))
    lines.push('')
    lines.push('**发生条件**')
    lines.push('')
    lines.push(String(d.occurrence || '（空）').slice(0, 300))
    lines.push('')
    lines.push('**推荐用药（前 3 条）**')
    lines.push('')
    if (meds.length) {
      meds.slice(0, 3).forEach((m, mi) => {
        lines.push((mi + 1) + '. ' + (m.name || '?') + (m.tox ? ' · ' + m.tox : '') + ' — ' + (m.usage || ''))
      })
    } else {
      lines.push('（无用药方案）')
    }
    lines.push('')
    lines.push('**防治建议（前 3 条）**')
    lines.push('')
    lines.push('   ' + fmtList(arr(d.suggestions), 3))
    lines.push('')
    lines.push('**预防措施（前 3 条）**')
    lines.push('')
    lines.push('   ' + fmtList(arr(d.prevention), 3))
    lines.push('')
    lines.push('**我的判断**：□ 可以上线　　□ 需要修改　　□ 不能上线')
    lines.push('')
    lines.push('> 修改意见：')
    lines.push('')
  })

  lines.push('---')
  lines.push('')
  lines.push('## 三、汇总')
  lines.push('')
  lines.push('| # | 名称 | 判断 | 备注 |')
  lines.push('|---|---|---|---|')
  picked.forEach((d, idx) => {
    lines.push('| ' + (idx + 1) + ' | ' + d.name + ' |  |  |')
  })
  lines.push('')
  lines.push('**结论怎么用**：')
  lines.push('')
  lines.push('- 10 条里 **8 条以上合格** → 可以批量核实，但建议每批抽 1 条看看')
  lines.push('- **5~7 条合格** → 先修提示词重新生成空字段，再抽检')
  lines.push('- **5 条以下合格** → 停止批量核实，这批内容不能用')
  lines.push('')

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, lines.join('\n'), 'utf8')
  console.log('✅ 抽检清单已生成：' + OUT)
  console.log('   抽样 ' + picked.length + ' 条（共 ' + rows.length + ' 条候选）')
  picked.forEach((d, i) => console.log('   ' + (i + 1) + '. ' + d.name))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
