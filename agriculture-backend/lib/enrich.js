// ==================================================================
// 百科资料 AI 补全
//
// 抽成独立模块的原因：网页接口（routes/disease.js）和管理后台
// （routes/admin.js）都要用，避免复制两份维护。
//
// 设计原则：只填空缺，绝不覆盖已有内容；人工纠正过的记录跳过。
// ==================================================================
const https = require('https')
const { dbRun, dbAll } = require('../config/db')

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-flash'

function callDeepSeek(payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload)
    const req = https.request({
      hostname: 'api.deepseek.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + DEEPSEEK_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: timeoutMs || 60000
    }, (res) => {
      let body = ''
      res.on('data', (ch) => { body += ch })
      res.on('end', () => {
        try {
          const json = JSON.parse(body)
          if (json.choices && json.choices[0] && json.choices[0].message) {
            resolve(json.choices[0].message.content || '')
          } else {
            reject(new Error((json.error && json.error.message) || 'AI 未返回内容'))
          }
        } catch (e) { reject(new Error('AI 返回格式异常')) }
      })
    })
    req.on('error', (e) => reject(e))
    req.on('timeout', () => { req.destroy(); reject(new Error('AI 响应超时')) })
    req.write(data)
    req.end()
  })
}

// 去掉 AI 诊断过程留下的标记段落
function stripAiMarks(s) {
  return String(s == null ? '' : s)
    .split('【鉴别诊断】')[0]
    .split('【图像证据】')[0]
    .trim()
}

// 文本信息量打分
function textScore(s) {
  const t = stripAiMarks(s)
  if (!t) return 0
  let score = t.length
  const parts = (t.match(/[；;。\n]/g) || []).length
  score += Math.min(parts * 6, 30)
  return score
}

// 列表字段解析
function asList(v) {
  if (Array.isArray(v)) return v.filter(Boolean)
  const s = String(v == null ? '' : v).trim()
  if (!s) return []
  try {
    const a = JSON.parse(s)
    if (Array.isArray(a)) return a.filter(Boolean)
  } catch (e) { /* 非 JSON */ }
  return s.split(/[;；\n]/).map((x) => x.trim()).filter(Boolean)
}

// 判断一条记录缺哪些字段
function missingFields(d) {
  const need = []
  if (textScore(d.symptom) < 40) need.push('symptom')
  if (!String(d.cause || '').trim()) need.push('cause')
  if (!String(d.spread || '').trim()) need.push('spread')
  if (!String(d.occurrence || '').trim()) need.push('occurrence')
  if (!asList(d.medicines).length) need.push('medicines')
  if (!asList(d.suggestions).length) need.push('suggestions')
  if (!asList(d.prevention).length) need.push('prevention')
  return need
}

/**
 * 补全病害资料。
 * @param {object} opts
 * @param {number[]} opts.ids      指定条目（不传则自动挑最缺的）
 * @param {number}   opts.limit    自动挑选时的条数（默认 3，上限 5）
 * @param {boolean}  opts.dryRun   只检查缺什么，不改库
 * @returns {Promise<{total:number, items:object[], dryRun:boolean}>}
 */
async function enrichDiseases(opts) {
  const o = opts || {}
  if (!DEEPSEEK_API_KEY) throw new Error('未配置 DEEPSEEK_API_KEY')

  const dryRun = !!o.dryRun
  const limit = Math.min(Number(o.limit) || 3, 5)
  const ids = Array.isArray(o.ids) ? o.ids.map(Number).filter(Boolean) : []

  let targets
  if (ids.length) {
    targets = await dbAll(
      'SELECT * FROM diseases WHERE id IN (' + ids.map(() => '?').join(',') + ')', ids
    )
  } else {
    // 没症状的最优先，其次症状最短的；跳过人工纠正过的
    targets = await dbAll(
      "SELECT * FROM diseases WHERE COALESCE(category,'') <> '用户人工纠正' " +
      "ORDER BY (symptom IS NULL OR symptom = '') DESC, LENGTH(COALESCE(symptom,'')) ASC LIMIT ?",
      [limit]
    )
  }
  if (!targets.length) return { total: 0, items: [], dryRun }

  const results = []
  for (const d of targets) {
    const need = missingFields(d)
    if (!need.length) { results.push({ id: d.id, name: d.name, skipped: '资料已完整' }); continue }
    if (dryRun) { results.push({ id: d.id, name: d.name, need }); continue }

    console.log('📚 补全百科 #' + d.id + '「' + d.name + '」缺失: ' + need.join(', '))

    const prompt = '你是农业植保专家。请为病害「' + d.name + '」' +
      (d.type ? '（类型：' + d.type + '）' : '') + '补充权威、准确的资料。' +
      '只回答 JSON，字段如下：' +
      '{"symptom":"发病症状（80-150字，包含病斑形态/颜色/部位/发展趋势）",' +
      '"cause":"病原与诱因（40-80字）",' +
      '"spread":"传播途径（40-80字）",' +
      '"occurrence":"发病规律（40-80字，温度湿度条件、高发时期）",' +
      '"medicines":[{"name":"药剂名（含剂型）","usage":"稀释倍数、用药时期、间隔天数、注意事项"}],' +
      '"suggestions":["防治建议，每条20-40字"],' +
      '"prevention":["预防措施，每条20-40字"]}' +
      '要求：药剂写 2-3 种，建议与预防各 3-4 条；只写确实适用于该病害的内容，不要编造。'

    let gen = null
    try {
      const content = await callDeepSeek({
        model: DEEPSEEK_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1400,
        temperature: 0.3,
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' }
      }, 60000)
      let s = String(content || '').trim()
      if (s.indexOf('```') >= 0) s = s.replace(/```json?/gi, '').replace(/```/g, '').trim()
      gen = JSON.parse(s)
    } catch (e) {
      console.error('补全 #' + d.id + ' 失败:', e.message)
      results.push({ id: d.id, name: d.name, error: e.message })
      continue
    }

    // 只写入 need 里的字段
    const sets = []
    const vals = []
    for (const f of need) {
      const val = gen[f]
      if (val == null || (Array.isArray(val) && !val.length) || val === '') continue
      sets.push(f + ' = ?')
      vals.push(Array.isArray(val) ? JSON.stringify(val) : stripAiMarks(val))
    }
    if (!sets.length) { results.push({ id: d.id, name: d.name, skipped: 'AI 没返回可用内容' }); continue }

    vals.push(d.id)
    await dbRun('UPDATE diseases SET ' + sets.join(', ') + ' WHERE id = ?', vals)
    results.push({ id: d.id, name: d.name, filled: sets.map((x) => x.split(' ')[0]) })
  }

  return { total: results.length, items: results, dryRun }
}

module.exports = { enrichDiseases, missingFields, textScore, asList, stripAiMarks }
