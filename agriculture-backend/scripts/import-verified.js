#!/usr/bin/env node
/**
 * 真实数据导入（CSV → 知识库）
 *
 *   node scripts/import-verified.js  知识库.csv  [--images=图片目录]  [--dry-run]
 *
 * CSV 列（第一行表头，顺序固定）：
 *   名称,寄主,分类,危害等级,症状,病因,传播途径,发生规律,用药,防治建议,预防措施,数据来源,核对日期,图片文件名
 *
 * - 用药格式：  药名|用法;药名|用法      例：苯醚甲环唑|1500倍液喷雾;戊唑醇|3000倍液
 * - 列表格式：  用 ; 分隔
 * - 危害等级：  1=轻度 2=中度 3=重度
 * - 图片文件名：图片目录里的文件名，如 稻瘟病.jpg（可选，之后也能在后台「补图」）
 * - 数据来源：  必填！没填的整行会被跳过（不让假数据入库）
 *
 * 导入的记录 verified=1，直接上线。
 */

const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const { dbRun, dbAll } = require('../config/db')
const router = require('../routes/disease')
const { sameDisease, cleanDiseaseName } = router.__helpers

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const imgArg = args.find((a) => a.startsWith('--images='))
const imgDir = imgArg ? path.resolve(imgArg.split('=')[1]) : path.join(__dirname, '..', 'public', 'uploads')
const fileArg = args.find((a) => !a.startsWith('--'))
if (!fileArg) { console.error('用法: node scripts/import-verified.js 知识库.csv [--images=目录] [--dry-run]'); process.exit(1) }
const file = path.resolve(fileArg)
if (!fs.existsSync(file)) { console.error('找不到文件: ' + file); process.exit(1) }

// 简易 CSV 解析（支持双引号包裹、字段内逗号与换行）
function parseCSV(text) {
  const rows = []
  let row = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQ = false
      else field += c
    } else {
      if (c === '"') inQ = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') {}
      else field += c
    }
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((x) => String(x).trim()))
}

const splitList = (s) => String(s || '').split(';').map((x) => x.trim()).filter(Boolean)
const splitMeds = (s) => splitList(s).map((seg) => {
  const [name, usage] = seg.split('|').map((x) => String(x || '').trim())
  return name ? { name, usage: usage || '' } : null
}).filter(Boolean)

function copyImage(fname) {
  if (!fname) return ''
  const src = path.join(imgDir, fname)
  if (!fs.existsSync(src)) { console.log('   ⚠ 图片不存在: ' + src); return '' }
  const ext = (path.extname(fname) || '.jpg').toLowerCase()
  const dest = 'disease-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + ext
  fs.copyFileSync(src, path.join(__dirname, '..', 'public', 'uploads', dest))
  return '/uploads/' + dest
}

async function main() {
  const rows = parseCSV(fs.readFileSync(file, 'utf8'))
  if (rows.length < 2) { console.error('CSV 没有数据行'); process.exit(1) }
  const header = rows[0].map((h) => h.trim())
  const expect = ['名称', '寄主', '分类', '危害等级', '症状', '病因', '传播途径', '发生规律', '用药', '防治建议', '预防措施', '数据来源', '核对日期', '图片文件名']
  const missing = expect.filter((h) => !header.includes(h))
  if (missing.length) { console.error('CSV 缺少列: ' + missing.join('、')); process.exit(1) }
  const idx = {}
  expect.forEach((h) => { idx[h] = header.indexOf(h) })

  const existing = await dbAll('SELECT id, name FROM diseases')
  let added = 0, updated = 0, skipped = 0

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const get = (k) => String(r[idx[k]] || '').trim()
    const name = cleanDiseaseName(get('名称'))
    const source = get('数据来源')
    const line = '[' + i + '] ' + (name || '(空)')

    if (!name) { skipped++; console.log(line + ' 跳过：名称为空'); continue }
    if (!source) { skipped++; console.log(line + ' 跳过：没有「数据来源」（真实数据必须有出处）'); continue }

    const payload = {
      name,
      host: get('寄主'),
      category: get('分类') || '病害',
      level: Math.min(3, Math.max(1, parseInt(get('危害等级'), 10) || 2)),
      symptom: get('症状'),
      cause: get('病因'),
      spread: get('传播途径'),
      occurrence: get('发生规律'),
      medicines: JSON.stringify(splitMeds(get('用药'))),
      suggestions: JSON.stringify(splitList(get('防治建议'))),
      prevention: JSON.stringify(splitList(get('预防措施'))),
      verify_source: source,
      verify_date: get('核对日期') || new Date().toISOString().slice(0, 10),
      imageFile: get('图片文件名')
    }

    const hit = existing.find((row) => sameDisease(name, row.name))
    if (dryRun) {
      console.log(line + ' ' + (hit ? '会更新「' + hit.name + '」' : '会新增') + '（来源：' + source + '）')
      continue
    }

    const image = copyImage(payload.imageFile)

    if (hit) {
      await dbRun(
        `UPDATE diseases SET category=?, host=?, level=?, level_text=?, symptom=?, cause=?, spread=?, occurrence=?,
          medicines=?, suggestions=?, prevention=?, verify_source=?, verify_date=?, verified=1,
          image=CASE WHEN ?<>'' THEN ? ELSE image END WHERE id=?`,
        [payload.category, payload.host, payload.level,
         payload.level === 3 ? '重度危害' : payload.level === 1 ? '轻度危害' : '中度危害',
         payload.symptom, payload.cause, payload.spread, payload.occurrence,
         payload.medicines, payload.suggestions, payload.prevention,
         payload.verify_source, payload.verify_date, image, image, hit.id]
      )
      updated++
      console.log(line + ' ✅ 更新「' + hit.name + '」')
    } else {
      await dbRun(
        `INSERT INTO diseases (name, type, category, level, level_text, image, host, verified, verify_source, verify_date,
          symptom, cause, spread, occurrence, medicines, suggestions, prevention)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [payload.name, payload.host ? payload.host + '病害' : '人工录入', payload.category, payload.level,
         payload.level === 3 ? '重度危害' : payload.level === 1 ? '轻度危害' : '中度危害',
         image, payload.host, payload.verify_source, payload.verify_date,
         payload.symptom, payload.cause, payload.spread, payload.occurrence,
         payload.medicines, payload.suggestions, payload.prevention]
      )
      added++
      console.log(line + ' ✅ 新增「' + payload.name + '」')
    }
  }

  console.log('\n============ 导入结果 ============')
  console.log('新增 ' + added + ' / 更新 ' + updated + ' / 跳过 ' + skipped + (dryRun ? '（预演，未写库）' : ''))
  if (!dryRun) console.log('后台: http://localhost:3000/admin/diseases')
}

main().catch((e) => { console.error('导入异常：', e); process.exit(1) })
