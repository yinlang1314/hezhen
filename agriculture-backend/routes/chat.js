// ==================================================================
// AI 农业问答机器人
//
// 设计要点：
//   1. 复用同一个 DeepSeek 密钥（和识图诊断同一套配置）
//   2. 用「农业专家」系统提示词把回答限定在农业范围内，避免跑题
//   3. 每次都把本地病害库的名称/症状摘要塞进上下文，
//      让 AI 优先用项目里已有的知识回答，而不是泛泛而谈
//   4. 支持多轮对话（前端把历史一起传上来）
// ==================================================================
const express = require('express')
const https = require('https')
const router = express.Router()
const { dbAll } = require('../config/db')
const rateLimit = require('../middleware/rateLimit')

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-flash'

// 最多保留多少轮历史（防止请求体过大、费用过高）
const MAX_HISTORY = 8
const MAX_QUESTION = 500

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
      timeout: timeoutMs || 45000
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
        } catch (e) {
          reject(new Error('AI 返回格式异常'))
        }
      })
    })
    req.on('error', (e) => reject(e))
    req.on('timeout', () => { req.destroy(); reject(new Error('AI 响应超时，请稍后再试')) })
    req.write(data)
    req.end()
  })
}

// 把本地病害库压缩成一段上下文（只取名称/类型/症状开头，控制长度）
let _kbCache = null
let _kbAt = 0
async function knowledgeContext() {
  const now = Date.now()
  if (_kbCache && now - _kbAt < 10 * 60 * 1000) return _kbCache
  try {
    const rows = await dbAll('SELECT name, type, level_text, symptom FROM diseases LIMIT 60')
    _kbCache = rows.map((r) => {
      const sym = String(r.symptom || '')
        .split('【鉴别诊断】')[0]
        .replace(/\s+/g, '')
        .slice(0, 60)
      return '- ' + r.name + (r.type ? ' (' + r.type + ')' : '') + (sym ? '：' + sym : '')
    }).join('\n')
    _kbAt = now
    return _kbCache
  } catch (e) {
    return ''
  }
}

const SYSTEM_PROMPT = '你是「禾诊」系统的农业技术顾问，擅长作物病虫害识别与防治、栽培管理、施肥灌溉。' +
  '回答要求：' +
  '1) 只回答农业相关问题；如果用户问的是无关话题（如写代码、闲聊、政治），礼貌说明你只懂农业，并把话题引回农业。' +
  '2) 优先使用下面提供的【本地病害库】信息作答；库里没有的，可以用通用农业知识回答，但要说明这是通用建议。' +
  '3) 涉及用药必须给出具体药剂名 + 稀释倍数/用量 + 安全间隔期，并提醒按标签使用、注意轮换用药。' +
  '4) 回答用中文，条理清晰，必要时分点；控制在 300 字以内，不要长篇大论。' +
  '5) 不确定的信息要如实说明，不要编造具体的试验数据。'

router.post('/ask',
  rateLimit({ windowMs: 60 * 1000, max: 8, message: '提问太频繁了，请稍后再试' }),
  async (req, res) => {
    try {
      if (!DEEPSEEK_API_KEY) {
        return res.json({ code: 500, message: '后端未配置 DEEPSEEK_API_KEY，无法使用 AI 问答' })
      }
      const question = String((req.body && req.body.question) || '').trim()
      if (!question) return res.json({ code: 400, message: '请输入问题' })
      if (question.length > MAX_QUESTION) {
        return res.json({ code: 400, message: '问题太长了，请精简到 ' + MAX_QUESTION + ' 字以内' })
      }

      // 历史对话（前端传 [{role:'user'|'assistant', content}]）
      const rawHistory = Array.isArray(req.body.history) ? req.body.history : []
      const history = rawHistory
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
        .slice(-MAX_HISTORY)
        .map((m) => ({ role: m.role, content: String(m.content).slice(0, 800) }))

      const kb = await knowledgeContext()
      const messages = [{ role: 'system', content: SYSTEM_PROMPT + (kb ? '\n\n【本地病害库】\n' + kb : '') }]
        .concat(history)
        .concat([{ role: 'user', content: question }])

      console.log('🤖 AI 问答：' + question.slice(0, 40) + (question.length > 40 ? '…' : ''))
      const answer = await callDeepSeek({
        model: DEEPSEEK_MODEL,
        messages,
        max_tokens: 900,
        temperature: 0.4,
        thinking: { type: 'disabled' }
      }, 45000)

      const text = String(answer || '').trim()
      if (!text) return res.json({ code: 500, message: 'AI 没有返回内容，请换个说法再问' })

      res.json({ code: 200, message: 'ok', data: { answer: text } })
    } catch (err) {
      console.error('AI 问答失败:', err.message)
      res.json({ code: 500, message: 'AI 问答失败：' + err.message })
    }
  })

module.exports = router
