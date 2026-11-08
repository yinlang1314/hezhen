#!/usr/bin/env node
/**
 * 清理 users.avatar 里的脏数据
 *
 * 问题：以前保存资料时把展示用的 ?token=xxx 一起存进了数据库，形如
 *   /uploads/x.png?token=eyJ...
 * 结果图永远加载失败（路径带查询串，文件找不到）。
 *
 * 这个脚本会：
 *   1) 去掉 ?query 和 #hash
 *   2) 头像文件已不存在的，清空（前端显示默认头像）
 *   3) 打印处理结果
 *
 *   node scripts/fix-avatar-urls.cjs           # 只报告
 *   node scripts/fix-avatar-urls.cjs --apply   # 真正写库
 */
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const { dbAll, dbRun } = require('../config/db')

const apply = process.argv.includes('--apply')

;(async () => {
  const rows = await dbAll('SELECT id, username, avatar FROM users WHERE avatar IS NOT NULL AND avatar <> ""')
  let cleaned = 0, cleared = 0
  for (const r of rows) {
    const raw = String(r.avatar)
    let v = raw.split('#')[0].split('?')[0].replace(/^https?:\/\/[^/]+/i, '').trim()
    if (v && v.indexOf('/uploads/') !== 0) v = ''   // 只保留本服务器上传目录

    let exists = true
    if (v) {
      const file = path.join(__dirname, '..', 'public', 'uploads', v.slice('/uploads/'.length))
      exists = fs.existsSync(file)
    }

    const next = exists ? v : ''
    if (next !== raw) {
      const kind = next ? '清洗' : '清空（文件已丢）'
      console.log('#' + r.id + ' ' + r.username + ' → ' + kind + '：' + raw.slice(0, 70))
      if (apply) await dbRun('UPDATE users SET avatar = ? WHERE id = ?', [next, r.id])
      if (next) cleaned++; else cleared++
    }
  }
  console.log('')
  console.log('共检查 ' + rows.length + ' 个有头像的用户：清洗 ' + cleaned + '，清空 ' + cleared)
  if (!apply) console.log('（当前是预览模式，加 --apply 才会写库）')
  process.exit(0)
})().catch((e) => { console.error(e.message); process.exit(1) })
