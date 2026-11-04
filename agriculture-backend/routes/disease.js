const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const fsp = fs.promises;
const { dbRun, dbGet, dbAll, safeParseJSON } = require('../config/db');
const rateLimit = require('../middleware/rateLimit');

// ================== 核心配置 ==================
// 不再写死后端 IP：图片统一返回相对地址（/uploads/xxx.jpg），
// 由前端 utils/config.js 按当前后端地址拼完整 URL。换 IP / 换电脑都不用改这里。
const UPLOAD_PATH_PREFIX = '/uploads/'
const { JWT_SECRET } = require('../config/secrets')
// 需要绝对地址时（如后台管理页）可用，可用环境变量 PUBLIC_BASE_URL 覆盖
function publicBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  return req.protocol + '://' + req.get('host');
}
// 把库里的图片路径规范化为相对地址
// 注意：/uploads/ 里的图片是用户上传/本地素材，不在 Git 仓库里。
// 别人 clone 后这些文件不存在，直接返回路径会给前端一个 404 的破图，
// 所以这里检查文件是否存在，不存在就返回空串（前端显示「暂无配图」）。
function toRelativeImage(p) {
  if (!p) return '';
  const s = String(p).trim();
  const m = s.match(/\/uploads\/[^?#]+/);
  const rel = m ? m[0] : (s.charAt(0) === '/' ? s : (UPLOAD_PATH_PREFIX + s));
  if (rel.indexOf('/uploads/') === 0) {
    try {
      if (!fs.existsSync(path.join(__dirname, '..', 'public', rel.slice(1)))) return '';
    } catch (e) {
      return '';
    }
  }
  return rel;
}
const UPLOAD_DIR = path.join(__dirname, '../public/uploads');
// ==========================================================

// 文件上传配置
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    let ext = path.extname(String(file.originalname || '')).toLowerCase();
    if (!ext) {
      const m = String(file.mimetype || '').toLowerCase();
      ext = m.includes('png') ? '.png' : m.includes('webp') ? '.webp' : m.includes('gif') ? '.gif' : '.jpg';
    }
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, 'disease-' + uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const name = String(file.originalname || '');
    const ext = path.extname(name).toLowerCase();
    // 浏览器（H5 相册 / 摄像头抓帧）上传的 blob URL 没有扩展名，只校验 mimetype
    const isBlob = !ext || /^blob:/i.test(name) || /^data:/i.test(name);
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('仅支持上传图片文件！'), false);
    }
    if (!isBlob && !allowedExts.includes(ext)) {
      return cb(new Error('仅支持 jpg / png / webp / gif 格式的图片'), false);
    }
    cb(null, true);
  }
});

const handleMulterError = (err, req, res, next) => {
  if (err) {
    // 所有 /api 开头的上传都返回 JSON（前端才能正确显示错误信息）。
    // 原来只判断 /recognize，导致 /upload 遇到非法文件时返回 HTML，前端解析出错。
    const isApi = (req.baseUrl + req.path).startsWith('/api') || req.path.startsWith('/recognize') || req.path.startsWith('/upload');
    if (isApi) {
      return res.json({ code: 400, message: err.message || '文件上传失败' });
    }
    return res.redirect(`/admin/diseases?error=${encodeURIComponent(err.message)}`);
  }
  next();
};

async function deleteFileIfExists(relativePath) {
  if (!relativePath) return;
  const fullPath = path.join(__dirname, '../public', relativePath);
  try {
    await fsp.unlink(fullPath);
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('删除旧文件失败:', err);
  }
}

// ==================== 前端 API ====================

// 获取病虫害列表（支持分页 ?page=1&pageSize=10）
router.get('/diseases/list', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const pageSize = parseInt(req.query.pageSize) || 20
    const offset = (page - 1) * pageSize
    const keyword = req.query.keyword || ''

    // 只展示已核实的数据：AI 生成/自动收录的先在后台审核，避免假数据进 App
    let whereClause = 'WHERE verified = 1'
    let params = []
    if (keyword) {
      whereClause += ' AND (name LIKE ? OR symptom LIKE ? OR type LIKE ?)'
      params = [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`]
    }

    const total = await dbGet(`SELECT COUNT(*) as cnt FROM diseases ${whereClause}`, params)
    const list = await dbAll(
      `SELECT * FROM diseases ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )

    const result = list.map(item => ({
      ...item,
      image: toRelativeImage(item.image),
      medicines: safeParseJSON(item.medicines),
      suggestions: safeParseJSON(item.suggestions),
      prevention: safeParseJSON(item.prevention)
    }))

    res.json({
      code: 200,
      data: {
        list: result,
        total: total?.cnt || 0,
        page,
        pageSize,
        totalPages: Math.ceil((total?.cnt || 0) / pageSize)
      },
      msg: '获取成功'
    })
  } catch (err) {
    console.error('获取病虫害数据失败:', err);
    res.json({ code: 500, data: { list: [], total: 0 }, msg: '服务器异常' });
  }
});

// 获取病虫害详情
router.get('/detail', async (req, res) => {
  try {
    const { id } = req.query;
    const info = await dbGet('SELECT * FROM diseases WHERE id = ? AND verified = 1', [id]);
    if (!info) return res.json({ code: 400, message: '暂无该病虫害数据' });
    info.image = toRelativeImage(info.image);
    info.medicines = safeParseJSON(info.medicines);
    info.suggestions = safeParseJSON(info.suggestions);
    info.prevention = safeParseJSON(info.prevention);
    res.json({ code: 200, data: info });
  } catch (err) {
    res.json({ code: 500, message: '获取详情失败' });
  }
});

// ===== DeepSeek 智能推理 + 百度AI 植物识别 =====
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''
const BAIDU_API_KEY = process.env.BAIDU_API_KEY || ''
const BAIDU_SECRET_KEY = process.env.BAIDU_SECRET_KEY || ''
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-flash'
const https = require('https')
const { enrichDiseases, missingFields } = require('../lib/enrich')
const querystring = require('querystring')
const crypto = require('crypto')

// 统一的 DeepSeek 请求
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
      timeout: timeoutMs || 40000
    }, (res) => {
      let body = ''
      res.on('data', (ch) => { body += ch })
      res.on('end', () => {
        try {
          const json = JSON.parse(body)
          if (json.choices && json.choices[0]) {
            resolve((json.choices[0].message && json.choices[0].message.content) || '')
          } else {
            reject(new Error((json.error && json.error.message) || 'DeepSeek 返回异常'))
          }
        } catch (e) { reject(new Error('DeepSeek 响应解析失败')) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('DeepSeek 请求超时')) })
    req.write(data)
    req.end()
  })
}

// 根据植物名推理可能病害（百度识别成功、但没有 DeepSeek 识图时使用）
function callDeepSeekReasoning(plantName, plantDescription) {
  const prompt = '已知一种植物被识别为「' + plantName + '」' +
    (plantDescription ? '，描述：' + plantDescription : '') +
    '。请根据农业知识，判断该植物当前最可能患的病虫害。只回复一行：病害名称|置信度% 。例如：柑橘溃疡病|92%'
  return callDeepSeek(payloadOf(prompt), 30000).then((content) =>
    (content || '').trim().split('\n').pop().trim()
  )
  function payloadOf(text) {
    return {
      model: DEEPSEEK_MODEL,
      messages: [{ role: 'user', content: text }],
      max_tokens: 200,
      temperature: 0.1,
      thinking: { type: 'disabled' }
    }
  }
}

// 直接用 DeepSeek 识图（不需要百度）：识别植物 + 判断病害，返回结构化 JSON
// 快速识别：只求病名 + 置信度（给实时监测用，1~2 秒出结果）
async function callDeepSeekVisionFast(imageBuffer, mime) {
  const b64 = imageBuffer.toString('base64')
  const prompt = '只输出 JSON：{"plantName":"作物名","diseaseName":"病害全名","confidence":0到100的整数,"level":1到3}。' +
    '画面里没有植物时 plantName 填「未识别到植物」，confidence 填 0。'
  const content = await callDeepSeek({
    model: DEEPSEEK_MODEL,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: 'data:' + mime + ';base64,' + b64 } },
        { type: 'text', text: prompt }
      ]
    }],
    max_tokens: 120,
    temperature: 0,
    thinking: { type: 'disabled' },
    response_format: { type: 'json_object' }
  }, 30000)
  let s = String(content || '').trim()
  const a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a < 0 || b < 0) throw new Error('快速识别未返回 JSON：' + s.slice(0, 80))
  const j = JSON.parse(s.slice(a, b + 1))
  let num = Number(j.confidence)
  if (isNaN(num)) num = 0
  if (num > 0 && num <= 1) num = num * 100   // 模型有时返回 0~1
  j.confidence = Math.max(0, Math.min(100, Math.round(num)))
  const lv = parseInt(j.level)
  j.level = isNaN(lv) ? 2 : Math.max(1, Math.min(3, lv))
  return j
}

async function callDeepSeekVision(imageBuffer, mime, hint) {
  const b64 = imageBuffer.toString('base64')
  // 证据优先 + 强制鉴别诊断：先描述可见特征，再排除相似病，最后给结论。
  // 关键原则：孢子堆/霉层属于条件性症状，照片里没有【不能】作为排除依据。
  const prompt = '你是植物病理学专家，正在根据一张叶片照片做诊断。\n' +
    '一、先客观描述可见证据（不要急着下结论）：病斑形状（圆形/不规则/受叶脉限制呈多角形）、' +
    '病斑边缘（颜色深浅、是否清晰、有无黄色晕圈）、病斑中心（灰白/同心轮纹/小黑点/粉红色黏质孢子堆）、' +
    '病斑大小与分布位置、叶片是否卷曲焦枯、有无霉层。\n' +
    '二、列出 2-3 个鉴别诊断，逐个说明支持证据与排除理由。\n' +
    '三、重要诊断原则：孢子堆、霉层等属于【条件性症状】，只在潮湿条件下出现，' +
    '照片里看不到它们【不能】作为排除某种病害的理由。判断应以病斑形态、边缘颜色、' +
    '轮纹有无、穿孔与否、扩展方式等【病斑本身特征】为主要依据。\n' +
    '四、常见混淆病鉴别要点：炭疽病=不规则大坏死斑、边缘深色隆起、潮湿时现粉红色黏质孢子堆、后期易穿孔；' +
    '褐斑病（轮纹病）=近圆形褐斑、边缘清晰、后期中心灰白并具明显同心轮纹；黑斑病=病斑较小、近圆形、黑褐色；' +
    '疫病=水渍状暗绿至褐色斑、扩展快、边缘不明显；灰霉病=褐色斑并覆灰褐色霉层；白粉病=叶面白色粉状霉层。\n' +
    (hint ? '五、另一模型识别该植物为「' + hint + '」，如与你的观察不符请以图片为准。\n' : '') +
    '最后【只输出一个 JSON 对象】，不要输出任何其他文字或 markdown 代码块，格式：' +
    '{"plantName":"植物名","diseaseName":"最可能的病害全名","confidence":0到100的整数,' +
    '"evidence":"支持该结论的图像证据","differentials":[{"name":"其他可能病害","why":"支持理由及为何排在后面"}],' +
    '"symptom":"症状描述","cause":"病因","spread":"传播途径","occurrence":"发病规律",' +
    '"level":1到3的整数,"medicines":[{"name":"药名","usage":"用法用量"}],' +
    '"suggestions":["防治建议"],"prevention":["预防措施"]}' +
    '\n若图片中没有植物，plantName 填「未识别到植物」，confidence 填 0。'
  const content = await callDeepSeek({
    model: DEEPSEEK_MODEL,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: 'data:' + mime + ';base64,' + b64 } },
        { type: 'text', text: prompt }
      ]
    }],
    max_tokens: 1600,
    temperature: 0.1,
    thinking: { type: 'disabled' },
    response_format: { type: 'json_object' }
  }, 60000)
  let s = String(content || '').trim()
  // 兼容被 markdown 代码块包裹的情况
  if (s.indexOf('```') >= 0) s = s.replace(/" + BT3 + "(?:json)?/gi, '').trim()
  const a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a < 0 || b < 0) throw new Error('DeepSeek 未返回 JSON，实际返回：' + s.slice(0, 120))
  const j = JSON.parse(s.slice(a, b + 1))
  const num = parseInt(j.confidence)
  j.confidence = isNaN(num) ? 80 : Math.max(0, Math.min(100, num))
  const lv = parseInt(j.level)
  j.level = isNaN(lv) ? 2 : Math.max(1, Math.min(3, lv))
  if (!Array.isArray(j.differentials)) j.differentials = []
  j.evidence = String(j.evidence || '')
  return j
}

// 去掉植物名前缀，只比较“病/虫害”部分：牡丹炭疽病 -> 炭疽病
function normalizeDiseaseName(name) {
  return String(name || '')
    .replace(/[\s（）()【】\[\]]/g, '')
    .replace(/(虫害|害虫|病害|病)$/, '')
    .trim()
}

function bigrams(s) {
  const out = []
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2))
  return out
}

// 病名相似度 0~1：完全相同=1；包含关系=0.8；否则按二元组重合度算
function nameScore(a, b) {
  const x = normalizeDiseaseName(a)
  const y = normalizeDiseaseName(b)
  if (!x || !y) return 0
  if (x === y) return 1
  if (x.indexOf(y) >= 0 || y.indexOf(x) >= 0) return 0.8
  const A = new Set(bigrams(x))
  const B = new Set(bigrams(y))
  let inter = 0
  A.forEach((g) => { if (B.has(g)) inter++ })
  const dice = (2 * inter) / (A.size + B.size || 1)
  const lenRatio = Math.min(x.length, y.length) / Math.max(x.length, y.length)
  return dice * lenRatio
}

// 在本地库里找最相似的病害；低于阈值就认为“本地库没有这个病”
async function matchLocalDisease(name) {
  const all = await dbAll('SELECT * FROM diseases WHERE verified = 1')
  let best = null
  let bestScore = 0
  for (const row of all) {
    const s = nameScore(name, row.name)
    if (s > bestScore) { bestScore = s; best = row }
  }
  if (best && bestScore >= 0.72) {
    best.__score = bestScore
    return best
  }
  return null
}

// 本地库没有这个病时，把 AI 诊断结果学进知识库 —— 用的越多越全
// 病名清洗：把「（Exserohilum turcicum 引起）」这类拉丁学名括号去掉，避免同一病害被收录成多条
function cleanDiseaseName(name) {
  let s = String(name || '')
  s = s.replace(/（[^）]*[A-Za-z][^）]*）/g, '')      // 含拉丁学名的括号
  s = s.replace(/\([^)]*[A-Za-z][^)]*\)/g, '')      // 半角同理
  s = s.replace(/（(?:由|为|属)[^）]*）/g, '')        // （由…引起）
  s = s.replace(/（[^）]*(?:引起|所致|侵染)）/g, '')    // （…所致）
  return s.replace(/\s+/g, ' ').trim()
}

// 判断是不是同一种：病/虫 不能混为一谈（白粉虱 ≠ 白粉病）
const PEST_CHARS = /[虫虱螨蛾螟蝇蚧蝗蝽象蚁蜂蚜蓟马]/
function diseaseKind(name) {
  return PEST_CHARS.test(String(name || '')) ? 'pest' : 'disease'
}
function sameDisease(a, b) {
  if (!a || !b) return false
  if (diseaseKind(a) !== diseaseKind(b)) return false
  return nameScore(a, b) >= 0.72
}

async function autoLearnDisease(out) {
  try {
    if (!out || !out.name || out.name.indexOf('未识别') === 0) return
    // 置信度太低、名字太虚的，不往知识库里塞
    const conf = Number(out.confidence || 0)
    if (conf > 0 && conf < 60) { console.log('⏭ 置信度 ' + conf + '% 偏低，跳过收录：' + out.name); return }
    const cleaned = cleanDiseaseName(out.name)
    if (!cleaned || cleaned.length < 2 || /未知|无法判断/.test(cleaned)) return
    out.name = cleaned
    const all = await dbAll('SELECT id, name FROM diseases')
    for (const row of all) {
      if (sameDisease(out.name, row.name)) return
    }
    // 唯一索引 + 先查一次，正常不会冲突；并发时 INSERT 可能报 UNIQUE，忽略即可
    const type = out.plantName && out.plantName !== '未识别到植物' ? (out.plantName + '病害') : 'AI 识别'
    const levelText = out.level === 1 ? '轻度危害' : out.level === 3 ? '重度危害' : '中度危害'
    await dbRun(
      'INSERT INTO diseases (name, type, category, level, level_text, image, verified, symptom, cause, spread, occurrence, medicines, suggestions, prevention) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)',
      [out.name, type, 'AI 自动收录（待核实）', out.level || 2, levelText, out.image || '',
       (out.symptom || '') + (out.differentials && out.differentials.length
         ? '\n【鉴别诊断】' + out.differentials.map((d) => d.name + '：' + (d.why || '')).join('；')
         : '') + (out.evidence ? '\n【图像证据】' + out.evidence : ''),
       out.cause || '', out.spread || '', out.occurrence || '',
       JSON.stringify(out.medicines || []), JSON.stringify(out.suggestions || []), JSON.stringify(out.prevention || [])]
    )
    console.log('📚 本地知识库新增病害：' + out.name + '（来自 AI 诊断，下次可直接匹配）')
  } catch (e) {
    if (String(e.message).indexOf('UNIQUE') >= 0) return   // 已被其它请求收录，忽略
    console.error('自动收录病害失败:', e.message)
  }
}

// 图片特征 → 稳定的“伪随机”：同一张图永远给出同一条结果（演示用，不随机乱跳）
function pickStable(diseases, buffer) {
  const h = crypto.createHash('md5').update(buffer || Buffer.from('seed')).digest()
  return diseases[h[0] % diseases.length]
}

// 判断 AI 是否明确表示“图里没有可识别的植物/病害”
function isNoPlantResult(p) {
  if (!p) return false
  const plant = String(p.plantName || '').trim()
  const disease = String(p.diseaseName || '').trim()
  const PLANT_EMPTY = ['未识别到植物', '未知植物', '未知', '无', '非植物', '识别失败', '']
  const DISEASE_EMPTY = ['无', '未知', '未知病害', '无病害', '健康', '']
  if (PLANT_EMPTY.indexOf(plant) >= 0) return true
  if (DISEASE_EMPTY.indexOf(disease) >= 0 && Number(p.confidence) <= 5) return true
  return false
}

function mimeOf(filename) {
  const ext = String(filename || '').toLowerCase().split('.').pop()
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/jpeg'
}

// 把 DeepSeek/百度的结果与本地库合并：本地库有就用本地库的完整防治方案
function mergeWithLocal(picked, local, imagePath) {
  const d = local || {}
  const arr = (v, fallback) => {
    if (Array.isArray(v) && v.length) return v
    const parsed = safeParseJSON(v)
    return parsed.length ? parsed : (fallback || [])
  }
  const level = picked.level || d.level || 2
  const LEVEL_TEXT = { 1: '轻度危害', 2: '中度危害', 3: '重度危害' }
  // 相似度不高时（例如 AI 只说“蚜虫”，本地库有“梨二叉蚜虫害虫害”），
  // 不能把本地库更具体的名字当成 AI 的结论显示
  const score = Number(picked.nameScore || 0)
  const displayName = (d.name && score >= 0.85) ? d.name : (picked.diseaseName || d.name || '未知病害')
  return {
    name: displayName,
    plantName: picked.plantName || '',
    type: d.type || picked.type || '',
    category: d.category || '',
    level: level,
    levelText: d.level_text || LEVEL_TEXT[level] || '中度危害',
    confidence: picked.confidence || 80,
    image: toRelativeImage(imagePath),
    symptom: d.symptom || picked.symptom || '',
    cause: d.cause || picked.cause || '',
    spread: d.spread || picked.spread || '',
    occurrence: d.occurrence || picked.occurrence || '',
    medicines: d.medicines ? arr(d.medicines) : arr(picked.medicines),
    suggestions: d.suggestions ? arr(d.suggestions) : arr(picked.suggestions),
    prevention: d.prevention ? arr(d.prevention) : arr(picked.prevention),
    apiSource: picked.apiSource || 'AI',
    matched: !!(d && d.name),
    matchScore: picked.nameScore || 0,
    learned: picked.learned || false,
    evidence: picked.evidence || '',
    differentials: Array.isArray(picked.differentials) ? picked.differentials : [],
    note: picked.note || '',
    mode: 'real'
  }
}
// ==================== 百科 vs AI 结果：字段级对比择优 ====================
// 目标：两边都可能有料。百科是人工/累积的资料，AI 是这次针对这张图的判断。
//   - 文本字段（症状/病因/传播/发病规律）：比“信息量”，明显更好就采用
//   - 列表字段（药剂/防治建议/预防措施）：取并集（多一条建议总比少一条好）
//   - 用户人工纠正过的记录（category === '用户人工纠正'）：不动，尊重人工

// 去掉 AI 诊断过程留下的标记段落（那是给识别用的，不是给百科看的）
function stripAiMarks(s) {
  return String(s == null ? '' : s)
    .split('【鉴别诊断】')[0]
    .split('【图像证据】')[0]
    .trim()
}

// 文本信息量打分：主看长度，有结构（分句/换行）给加成
function textScore(s) {
  const t = stripAiMarks(s)
  if (!t) return 0
  let score = t.length
  // 中文分句、换行、序号都说明内容更有条理
  const parts = (t.match(/[；;。\n]/g) || []).length
  score += Math.min(parts * 6, 30)
  return score
}

// 列表字段解析（兼容字符串 JSON / 数组 / 顿号分隔）
function asList(v) {
  if (Array.isArray(v)) return v.filter(Boolean)
  const s = String(v == null ? '' : v).trim()
  if (!s) return []
  try {
    const a = JSON.parse(s)
    if (Array.isArray(a)) return a.filter(Boolean)
  } catch (e) { /* 不是 JSON，按分隔符切 */ }
  return s.split(/[;；\n]/).map((x) => x.trim()).filter(Boolean)
}

// 列表去重合并
function unionList(a, b) {
  const key = (x) => (typeof x === 'string' ? x : JSON.stringify(x)).replace(/\s/g, '')
  const seen = new Set()
  const out = []
  for (const item of [...asList(a), ...asList(b)]) {
    const kk = key(item)
    if (!kk || seen.has(kk)) continue
    seen.add(kk)
    out.push(item)
  }
  return out
}

// 对比一个百科记录和一次 AI 结果，决定每个字段用谁，并记下哪些字段值得回写
function compareFields(local, ai) {
  const d = local || {}
  const a = ai || {}
  const manual = String(d.category || '') === '用户人工纠正'
  const TEXT_FIELDS = [
    ['symptom', '症状'],
    ['cause', '病因'],
    ['spread', '传播途径'],
    ['occurrence', '发病规律']
  ]
  const LIST_FIELDS = [
    ['medicines', '推荐用药'],
    ['suggestions', '防治建议'],
    ['prevention', '预防措施']
  ]

  const out = {}
  const improved = []        // 百科被补强的字段（用于回写）
  const fromLocal = []       // 采用了百科内容
  const fromAi = []          // 采用了 AI 内容

  // ---- 文本字段：谁的信息量大用谁 ----
  for (const [f, label] of TEXT_FIELDS) {
    const lv = stripAiMarks(d[f])
    const av = stripAiMarks(a[f] || a['ai_' + f])
    const ls = textScore(lv)
    const as = textScore(av)
    if (ls === 0 && as === 0) { out[f] = ''; continue }
    // AI 明显更好（1.3 倍以上）才覆盖，避免同义改写来回抖动
    if (!manual && as > ls * 1.3) {
      out[f] = av
      improved.push(f)
      fromAi.push(label)
    } else {
      out[f] = lv || av
      fromLocal.push(label)
    }
  }

  // ---- 列表字段：取并集（人工纠正过的不动）----
  for (const [f, label] of LIST_FIELDS) {
    const lv = asList(d[f])
    const av = asList(a[f] != null ? a[f] : a['ai_' + f])
    if (manual) { out[f] = lv.length ? lv : av; fromLocal.push(label); continue }
    const merged = unionList(lv, av)
    out[f] = merged
    if (merged.length > lv.length) { improved.push(f); fromAi.push(label) }
    if (merged.length > av.length) fromLocal.push(label)
  }

  // ---- 基本信息：百科没有才用 AI 的 ----
  out.type = d.type || a.type || ''
  out.host = d.host || a.host || ''
  out.period = d.period || a.period || ''
  out.level = d.level || a.level || 2
  out.levelText = d.level_text || a.levelText || '中度危害'

  return { fields: out, improved, fromLocal, fromAi, manual }
}

// 把对比结果回写到百科（只补空/更优的字段，绝不删已有内容）
async function applyEnhancement(local, cmp) {
  if (!local || !local.id) return { updated: false, fields: [] }
  if (cmp.manual) return { updated: false, fields: [], reason: '人工纠正过的记录，不自动改动' }
  const improved = cmp.improved || []
  if (!improved.length) return { updated: false, fields: [] }

  const sets = []
  const vals = []
  for (const f of improved) {
    const v = cmp.fields[f]
    sets.push(f + ' = ?')
    vals.push(Array.isArray(v) ? JSON.stringify(v) : v)
  }
  vals.push(local.id)
  try {
    await dbRun('UPDATE diseases SET ' + sets.join(', ') + ' WHERE id = ?', vals)
    console.log('📝 已用 AI 结果补强百科 #' + local.id + '「' + local.name + '」字段: ' + improved.join(', '))
    return { updated: true, fields: improved }
  } catch (e) {
    console.error('补强百科失败 #' + local.id + ':', e.message)
    return { updated: false, fields: [] }
  }
}


// 识别记录写入历史表（列名必须和表结构一致：image_url / create_time）
// 写入识别记录：保存完整字段，否则历史详情页只显示病名、其它全空
async function saveHistory(userId, out, imagePath) {
  try {
    // 游客（未登录）识别不写库：user_id 为空的记录没有归属，
    // 既不会出现在任何人的「识别记录」里，还会把历史表越攒越脏。
    if (!userId) {
      console.log('ℹ️ 未登录识别，不保存历史记录')
      return null
    }
    const j = (v) => JSON.stringify(Array.isArray(v) ? v : (v || []))
    const res = await dbRun(
      `INSERT INTO histories
        (user_id, disease_name, image_url, image, confidence, level, level_text,
         symptom, spread, occurrence, medicines, suggestions, prevention,
         plant_name, ai_source, evidence, corrected, create_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime("now"))`,
      [userId || null, out.name, imagePath, imagePath, out.confidence || 0, out.level || 2, out.levelText || '中度危害',
       out.symptom || '', out.spread || '', out.occurrence || '',
       j(out.medicines), j(out.suggestions), j(out.prevention),
       out.plantName || '', out.apiSource || '', out.evidence || '', '0']
    )
    return res && res.lastID ? res.lastID : null
  } catch (e) {
    console.error('写入识别记录失败:', e.message)
    return null
  }
}

// 百度 access_token 缓存
let baiduToken = { token: '', expires: 0 }

async function getBaiduToken() {
  if (baiduToken.token && Date.now() < baiduToken.expires) {
    return baiduToken.token
  }
  return new Promise((resolve, reject) => {
    const params = querystring.stringify({
      grant_type: 'client_credentials',
      client_id: BAIDU_API_KEY,
      client_secret: BAIDU_SECRET_KEY
    })
    https.get(`https://aip.baidubce.com/oauth/2.0/token?${params}`, (res) => {
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => {
        try {
          const json = JSON.parse(body)
          if (json.access_token) {
            baiduToken = { token: json.access_token, expires: Date.now() + (json.expires_in - 300) * 1000 }
            resolve(baiduToken.token)
          } else {
            reject(new Error(json.error_description || '获取token失败'))
          }
        } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

// 调用百度植物识别 API
function callBaiduPlantAPI(imageBase64, token) {
  return new Promise((resolve, reject) => {
    const postData = querystring.stringify({ image: imageBase64, top_num: 5, baike_num: 2 })
    const req = https.request({
      hostname: 'aip.baidubce.com',
      path: `/rest/2.0/image-classify/v1/plant?access_token=${token}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30000
    }, (res) => {
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => {
        try { resolve(JSON.parse(body)) }
        catch (e) { reject(new Error('解析失败')) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('超时')) })
    req.write(postData)
    req.end()
  })
}

// 【核心】识别病虫害 — 百度AI + 本地数据库匹配
// 可选鉴权：带了 token 就解析出用户，没带也放行（保证没登录时识别仍可用）
function optionalAuth(req, res, next) {
  const raw = (req.header('Authorization') || req.header('token') || '')
  const token = String(raw).replace(/^Bearer\s+/i, '').trim()
  if (token) {
    try { req.user = require('jsonwebtoken').verify(token, JWT_SECRET) } catch (e) { req.user = null }
  }
  next()
}

router.post('/recognize',
  // 实时监测每 2.5 秒一次 → 24 次/分；普通用户仍受 8 次/分的心理预期约束
  rateLimit({ windowMs: 60 * 1000, max: 60, message: '识别太频繁了' }),
  optionalAuth, upload.single('image'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) return res.json({ code: 400, message: '请上传图片' })
    const imagePath = '/uploads/' + req.file.filename
    const box = { picked: null, apiSource: '', note: '', usedBaidu: false }

    let imageBuffer = null
    let mime = 'image/jpeg'
    try {
      imageBuffer = fs.readFileSync(req.file.path)
      mime = mimeOf(req.file.filename)
    } catch (e) {
      console.error('读取上传图片失败:', e.message)
    }

    // ---------- 0) 快速通道（实时监测专用）：跳过百度，短提示词，1~2 秒 ----------
    const fastMode = String(req.query.fast || '') === '1'
    if (fastMode && DEEPSEEK_API_KEY && imageBuffer) {
      try {
        const t0 = Date.now()
        const v = await callDeepSeekVisionFast(imageBuffer, mime)
        const nameOk = v.plantName && v.plantName !== '未识别到植物'
        const lv = v.level || 2
        const out = {
          name: v.diseaseName || v.plantName || '未识别到植物',
          plantName: v.plantName || '',
          confidence: v.confidence,
          level: lv,
          levelText: lv === 3 ? '重度危害' : lv === 1 ? '轻度危害' : '中度危害',
          apiSource: 'DeepSeek 快速识别',
          fast: true,
          noPlant: !nameOk && !v.diseaseName,
          elapsedMs: Date.now() - t0
        }

        // 从本地知识库补齐细节（不花 AI 费用，几乎零延迟）
        if (v.diseaseName) {
          try {
            const local = await matchLocalDisease(v.diseaseName)
            if (local) {
              const parseArr = (s) => {
                try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : [] } catch (e) { return [] }
              }
              out.diseaseId = local.id
              out.host = local.host || ''
              out.category = local.category || ''
              out.symptom = String(local.symptom || '').slice(0, 120)
              const uniq = (arr, keyFn) => {
                const seen = new Set()
                return arr.filter((x) => {
                  const k = keyFn(x)
                  if (seen.has(k)) return false
                  seen.add(k)
                  return true
                })
              }
              out.medicines = uniq(parseArr(local.medicines), (m) => (m && m.name) || '').slice(0, 3)
              out.suggestions = uniq(parseArr(local.suggestions), (s) => String(s)).slice(0, 2)
              out.prevention = uniq(parseArr(local.prevention), (s) => String(s)).slice(0, 2)
              out.matchedLocal = true
            }
          } catch (e) {
            console.error('查本地知识库失败：', e.message)
          }
        }
        console.log('⚡ 快速识别：' + out.plantName + ' → ' + out.name + ' (' + out.confidence + '%) ' + out.elapsedMs + 'ms')
        return res.json({ code: 200, data: out, message: out.name })
      } catch (e) {
        console.error('快速识别失败，回退完整流程：', e.message)
      }
    }

    // ---------- 1) 百度植物识别 ----------
    let baiduPlant = ''
    let baiduDesc = ''
    if (BAIDU_API_KEY && BAIDU_SECRET_KEY) {
      try {
        console.log('🔍 百度植物识别中...')
        const token = await getBaiduToken()
        const apiResult = await callBaiduPlantAPI(imageBuffer.toString('base64'), token)
        if (apiResult.error_code) throw new Error(apiResult.error_msg || '百度接口报错')
        const top = (apiResult.result || [])[0]
        if (top) {
          baiduPlant = top.name || ''
          baiduDesc = (top.baike_info && top.baike_info.description) || ''
          const score = Math.round((top.score || 0) * 100)
          box.usedBaidu = true
          box.picked = {
            plantName: baiduPlant,
            confidence: score,
            apiSource: '百度植物识别',
            note: '百度识别植物为「' + baiduPlant + '」(置信度 ' + score + '%)'
          }
          console.log('🌿 百度识别：' + baiduPlant + ' (' + score + '%)')
        } else {
          console.log('百度未返回识别结果')
        }
      } catch (e) {
        console.error('百度植物识别失败：', e.message)
      }
    }

    // ---------- 2) DeepSeek 识图 + 判断病害（不需要百度）----------
    if (DEEPSEEK_API_KEY && imageBuffer) {
      try {
        console.log('🧠 DeepSeek 识图中...')
        const v = await callDeepSeekVision(imageBuffer, mime, baiduPlant)
        const nameOk = v.plantName && v.plantName !== '未识别到植物'
        if (nameOk || v.diseaseName) {
          box.picked = {
            plantName: v.plantName || baiduPlant || '',
            diseaseName: v.diseaseName || '',
            confidence: v.confidence,
            symptom: v.symptom,
            cause: v.cause,
            spread: v.spread,
            occurrence: v.occurrence,
            evidence: v.evidence,
            differentials: v.differentials,
            level: v.level,
            medicines: v.medicines,
            suggestions: v.suggestions,
            prevention: v.prevention,
            apiSource: box.usedBaidu ? '百度植物识别 + DeepSeek 诊断' : 'DeepSeek 识图诊断',
            note: 'DeepSeek 判断：' + (v.plantName || '未知植物') + ' → ' + (v.diseaseName || '未知病害') +
                  '（置信度 ' + v.confidence + '%）'
          }
          console.log('🧠 DeepSeek：' + (v.plantName || '?') + ' → ' + (v.diseaseName || '?') + ' (' + v.confidence + '%)')
        }
      } catch (e) {
        console.error('DeepSeek 识图失败：', e.message)
      }
    } else if (DEEPSEEK_API_KEY && baiduPlant) {
      try {
        const dsResult = await callDeepSeekReasoning(baiduPlant, baiduDesc)
        const parts = String(dsResult).split('|')
        const diseaseName = (parts[0] || '').trim().replace(/[#*\-\d.\s]+$/, '')
        const conf = parseInt(parts[1]) || box.picked.confidence
        if (diseaseName) {
          box.picked.diseaseName = diseaseName
          box.picked.confidence = conf
          box.picked.apiSource = '百度植物识别 + DeepSeek 推理'
          box.picked.note = 'DeepSeek 推理病害为「' + diseaseName + '」（置信度 ' + conf + '%）'
        }
      } catch (e) {
        console.error('DeepSeek 推理失败：', e.message)
      }
    }

    // ---------- 2.5) AI 说图里没有植物：如实返回，绝不编造病害 ----------
    if (box.picked && isNoPlantResult(box.picked)) {
      const out = {
        name: '未识别到植物',
        plantName: '',
        type: '',
        category: '',
        level: 1,
        levelText: '无法判断',
        confidence: 0,
        image: toRelativeImage(imagePath),
        symptom: box.picked.symptom || '',
        cause: '',
        spread: '',
        occurrence: '',
        medicines: [],
        suggestions: box.picked.suggestions || ['请上传清晰的植物叶片、茎干或根部照片，尽量让病斑部分占画面主体。'],
        prevention: box.picked.prevention || [],
        apiSource: box.picked.apiSource || 'AI',
        matched: false,
        mode: 'real',
        noPlant: true,
        note: 'AI 判断这张图片里没有可识别的植物，请重新拍摄或更换照片。'
      }
      console.log('ℹ️ AI 未在图片中识别到植物，如实返回（不编造病害）')
      return res.json({ code: 200, data: out, message: out.note })
    }

    // ---------- 3) 用识别到的病害名匹配本地知识库 ----------
    if (box.picked) {
      if (!box.picked.plantName && baiduPlant) box.picked.plantName = baiduPlant
      let local = null
      if (box.picked.diseaseName) local = await matchLocalDisease(box.picked.diseaseName)
      if (!local && box.picked.plantName) local = await matchLocalDisease(box.picked.plantName)
      let extra = ''
      if (local) {
        box.picked.nameScore = local.__score || 0
        extra = (local.__score >= 0.85)
          ? '防治方案来源：本地知识库「' + local.name + '」。'
          : 'AI 诊断为「' + (box.picked.diseaseName || '') + '」，防治方案参考本地知识库中相近的「' + local.name + '」，仅供参考。'
      } else {
        extra = '本地知识库暂无该病害，以下是 AI 给出的诊断与用药建议；本次结果已自动收录进本地库。'
        box.picked.learned = true
      }
      const out = mergeWithLocal(box.picked, local, imagePath)

      // 百科已有这条病害 -> 两边对比择优，把 AI 更完整的部分补回百科；
      // 百科完全没有 -> 收录为新条目。
      if (local) {
        const cmp = compareFields(local, box.picked)
        const enh = await applyEnhancement(local, cmp)
        out.enhanced = enh.updated
        out.enhancedFields = enh.fields || []
        // 本次返回也采用择优后的字段（用户直接看到最好的那份）
        for (const f of (enh.fields || [])) { out[f] = cmp.fields[f] }
        if (enh.updated) out.note = (out.note ? out.note + '　' : '') + '已用本次识别结果补全百科资料'
        // 知识库这条病害还没有配图 → 用本次识别的照片补上（只补一次，置信度要够）
        if ((!local.image || local.image === '') && (box.picked.confidence || 0) >= 70 && imageBuffer) {
          try {
            await dbRun('UPDATE diseases SET image = ? WHERE id = ?', [toRelativeImage(imagePath), local.id])
            out.imageFilled = true
            out.note = (out.note || '') + '　已用本次照片补全知识库配图'
            console.log('🖼 回填病害配图：' + local.name + ' ← ' + imagePath)
          } catch (e) { console.error('回填配图失败:', e.message) }
        }
      } else {
        await autoLearnDisease(out)
      }
      const doubt = (out.differentials && out.differentials.length)
        ? '　需与「' + out.differentials.map((d) => d.name).join('、') + '」鉴别，单张照片无法完全排除。'
        : ''
      out.note = box.picked.note + (extra ? '　' + extra : '') + doubt
      // 实时监测模式会频繁调用，传 save=0 就不写历史（否则每 10 秒一条会刷爆记录）
      const skipSave = String(req.query.save || '') === '0'
      const historyId = skipSave ? null : await saveHistory(req.user && req.user.id, out, imagePath)
      out.historyId = historyId
      out.savedHistory = !!historyId
      out.realtime = skipSave
      console.log('✅ 识别完成：' + out.plantName + ' → ' + out.name + ' (' + out.confidence + '%) [' + out.apiSource + ']')
      return res.json({ code: 200, data: out, message: out.plantName ? out.plantName + '：' + out.name : out.name })
    }

    // ---------- 4) 没有 AI 密钥：默认明确报错，不返回假结果 ----------
    // 只有显式开启 DEMO_MODE=1 时才返回演示数据（用于没配密钥时预览界面）
    if (String(process.env.DEMO_MODE || '') !== '1') {
      console.log('⚠️ 未配置 AI 密钥，识别请求被拒绝')
      return res.json({
        code: 400,
        message: '未配置 AI 密钥，无法识别。请在 agriculture-backend/.env 中填写 DEEPSEEK_API_KEY（可选 BAIDU_API_KEY / BAIDU_SECRET_KEY），参考 .env.example，保存后重启后端。',
        data: { noKey: true }
      })
    }

    // ---------- 4b) 演示模式：本地知识库取一条（明确标注不是识别结果）----------
    const diseases = await dbAll('SELECT * FROM diseases WHERE verified = 1')
    if (!diseases.length) return res.json({ code: 500, message: '本地知识库为空，且未配置 AI 密钥' })
    const d = pickStable(diseases, imageBuffer)
    const out = {
      name: '未进行 AI 识别（演示数据：' + d.name + '）',
      plantName: '',
      type: d.type || '',
      category: d.category || '',
      level: d.level || 2,
      levelText: d.level_text || '中度危害',
      confidence: 0,
      image: toRelativeImage(imagePath),
      symptom: d.symptom || '',
      cause: d.cause || '',
      spread: d.spread || '',
      occurrence: d.occurrence || '',
      medicines: safeParseJSON(d.medicines),
      suggestions: safeParseJSON(d.suggestions),
      prevention: safeParseJSON(d.prevention),
      apiSource: '演示数据（无 AI）',
      matched: false,
      mode: 'local',
      demo: true,
      note: '⚠️ 未配置 AI 密钥，这不是识别结果。下面显示的是本地知识库中的一条演示数据「' + d.name + '」，与您上传的图片无关。请在 agriculture-backend/.env 中填写 DEEPSEEK_API_KEY（可参考 .env.example），然后重启后端。'
    }
    // 演示数据不写入历史记录，避免污染真实识别记录
    console.log('⚠️ 未配置 AI 密钥！本次返回的是演示数据，不是识别结果。请在 .env 里填写 DEEPSEEK_API_KEY 后重启后端。')
    res.json({ code: 200, data: out, message: '未配置 AI 密钥，返回演示数据（非识别结果）' })
  } catch (err) {
    console.error('识别失败:', err)
    res.json({ code: 500, message: '识别失败：' + err.message })
  }
});


// ==================================================================
// 连拍识别：一次上传多张照片，各识别一次后合并结论
//
// 为什么能更准：同一株植物的不同角度/部位会给出不同证据，
//   多张指向同一病害时可信度显著高于单张；
//   若各张结论不一致，则如实说明「照片间存在分歧」，不硬凑一个答案。
// ==================================================================

// 各张照片的结论合并成一条
function mergeBatchResults(items) {
  // 便于单独测试（对运行无影响）
  const valid = items.filter((x) => x && x.ok && x.data && !x.data.noPlant)
  const noPlant = items.filter((x) => x && x.ok && x.data && x.data.noPlant)

  if (!valid.length) {
    return {
      ok: false,
      message: noPlant.length
        ? '这几张照片里都没能识别到植物，请拍摄清晰的叶片或茎干特写'
        : '识别失败：' + ((items[0] && items[0].error) || 'AI 未能返回结果')
    }
  }

  const cleanName = (s) => String(s || '').trim().replace(/[的\s]/g, '')
  const groups = new Map()
  valid.forEach((it) => {
    const key = cleanName(it.data.name)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(it)
  })

  // 按「命中张数」优先、其次平均置信度排序
  const ranked = [...groups.values()].sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length
    const avg = (arr) => arr.reduce((s, x) => s + (Number(x.data.confidence) || 0), 0) / arr.length
    return avg(b) - avg(a)
  })

  const win = ranked[0]
  const others = ranked.slice(1)
  const seed = win[0].data
  const avg = Math.round(win.reduce((s, x) => s + (Number(x.data.confidence) || 0), 0) / win.length)

  // 多张一致 -> 提置信度；有分歧 -> 按比例降，并如实标注
  let merged = avg
  if (win.length >= 3) merged += 6
  else if (win.length === 2) merged += 3
  if (others.length) merged -= 5
  merged = Math.max(35, Math.min(96, merged))

  const agree = win.length
  const total = valid.length
  const detail = (it) => '第' + it.index + '张：' + (it.data.diseaseName || it.data.name) + '（' + (it.data.confidence || 0) + '%）'

  let note
  if (agree === total) {
    note = '连拍 ' + total + ' 张均判断为「' + seed.name + '」，' +
      (total >= 2 ? '多角度证据一致，可信度高于单张照片。' : '')
  } else {
    note = '连拍 ' + total + ' 张中有 ' + agree + ' 张判断为「' + seed.name + '」（' + win.map((x) => '第' + x.index + '张').join('、') + '），' +
      '其余 ' + others.map((g) => '第' + g.map((x) => x.index).join('、') + '张判断为「' + g[0].data.name + '」').join('；') + '。' +
      '照片间存在分歧，建议查看各张的分析或补拍更清晰的特写。'
  }

  const photoNotes = items.map((it) =>
    it.error ? ('第' + it.index + '张：识别失败（' + it.error + '）') : detail(it)
  )

  return {
    ok: true,
    seed,
    merged,
    // 每张照片的状态：ok=有结论 / failed=识别出错 / noplant=没识别到植物
    photos: items.map((it) => ({
      url: it.url,
      index: it.index,
      status: !it.ok ? 'failed' : (it.data && it.data.noPlant ? 'noplant' : 'ok'),
      failed: !it.ok
    })),
    photoNotes,
    disagreements: others.flat().map((it) => ({
      name: it.data.name,
      confidence: it.data.confidence || 0,
      image: it.url,
      note: '第' + it.index + '张判断为该结果'
    })),
    note,
    agree,
    total,
    hasDisagreement: others.length > 0
  }
}

module.exports.mergeBatchResults = mergeBatchResults

router.post('/recognize-batch',
  rateLimit({ windowMs: 60 * 1000, max: 4, message: '连拍识别太频繁了，请稍后再试' }),
  optionalAuth, upload.array('images', 3), handleMulterError, async (req, res) => {
  try {
    let files = req.files || []
    // 微信小程序的 wx.uploadFile 只支持单文件，不能像 H5 一样一次带 files 数组。
    // 前端改为先把每张图传到 /api/disease/upload，再把返回的 /uploads/xxx 地址发到这里，
    // 服务端仍复用下面同一套逐张识别 + 合并逻辑。
    if (!files.length && req.body && Array.isArray(req.body.images)) {
      const paths = req.body.images
      if (paths.length > 3) return res.json({ code: 400, message: '连拍最多支持 3 张照片' })
      for (const u of paths) {
        const m = String(u || '').match(/^\/uploads\/([A-Za-z0-9._-]+)$/)
        if (!m) return res.json({ code: 400, message: '图片地址不合法' })
        const fp = path.join(UPLOAD_DIR, m[1])
        let st
        try { st = fs.statSync(fp) } catch (e) { return res.json({ code: 400, message: '图片已失效，请重新拍摄' }) }
        if (!st.isFile() || st.size < 512 || st.size > 5 * 1024 * 1024) {
          return res.json({ code: 400, message: '图片文件无效或过大' })
        }
        files.push({ filename: m[1], path: fp, size: st.size })
      }
    }
    if (!files.length) return res.json({ code: 400, message: '请上传至少一张图片' })
    if (files.length > 3) return res.json({ code: 400, message: '连拍最多支持 3 张照片' })

    console.log('📸 连拍识别：共 ' + files.length + ' 张')

    // ---------- 1) 逐张识别（限并发 2，避免触发 AI 接口限流）----------
    const results = []
    for (let i = 0; i < files.length; i += 2) {
      const chunk = files.slice(i, i + 2)
      const part = await Promise.all(chunk.map(async (file, k) => {
        const index = i + k + 1
        const imagePath = '/uploads/' + file.filename
        try {
          const buf = fs.readFileSync(file.path)
          const mime = mimeOf(file.filename)
          let hint = ''
          if (BAIDU_API_KEY && BAIDU_SECRET_KEY) {
            try {
              const token = await getBaiduToken()
              const apiResult = await callBaiduPlantAPI(buf.toString('base64'), token)
              const top = (apiResult.result || [])[0]
              if (top && top.name) hint = top.name
            } catch (e) { /* 百度失败不影响，DeepSeek 仍可单独识别 */ }
          }
          const v = await callDeepSeekVision(buf, mime, hint)
          const picked = {
            plantName: v.plantName || hint || '',
            diseaseName: v.diseaseName || '',
            confidence: v.confidence,
            symptom: v.symptom, cause: v.cause, spread: v.spread, occurrence: v.occurrence,
            evidence: v.evidence, differentials: v.differentials, level: v.level,
            medicines: v.medicines, suggestions: v.suggestions, prevention: v.prevention,
            apiSource: 'DeepSeek 识图诊断',
            note: '第' + index + '张：' + (v.plantName || '未知植物') + ' → ' + (v.diseaseName || '未知病害') + '（' + v.confidence + '%）'
          }
          if (isNoPlantResult(picked)) {
            return { index, ok: true, url: toRelativeImage(imagePath), imagePath, buffer: buf, data: { ...picked, name: '未识别到植物', noPlant: true, confidence: 0 } }
          }
          let local = null
          if (picked.diseaseName) local = await matchLocalDisease(picked.diseaseName)
          if (!local && picked.plantName) local = await matchLocalDisease(picked.plantName)
          const out = mergeWithLocal(picked, local, imagePath)
          console.log('  第 ' + index + ' 张 → ' + out.plantName + ' / ' + out.name + ' (' + out.confidence + '%)')
          return { index, ok: true, url: out.image, imagePath, buffer: buf, data: out }
        } catch (e) {
          console.error('第 ' + index + ' 张识别失败：', e.message)
          return { index, ok: false, url: toRelativeImage(imagePath), imagePath, buffer: null, error: e.message }
        }
      }))
      results.push(...part)
    }
    results.sort((a, b) => a.index - b.index)

    // ---------- 2) 合并结论 ----------
    const merged = mergeBatchResults(results)
    if (!merged.ok) {
      return res.json({ code: 200, data: {
        name: '连拍识别失败', plantName: '', confidence: 0, level: 1, levelText: '无法判断',
        image: (results[0] && results[0].url) || '', images: results.map((r) => r.url),
        photoNotes: merged.photoNotes || [], medicines: [], suggestions: [], prevention: [],
        apiSource: '连拍识别', mode: 'real', noPlant: results.some((r) => r.data && r.data.noPlant),
        note: merged.message
      }, message: merged.message })
    }

    // ---------- 3) 组装最终结果 ----------
    const out = {
      ...merged.seed,
      name: merged.seed.name,
      confidence: merged.merged,
      image: merged.seed.image,
      images: merged.photos.map((x) => x.url),
      photoCount: merged.photos.length,
      photoNotes: merged.photoNotes,
      disagreements: merged.disagreements,
      hasDisagreement: merged.hasDisagreement,
      agreeCount: merged.agree,
      batch: true,
      apiSource: '连拍识别 · ' + merged.total + ' 张（' + (merged.seed.apiSource || 'AI') + '）',
      note: merged.note
    }
    // 只有真正识别出病害才写库：
    // 全部照片都没识别到植物时，merged.ok 为 false，
    // 那种「连拍识别失败」的占位结果不能进历史记录（否则历史列表里全是垃圾）。
    const identified = !!(out.name && !/识别失败|未识别到植物/.test(String(out.name)))
    let historyId = null
    if (identified) {
      const seedLocal = await matchLocalDisease(merged.seed.name)
      if (seedLocal) {
        const cmp = compareFields(seedLocal, merged.seed)
        const enh = await applyEnhancement(seedLocal, cmp)
        out.enhanced = enh.updated
        out.enhancedFields = enh.fields || []
        for (const f of (enh.fields || [])) { out[f] = cmp.fields[f] }
        if (enh.updated) out.note = (out.note ? out.note + ' ' : '') + '已用本次识别结果补全百科资料'
      } else if (merged.seed.learned !== false) {
        await autoLearnDisease(out)
      }
      const primary = (results.find((r) => r.ok && r.data && r.data.image === merged.seed.image) || results[0])
      historyId = await saveHistory(req.user && req.user.id, out, primary ? primary.imagePath : null)
    } else {
      console.log('ℹ️ 连拍未识别出病害，不写入历史记录')
    }
    out.historyId = historyId
    out.savedHistory = !!historyId

    console.log('✅ 连拍完成：' + out.plantName + ' → ' + out.name + ' (' + out.confidence + '%)，' +
      merged.agree + '/' + merged.total + ' 张一致')
    res.json({ code: 200, data: out, message: out.plantName ? out.plantName + '：' + out.name : out.name })
  } catch (err) {
    console.error('连拍识别失败:', err)
    res.json({ code: 500, message: '连拍识别失败：' + err.message })
  }
});

// 已知病害名，让 DeepSeek 生成完整的症状与防治方案（用于人工纠错后补全知识库）
async function enrichDiseasePlan(name, plantName) {
  const prompt = '请给出植物病害「' + name + '」' + (plantName ? '（寄主：' + plantName + '）' : '') + '的完整防治资料。' +
    '只输出 JSON，不要任何多余文字：' +
    '{"symptom":"危害症状","cause":"病因","spread":"传播途径","occurrence":"发病规律",' +
    '"level":1到3的整数,"medicines":[{"name":"药剂名","usage":"稀释倍数与用法"}],' +
    '"suggestions":["防治建议"],"prevention":["预防措施"]}'
  const content = await callDeepSeek({
    model: DEEPSEEK_MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1200, temperature: 0.2,
    thinking: { type: 'disabled' },
    response_format: { type: 'json_object' }
  }, 40000)
  let s = String(content || '').trim()
  const a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a < 0 || b < 0) throw new Error('未返回 JSON')
  const j = JSON.parse(s.slice(a, b + 1))
  const lv = parseInt(j.level)
  j.level = isNaN(lv) ? 2 : Math.max(1, Math.min(3, lv))
  return j
}

// ==================== 通用图片上传 ====================
// 用于头像等场景：上传成功后返回图片地址，前端把它存到用户资料里
router.post('/upload',
  rateLimit({ windowMs: 60 * 1000, max: 10, message: '上传太频繁了' }),
  optionalAuth, upload.single('image'), handleMulterError, (req, res) => {
    if (!req.file) return res.json({ code: 400, message: '请选择图片' })

    // multer 只校验了 MIME 与扩展名，空文件/损坏文件也能通过，
    // 这里补一道真实文件检查，避免写入 0 字节的垃圾文件
    let size = req.file.size || 0
    try { size = fs.statSync(req.file.path).size } catch (e) { /* 文件可能已被清理 */ }

    if (size < 512) {
      try { fs.unlinkSync(req.file.path) } catch (e) {}
      return res.json({ code: 400, message: '图片文件无效或过小（至少 512 字节）' })
    }
    if (size > 5 * 1024 * 1024) {
      try { fs.unlinkSync(req.file.path) } catch (e) {}
      return res.json({ code: 400, message: '图片不能超过 5MB' })
    }

    res.json({ code: 200, message: '上传成功', data: {
      url: toRelativeImage('/uploads/' + req.file.filename),
      size: size
    } })
  })

// ==================== 用户纠错 ====================
// 用户在结果页指出 AI 判断错误，提交正确的病害名称。
// 作用：① 保留 AI 原判断与用户答案的对照 ② 修正这条历史记录 ③ 作为后续改进的依据
router.post('/correct',
  rateLimit({ windowMs: 60 * 1000, max: 5, message: '提交太频繁了' }),
  optionalAuth, async (req, res) => {
  try {
    const { historyId, aiName, correctName, plantName } = req.body || {}
    const correct = String(correctName || '').trim()
    if (!correct) return res.json({ code: 400, message: '请填写正确的病害名称' })

    const userId = (req.user && req.user.id) || null
    await dbRun(
      'INSERT INTO corrections (history_id, user_id, ai_name, correct_name, plant_name) VALUES (?, ?, ?, ?, ?)',
      [historyId || null, userId, String(aiName || ''), correct, String(plantName || '')]
    )

    // 修正对应的历史记录（如果这条记录存在且属于当前用户或没有归属）
    let fixed = 0
    if (historyId) {
      // 注意：不能用 SQLite 的 || 拼接（MySQL 里是 OR），改成先读后拼
      const prev = await dbGet('SELECT ai_source FROM histories WHERE id = ?', [historyId])
      const mergedSource = String((prev && prev.ai_source) || '') + '（已人工纠正）'
      const r = await dbRun(
        'UPDATE histories SET disease_name = ?, corrected = ?, ai_source = ? WHERE id = ?',
        [correct, '1', mergedSource, historyId]
      )
      fixed = (r && r.changes) || 0
    }

    // 取这条历史记录的图片，收录进知识库时一起存
    let histImage = ''
    if (historyId) {
      try {
        const rows = await dbAll('SELECT image FROM histories WHERE id = ?', [historyId])
        histImage = toRelativeImage(rows && rows[0] && rows[0].image)
      } catch (e) { console.error('取历史图片失败:', e.message) }
    }

    // 用户给出的答案比 AI 更可靠，补进本地知识库（若尚无同名记录）
    let learned = false
    let enriched = false
    const existing = await matchLocalDisease(correct)
    if (!existing) {
      let plan = null
      if (DEEPSEEK_API_KEY) {
        try {
          plan = await enrichDiseasePlan(correct, plantName)
          enriched = true
        } catch (e) {
          console.error('生成防治方案失败（仅收录病害名）:', e.message)
        }
      }
      const j = (v) => JSON.stringify(Array.isArray(v) ? v : [])
      const levelText = plan ? (plan.level === 1 ? '轻度危害' : plan.level === 3 ? '重度危害' : '中度危害') : '中度危害'
      await dbRun(
        `INSERT INTO diseases (name, type, category, level, level_text, image, symptom, cause, spread, occurrence, medicines, suggestions, prevention)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [correct, (plantName ? plantName + '病害' : '人工纠正'), '用户人工纠正',
         plan ? plan.level : 2, levelText, histImage,
         plan ? (plan.symptom || '') : '', plan ? (plan.cause || '') : '',
         plan ? (plan.spread || '') : '', plan ? (plan.occurrence || '') : '',
         plan ? j(plan.medicines) : '[]', plan ? j(plan.suggestions) : '[]', plan ? j(plan.prevention) : '[]']
      )
      learned = true
    } else if (existing && (!existing.image || existing.image === '') && histImage) {
      // 已有这条病害但缺图 → 用这次纠正的图片补上
      await dbRun('UPDATE diseases SET image = ? WHERE id = ?', [histImage, existing.id])
      learned = false
    }

    console.log('✍️ 用户纠错：AI 判「' + (aiName || '') + '」→ 实际「' + correct + '」' + (fixed ? '（已修正历史记录）' : ''))
    res.json({ code: 200, message: '感谢纠正！已记录', data: { historyId: historyId || null, correctName: correct, historyFixed: fixed, learnedToLibrary: learned, planGenerated: enriched } })
  } catch (err) {
    if (String(err.message).indexOf('UNIQUE') >= 0) {
      return res.json({ code: 200, message: '已记录您的纠正', data: { correctName: correct, learnedToLibrary: true } })
    }
    console.error('纠错失败:', err)
    res.json({ code: 500, message: '提交失败：' + err.message })
  }
})

// ==================== 后台管理（病虫害库）====================
const PAGE_SIZE = 15;
const flashOf = (q) => ({ success: q.success, error: q.error });

// 列表：搜索 + 分页
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const keyword = String(req.query.q || '').trim();
    const status = String(req.query.status || '');

    // 状态筛选：已核实 / 待核实 / AI草稿 / 无配图 / 无来源
    const conds = [];
    const params = [];
    if (keyword) {
      conds.push('(name LIKE ? OR category LIKE ? OR type LIKE ?)');
      params.push('%' + keyword + '%', '%' + keyword + '%', '%' + keyword + '%');
    }
    if (status === 'verified') conds.push('verified = 1');
    else if (status === 'pending') conds.push('verified = 0');
    else if (status === 'draft') conds.push("category LIKE '%AI草稿%'");
    else if (status === 'noimg') conds.push("COALESCE(image,'') = ''");
    else if (status === 'nosource') conds.push("COALESCE(verify_source,'') = ''");
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const total = (await dbGet('SELECT COUNT(*) c FROM diseases ' + where, params))?.c || 0;
    const rows = await dbAll(
      'SELECT * FROM diseases ' + where + ' ORDER BY id DESC LIMIT ? OFFSET ?',
      [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE]
    );

    // 各状态的数量，用于顶部筛选条
    const cnt = async (sql) => (await dbGet('SELECT COUNT(*) c FROM diseases ' + sql))?.c || 0;
    const counts = {
      all: await cnt(''),
      verified: await cnt('WHERE verified = 1'),
      pending: await cnt('WHERE verified = 0'),
      draft: await cnt("WHERE category LIKE '%AI草稿%'"),
      noimg: await cnt("WHERE COALESCE(image,'') = ''"),
      nosource: await cnt("WHERE COALESCE(verify_source,'') = ''")
    };

    res.render('admin/diseases', {
      pageTitle: '病虫害库', current: 'diseases', adminName: req.session.adminName || 'admin',
      rows, keyword, status, counts, page, total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      flash: flashOf(req.query)
    });
  } catch (err) {
    console.error('病虫害列表失败:', err);
    res.render('admin/diseases', {
      pageTitle: '病虫害库', current: 'diseases', adminName: req.session.adminName || 'admin',
      rows: [], keyword: '', status: '', counts: { all: 0, verified: 0, pending: 0, draft: 0, noimg: 0, nosource: 0 },
      page: 1, total: 0, totalPages: 1, flash: { error: '读取失败: ' + err.message }
    });
  }
});

// 新增页
router.get('/new', (req, res) => {
  res.render('admin/disease_form', {
    pageTitle: '新增病虫害', current: 'diseases', adminName: req.session.adminName || 'admin',
    isEdit: false, d: {}, medicinesText: '', suggestionsText: '', preventionText: '',
    aiEnabled: !!DEEPSEEK_API_KEY, flash: flashOf(req.query)
  });
});

// 编辑页
router.get('/edit/:id', async (req, res) => {
  try {
    const disease = await dbGet('SELECT * FROM diseases WHERE id = ?', [req.params.id]);
    if (!disease) return res.redirect('/admin/diseases?error=病虫害不存在');

    // 把库里的 JSON 数组转成“一行一条”的文本，方便编辑
    const lines = (v) => {
      const arr = safeParseJSON(v);
      return arr.map((x) => (x && typeof x === 'object') ? ((x.name || '') + (x.usage ? '|' + x.usage : '')) : String(x)).join('\n');
    };
    res.render('admin/disease_form', {
      pageTitle: '编辑病虫害', current: 'diseases', adminName: req.session.adminName || 'admin',
      isEdit: true, d: disease,
      medicinesText: lines(disease.medicines),
      suggestionsText: safeParseJSON(disease.suggestions).join('\n'),
      preventionText: safeParseJSON(disease.prevention).join('\n'),
      aiEnabled: !!DEEPSEEK_API_KEY, flash: flashOf(req.query)
    });
  } catch (e) {
    console.error('读取病虫害失败:', e);
    res.redirect('/admin/diseases?error=获取数据失败');
  }
});

// 解析表单里的“一行一条”文本
function parseLines(text) {
  return String(text || '').split('\n').map((s) => s.trim()).filter(Boolean);
}
function parseMedicines(text) {
  return parseLines(text).map((line) => {
    const parts = line.split('|');
    return parts.length > 1
      ? { name: parts[0].trim(), usage: parts.slice(1).join('|').trim() }
      : { name: line, usage: '' };
  });
}

// AI 自动生成资料（后台表单里的「✨ AI 自动生成资料」按钮）
router.get('/ai-fill', async (req, res) => {
  try {
    const name = String(req.query.name || '').trim();
    if (!name) return res.json({ code: 400, message: '请先填写病虫害名称' });
    if (!DEEPSEEK_API_KEY) return res.json({ code: 400, message: '未配置 DeepSeek 密钥，无法生成' });

    const plan = await enrichDiseasePlan(name, '');
    const levelText = plan.level === 1 ? '轻度危害' : plan.level === 3 ? '重度危害' : '中度危害';
    res.json({
      code: 200,
      data: {
        symptom: plan.symptom || '',
        cause: plan.cause || '',
        spread: plan.spread || '',
        occurrence: plan.occurrence || '',
        level: plan.level || 2,
        levelText,
        category: 'AI 生成',
        type: name.slice(0, 3) + '病害',
        medicines: plan.medicines || [],
        suggestions: plan.suggestions || [],
        prevention: plan.prevention || []
      }
    });
  } catch (e) {
    console.error('AI 生成资料失败:', e.message);
    res.json({ code: 500, message: '生成失败: ' + e.message });
  }
});

// 新增保存
router.post('/add', upload.single('disease_image'), handleMulterError, [
  body('name').notEmpty().withMessage('病虫害名称不能为空'),
  body('category').notEmpty().withMessage('所属分类不能为空'),
  body('symptom').notEmpty().withMessage('症状描述不能为空'),
  body('cause').notEmpty().withMessage('病因不能为空'),
  body('prevention').notEmpty().withMessage('预防措施不能为空')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.redirect('/admin/diseases/new?error=' + encodeURIComponent(errors.array()[0].msg));

    const imagePath = req.file ? '/uploads/' + req.file.filename : '';
    const level = parseInt(req.body.level) || 2;
    const levelText = level === 1 ? '轻度危害' : level === 3 ? '重度危害' : '中度危害';

    await dbRun(
      `INSERT INTO diseases (name, category, type, level, level_text, host, image, symptom, cause, spread, occurrence, medicines, suggestions, prevention)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.body.name, req.body.category, req.body.type || '', level, levelText, req.body.host || '',
       imagePath, req.body.symptom, req.body.cause || '', req.body.spread || '', req.body.occurrence || '',
       JSON.stringify(parseMedicines(req.body.medicines)),
       JSON.stringify(parseLines(req.body.suggestions)),
       JSON.stringify(parseLines(req.body.prevention))]
    );
    res.redirect('/admin/diseases?success=添加成功');
  } catch (err) {
    console.error('添加病虫害失败:', err);
    const msg = String(err.message).indexOf('UNIQUE') >= 0 ? '该病害名称已存在' : '添加失败';
    res.redirect('/admin/diseases/new?error=' + encodeURIComponent(msg));
  }
});

// 编辑保存
router.post('/edit', upload.single('disease_image'), handleMulterError, [
  body('id').notEmpty(), body('name').notEmpty(), body('category').notEmpty(),
  body('symptom').notEmpty(), body('cause').notEmpty(), body('prevention').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.redirect('/admin/diseases?error=' + encodeURIComponent(errors.array()[0].msg));

    const oldRecord = await dbGet('SELECT image FROM diseases WHERE id = ?', [req.body.id]);
    let imagePath = oldRecord ? oldRecord.image : '';
    if (req.file) {
      imagePath = '/uploads/' + req.file.filename;
      if (oldRecord && oldRecord.image) await deleteFileIfExists(oldRecord.image);
    }
    const level = parseInt(req.body.level) || 2;
    const levelText = level === 1 ? '轻度危害' : level === 3 ? '重度危害' : '中度危害';

    await dbRun(
      `UPDATE diseases SET name=?, category=?, type=?, level=?, level_text=?, host=?, image=?,
        verify_source=?, verify_date=?, symptom=?, cause=?,
        spread=?, occurrence=?, medicines=?, suggestions=?, prevention=? WHERE id=?`,
      [req.body.name, req.body.category, req.body.type || '', level, levelText, req.body.host || '',
       imagePath, req.body.verify_source || '', req.body.verify_date || '',
       req.body.symptom, req.body.cause || '', req.body.spread || '', req.body.occurrence || '',
       JSON.stringify(parseMedicines(req.body.medicines)),
       JSON.stringify(parseLines(req.body.suggestions)),
       JSON.stringify(parseLines(req.body.prevention)), req.body.id]
    );
    res.redirect('/admin/diseases?success=保存成功');
  } catch (err) {
    console.error('编辑病虫害失败:', err);
    const msg = String(err.message).indexOf('UNIQUE') >= 0 ? '该病害名称已存在' : '保存失败';
    res.redirect('/admin/diseases?error=' + encodeURIComponent(msg));
  }
});

// 删除（POST，带确认）
router.post('/:id/delete', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const record = await dbGet('SELECT image, name FROM diseases WHERE id = ?', [id]);
    if (!record) return res.redirect('/admin/diseases?error=病虫害不存在');
    await dbRun('DELETE FROM diseases WHERE id = ?', [id]);
    if (record.image) await deleteFileIfExists(record.image);
    res.redirect('/admin/diseases?success=' + encodeURIComponent('已删除「' + record.name + '」'));
  } catch (err) {
    console.error('删除病虫害失败:', err);
    res.redirect('/admin/diseases?error=删除失败');
  }
});


// ---------- 后台页面：资料补全（预览 + 执行）----------
// 注意：本文件在 /admin/diseases 下挂载时外层已有 checkAuth（见 admin.js），
//      所以这个页面只有管理员能访问。
router.get('/enrich', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 30)
    const rows = await dbAll(
      "SELECT * FROM diseases WHERE COALESCE(category,'') <> '用户人工纠正' " +
      "ORDER BY (symptom IS NULL OR symptom = '') DESC, LENGTH(COALESCE(symptom,'')) ASC LIMIT ?",
      [limit]
    )
    const items = rows.map((d) => ({
      id: d.id, name: d.name, type: d.type || '',
      need: missingFields(d),
      symptomLen: (d.symptom || '').length,
      hasImage: !!d.image
    }))
    res.render('admin/enrich', {
      pageTitle: '资料补全', current: 'diseases', adminName: req.session.adminName || 'admin',
      items, limit, preview: true, result: null,
      msg: String(req.query.msg || ''),
      flash: req.query.ok ? { success: '补全完成' } : (req.query.err ? { error: req.query.err } : {})
    })
  } catch (err) {
    console.error('补全预览失败:', err)
    res.redirect('/admin/diseases?err=' + encodeURIComponent('预览失败'))
  }
})

// ---------- 后台页面：执行补全 ----------
router.post('/enrich/run', async (req, res) => {
  try {
    const limit = Math.min(Number((req.body && req.body.limit) || 3), 5)
    const data = await enrichDiseases({ limit, dryRun: false })
    // 用 query 传结果摘要，避免刷新重复提交
    const done = data.items.filter((x) => x.filled).length
    const skip = data.items.filter((x) => x.skipped).length
    const fail = data.items.filter((x) => x.error).length
    const msg = '成功补全 ' + done + ' 条' + (skip ? '，跳过 ' + skip + ' 条' : '') + (fail ? '，失败 ' + fail + ' 条' : '')
    res.redirect('/admin/diseases/enrich?ok=1&msg=' + encodeURIComponent(msg))
  } catch (err) {
    console.error('补全执行失败:', err)
    res.redirect('/admin/diseases/enrich?err=' + encodeURIComponent(err.message))
  }
})

// ==================== 百科资料补全（AI） ====================
// 具体实现在 lib/enrich.js，这里只做参数校验和限流。
//   POST /api/disease/enrich                    -> 自动挑最缺的几条
//   POST /api/disease/enrich { ids:[1,2] }      -> 指定条目
//   POST /api/disease/enrich { dryRun:true }    -> 只检查缺什么
router.post('/enrich', rateLimit({ windowMs: 60 * 1000, max: 4, message: '补全太频繁，请稍后再试' }), async (req, res) => {
  try {
    const body = req.body || {}
    const data = await enrichDiseases({ ids: body.ids, limit: body.limit, dryRun: body.dryRun })
    res.json({ code: 200, message: data.dryRun ? '（预演，未改库）' : '补全完成', data })
  } catch (err) {
    console.error('百科补全失败:', err.message)
    res.json({ code: 500, message: '补全失败：' + err.message })
  }
})

module.exports = router;
// 供脚本（批量建库）复用：提示词和解析逻辑保持一致
module.exports.__helpers = { enrichDiseasePlan, nameScore, cleanDiseaseName, sameDisease }
