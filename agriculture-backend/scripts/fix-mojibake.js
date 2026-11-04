#!/usr/bin/env node
/**
 * 修复文本里的乱码（U+FFFD 替换字符）
 *
 * 背景：早期 AI 生成/导入的部分字段里混入了 �（显示为 �），
 * 例如「种植前检查苗木是��带病」——原字符在编码转换时丢了。
 *
 * 做法：把含乱码的字段连同上下文发给 DeepSeek，让它补全成通顺的中文；
 *      校验「修复后不再含 �」且 JSON 字段仍能解析后才写库。
 *
 *   node scripts/fix-mojibake.js --dry-run    # 只看会改成什么，不写库
 *   node scripts/fix-mojibake.js --only=40    # 只处理某一条
 *   node scripts/fix-mojibake.js              # 实际写库
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const https = require('https')
const { dbAll, dbRun } = require('../config/db')

const DRY = process.argv.includes('--dry-run')
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1]
const BAD = '\uFFFD'
const FIELDS = ['symptom', 'cause', 'spread', 'occurrence', 'medicines', 'suggestions', 'prevention', 'host', 'period']
const KEY = process.env.DEEPSEEK_API_KEY || ''
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-flash'

if (!KEY) { console.error('未配置 DEEPSEEK_API_KEY'); process.exit(1) }

function callAI(messages, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ model: MODEL, messages, temperature: 0.2, max_tokens: 2000 })
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: {
        Authorization: 'Bearer ' + KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: timeoutMs
    }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => {
        try {
          const j = JSON.parse(body)
          if (j.choices && j.choices[0]) return resolve(j.choices[0].message.content || '')
          reject(new Error((j.error && j.error.message) || 'AI 无返回'))
        } catch (e) { reject(new Error('AI 返回格式异常')) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('AI 超时')) })
    req.write(data)
    req.end()
  })
}

function jsonClean(text) {
  const s = String(text || '').trim()
  const m = s.match(/\{[\s\S]*\}/)
  return JSON.parse(m ? m[0] : s)
}

async function repairField(row, field, value) {
  const isJson = /^\s*[\[]/.test(String(value))
  const prompt = [
    '下面是一条农业病虫害资料，某个字段里出现了乱码（\ufffd 表示缺失的字符）。',
    '请根据上下文把乱码补成正确的中文，保持原意、原长度风格，不要添加解释。',
    '',
    '病害：' + row.name + (row.host ? '（寄主：' + row.host + '）' : ''),
    '字段：' + field,
    '原文：',
    String(value).replace(/\uFFFD/g, '\uFFFD'),
    '',
    isJson
      ? '要求：原字段是 JSON 数组，请输出同样结构的 JSON 数组，只替换含乱码的那几项，其余项原样保留。只输出 JSON。'
      : '要求：输出修复后的完整文本（纯文本，不要 JSON）。'
  ].join('\n')

  const out = await callAI([
    { role: 'system', content: '你是严谨的中文农业技术编辑，只做补字修复，不改写内容。' },
    { role: 'user', content: prompt }
  ])

  if (isJson) {
    const arr = jsonClean(out)
    if (!Array.isArray(arr)) throw new Error('AI 返回的不是数组')
    const text = JSON.stringify(arr)
    if (text.includes(BAD)) throw new Error('修复后仍有乱码')
    return text
  }
  const text = String(out).trim().replace(/^["']|["']$/g, '')
  if (!text || text.includes(BAD)) throw new Error('修复后仍有乱码或为空')
  if (text.length > String(value).length * 2) throw new Error('修复结果长度异常')
  return text
}

async function main() {
  const where = FIELDS.map((f) => f + " LIKE '%" + BAD + "%'").join(' OR ')
  let rows = await dbAll('SELECT * FROM diseases WHERE ' + where + ' ORDER BY verified DESC, id')
  if (ONLY) rows = rows.filter((r) => String(r.id) === ONLY)

  console.log('待修复记录：' + rows.length + (DRY ? '（预演，不写库）' : ''))
  let fixed = 0, failed = 0

  for (const row of rows) {
    const updates = {}
    for (const f of FIELDS) {
      const v = row[f]
      if (!v || !String(v).includes(BAD)) continue
      try {
        let ok
        try {
          ok = await repairField(row, f, v)
        } catch (e1) {
          ok = await repairField(row, f, v) // 重试一次（多因 JSON 被截断）
        }
        updates[f] = ok
        if (DRY) {
          console.log('\n#' + row.id + ' ' + row.name + ' [' + f + ']')
          // JSON 字段只打印"含乱码的那几项"，纯文本整体打印
          let beforeItems = [], afterItems = []
          try { beforeItems = JSON.parse(v) } catch (e) { beforeItems = null }
          if (Array.isArray(beforeItems)) {
            try { afterItems = JSON.parse(ok) } catch (e) { afterItems = [] }
            beforeItems.forEach((item, idx) => {
              if (String(item).includes(BAD)) {
                console.log('  前：' + String(item).replace(/\uFFFD/g, '【?】'))
                console.log('  后：' + String(afterItems[idx] || '(缺失)'))
              }
            })
          } else {
            console.log('  前：' + String(v).replace(/\uFFFD/g, '【?】').slice(0, 160))
            console.log('  后：' + String(ok).slice(0, 160))
          }
        }
      } catch (e) {
        failed++
        console.log('  ✗ #' + row.id + ' ' + row.name + ' [' + f + '] ' + e.message)
      }
    }
    const keys = Object.keys(updates)
    if (!keys.length || DRY) continue
    await dbRun(
      'UPDATE diseases SET ' + keys.map((k) => k + ' = ?').join(', ') + ' WHERE id = ?',
      keys.map((k) => updates[k]).concat([row.id])
    )
    fixed++
    console.log('✅ #' + row.id + ' ' + row.name + ' 修复字段：' + keys.join(', '))
  }

  console.log('\n完成：成功 ' + fixed + ' 条' + (DRY ? '（预演）' : '') + '，失败字段 ' + failed)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
