#!/usr/bin/env node
/**
 * 清理没有被任何记录引用的上传文件
 *
 * 起因：识别接口每张图都落盘，但历史被删除后图片还留着——
 * 实测积累了 1500+ 个孤儿文件、85MB+。
 *
 *   node scripts/clean-uploads.cjs            # 预演，只统计
 *   node scripts/clean-uploads.cjs --apply    # 真删
 *   node scripts/clean-uploads.cjs --apply --keep-days=3   # 只删 3 天前的
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const fs = require('fs')
const { dbAll } = require('../config/db')

const APPLY = process.argv.includes('--apply')
const keepArg = process.argv.find((a) => a.startsWith('--keep-days='))
const KEEP_DAYS = keepArg ? Number(keepArg.split('=')[1]) : 0

const DIR = path.join(__dirname, '..', 'public', 'uploads')

async function main() {
  if (!fs.existsSync(DIR)) { console.log('没有上传目录'); return }

  // 收集所有被引用的文件名
  const referenced = new Set()
  const collect = (v) => {
    const s = String(v || '')
    const m = s.match(/\/uploads\/([^?"'\s]+)/)
    if (m) referenced.add(decodeURIComponent(m[1]))
  }
  for (const r of await dbAll('SELECT image, image_url FROM histories')) { collect(r.image); collect(r.image_url) }
  for (const r of await dbAll('SELECT image FROM diseases')) collect(r.image)
  for (const r of await dbAll('SELECT avatar FROM users')) collect(r.avatar)

  const files = fs.readdirSync(DIR).filter((f) => fs.statSync(path.join(DIR, f)).isFile())
  const now = Date.now()
  const orphan = []
  let bytes = 0
  for (const f of files) {
    if (referenced.has(f)) continue
    const st = fs.statSync(path.join(DIR, f))
    if (KEEP_DAYS && (now - st.mtimeMs) < KEEP_DAYS * 86400000) continue
    orphan.push(f)
    bytes += st.size
  }

  console.log('上传文件总数：' + files.length)
  console.log('被记录引用：' + (files.length - orphan.length))
  console.log('孤儿文件：' + orphan.length + ' 个 · ' + (bytes / 1048576).toFixed(1) + ' MB')
  if (!APPLY) { console.log('\n预演结束，加 --apply 才删除'); return }

  let removed = 0
  for (const f of orphan) {
    try { fs.unlinkSync(path.join(DIR, f)); removed++ } catch (e) {}
  }
  console.log('已删除：' + removed + ' 个，释放约 ' + (bytes / 1048576).toFixed(1) + ' MB')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1) })
