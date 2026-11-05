// ==================== Node 版本检查 ====================
// 太旧：语法/依赖跑不起来；太新：sqlite3 等原生模块可能没有预编译包（需现场编译，容易失败）
const NODE_MAJOR = Number(process.versions.node.split('.')[0])
if (NODE_MAJOR < 18) {
  console.error('')
  console.error('❌ Node.js 版本过低：当前 v' + process.versions.node + '，本项目至少需要 v18')
  console.error('   推荐安装 v22 LTS：https://nodejs.org/zh-cn')
  console.error('   安装时勾选 Add to PATH，装完关掉所有终端重开')
  console.error('')
  process.exit(1)
}
if (NODE_MAJOR >= 25) {
  console.warn('⚠️  当前 Node v' + process.versions.node + ' 属于较新的大版本，sqlite3 等原生模块可能没有预编译包。')
  console.warn('   如果 npm install 报编译错误，请改用 Node 22 LTS。')
}

// 读取 .env 里的配置（API 密钥等），必须在用到之前加载。
// 用绝对路径：无论从哪个目录启动 node，都能正确读到 agriculture-backend/.env
const fsx = require('fs')
const pathx = require('path')
const ENV_PATH = pathx.join(__dirname, '.env')

// 首次运行自动生成 .env：照 .env.example 复制，并写入随机的鉴权密钥。
// 这样别人 clone 下来直接 npm start 就能跑，不需要手工复制/填配置。
if (!fsx.existsSync(ENV_PATH)) {
  const example = pathx.join(__dirname, '.env.example')
  if (fsx.existsSync(example)) {
    const crypto = require('crypto')
    let content = fsx.readFileSync(example, 'utf8')
    content = content
      .replace(/^JWT_SECRET=.*$/m, 'JWT_SECRET=' + crypto.randomBytes(24).toString('hex'))
      .replace(/^SESSION_SECRET=.*$/m, 'SESSION_SECRET=' + crypto.randomBytes(24).toString('hex'))
    fsx.writeFileSync(ENV_PATH, content, 'utf8')
    console.log('ℹ️  未找到 .env，已按 .env.example 自动创建（含随机鉴权密钥）')
    console.log('    要启用真实 AI 识别，请在 agriculture-backend/.env 填写 DEEPSEEK_API_KEY 等密钥')
  }
}

require('dotenv').config({ path: ENV_PATH })

const express = require('express')
const cors = require('cors')
const path = require('path')
const app = express()
const { initDB } = require('./config/db')

const PORT = Number(process.env.PORT) || 3000

// 本机所有局域网地址：手机真机 / 其他电脑访问时用这里打印的地址
function printLanUrls(port) {
  const nets = require('os').networkInterfaces()
  const urls = []
  for (const name of Object.keys(nets)) {
    for (const net of (nets[name] || [])) {
      const family = typeof net.family === 'string' ? net.family : 'IPv' + net.family
      if (family === 'IPv4' && !net.internal) urls.push('http://' + net.address + ':' + port)
    }
  }
  if (!urls.length) urls.push('http://localhost:' + port)
  console.log('🌐 可用后端地址：\n   ' + urls.join('\n   '))
  console.log('   （H5 浏览器运行会自动使用当前网页地址；真机 App / 小程序请把 utils/config.js 的 APP_BASE_URL 改成上面的地址）')
}

// ==================== 生产环境增强 ====================
const prod = require('./middleware/production')
app.use(prod.compression())          // gzip 压缩：JSON/网页体积可降 60%~80%
app.use(prod.securityHeaders)        // 安全响应头
app.use(prod.accessLog())            // 访问日志（logs/access-日期.log）
app.use(prod.errorLog())             // 错误日志落盘（logs/error-日期.log）

// 跨域：开发时允许所有来源；上线后可通过 CORS_ORIGIN 环境变量收紧
// 例如 .env 里写 CORS_ORIGIN=https://你的域名.com（多个用英文逗号分隔）
// 如果 H5 页面与后端同域名部署，其实不会产生跨域，可以不配
const corsOrigin = process.env.CORS_ORIGIN
app.use(cors({
  origin: corsOrigin ? corsOrigin.split(',').map((s) => s.trim()) : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'token'],
  credentials: false
}))

// 基础配置
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
// 注意：uploads 目录不能由静态中间件托管，否则会在下面的 /uploads 鉴权路由
// 之前把图片直接发出去，访问控制就形同虚设。这里用一个包装中间件跳过它。
// ==================================================================
// 上传目录路径归一化（安全）
//
// 问题：/uploads 的鉴权中间件只认标准写法。
//   //uploads/xxx.png    → 静态中间件自己把多重斜杠折叠后直接发文件
//   /uploads%2Fxxx.png  → 单段路径，不匹配 app.use('/uploads')，落到静态目录
// 两者都能绕过「只有本人/管理员能看识别记录图」的限制。
// 处理：先解码 + 折叠斜杠，凡是指向 uploads 的请求都改写成标准路径，
//       再交给后面的 /uploads 鉴权中间件；静态中间件永远不处理 uploads。
// ==================================================================
app.use((req, res, next) => {
  const rawPath = String(req.url || '').split('?')[0]
  let decoded
  try { decoded = decodeURIComponent(rawPath) } catch (e) { return res.status(400).send('非法请求路径') }
  const normalized = decoded.replace(/\\/g, '/').replace(/\/{2,}/g, '/')
  if (/^\/uploads\//i.test(normalized)) {
    const rest = normalized.slice('/uploads/'.length)
    if (!rest || rest.indexOf('..') >= 0) return res.status(400).send('非法路径')
    const query = req.url.indexOf('?') >= 0 ? req.url.slice(req.url.indexOf('?')) : ''
    req.url = '/uploads/' + rest + query
  }
  next()
})

const staticHandler = express.static(path.join(__dirname, 'public'), { index: false })
app.use((req, res, next) => {
  if (req.path.indexOf('/uploads/') === 0) return next()   // 交给后面的鉴权路由
  return staticHandler(req, res, next)
})

// 后台模板配置
const session = require('express-session')
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
app.use(session({
  secret: require('./config/secrets').SESSION_SECRET,
  resave: false,
  saveUninitialized: false,   // 只为真正登录的后台会话创建存储，避免无谓的内存占用
  cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',                             // 跨站表单提交不带 cookie，减小 CSRF 面
      secure: process.env.COOKIE_SECURE === '1'    // 上 HTTPS 后设 COOKIE_SECURE=1
    }
}))

// 可选鉴权：带 token 就解析出用户，不带也放行（统计接口按需返回个性化数据）
function optionalAuth(req, res, next) {
  const raw = req.header('Authorization') || req.header('token') || ''
  const token = String(raw).replace(/^Bearer\s+/i, '').trim()
  if (token) {
    try { req.user = require('jsonwebtoken').verify(token, require('./config/secrets').JWT_SECRET) } catch (e) { req.user = null }
  }
  next()
}

// 路由挂载
const adminRouter = require('./routes/admin')
// 后台改数据的请求做来源校验（CSRF 防护）
// 原理：浏览器发起的跨站表单提交，Origin/Referer 会是别的站点。
// 这里只允许同源（或没有来源头的服务端调用，如自动化测试）。
app.use('/admin', (req, res, next) => {
  if (req.method !== 'POST') return next()
  const src = req.get('origin') || req.get('referer') || ''
  if (!src) return next()          // 服务端调用（脚本/测试）没有来源头
  try {
    const host = new URL(src).host
    if (host !== req.get('host')) {
      console.warn('🚫 拦截可疑后台请求: ' + req.method + ' ' + req.originalUrl + ' 来源=' + src)
      return res.status(403).send('请求来源不合法（CSRF 防护）')
    }
  } catch (e) {
    return res.status(403).send('请求来源不合法（CSRF 防护）')
  }
  next()
})

app.use('/admin', adminRouter)
// 版本信息：App 启动时比对本地 versionCode，决定是否提示更新
app.get('/api/version', (req, res) => {
  try {
    const info = require('./version.json')
    res.json({ code: 200, data: info })
  } catch (e) {
    res.json({ code: 500, message: '版本信息读取失败' })
  }
})

app.use('/api/disease', require('./routes/disease'))
app.use('/api/user', require('./routes/user'))
app.use('/api/history', require('./routes/history'))
app.use('/api/collection', require('./routes/collection'))
app.use('/api/warning', require('./routes/warning'))
app.use('/api/chat', require('./routes/chat'))   // AI 农业问答机器人

// 健康检查：前端用它探测后端地址，同时便于排查（数据库/AI 是否就绪）
app.get('/api/health', async (req, res) => {
  const info = {
    code: 200,
    message: '服务运行正常',
    time: new Date().toISOString(),
    database: 'unknown',
    ai: {
      deepseek: !!process.env.DEEPSEEK_API_KEY,
      baidu: !!(process.env.BAIDU_API_KEY && process.env.BAIDU_SECRET_KEY)
    }
  }
  try {
    const { dbGet } = require('./config/db')
    const row = await dbGet('SELECT 1 AS ok')
    info.database = 'ok'
    info.dbOk = !!(row && row.ok === 1)
  } catch (e) {
    info.database = 'error: ' + e.message
  }
  res.json(info)
})

// 统计概览
//   不带 token：返回全局数据（首页/关于页可用）
//   带 token  ：额外返回该用户自己的数据与识别趋势（个人中心用）
app.get('/api/stats/summary', optionalAuth, async (req, res) => {
  try {
    const { dbGet, dbAll } = require('./config/db')
    const [diseases, histories, users, collections] = await Promise.all([
      dbGet('SELECT COUNT(*) as cnt FROM diseases'),
      dbGet('SELECT COUNT(*) as cnt FROM histories'),
      dbGet('SELECT COUNT(*) as cnt FROM users'),
      dbGet('SELECT COUNT(*) as cnt FROM collections')
    ])

    const data = {
      diseaseCount: (diseases && diseases.cnt) || 0,
      historyCount: (histories && histories.cnt) || 0,
      userCount: (users && users.cnt) || 0,
      collectionCount: (collections && collections.cnt) || 0
    }

    if (req.user && req.user.id) {
      const uid = req.user.id
      const [myHist, myCol] = await Promise.all([
        dbGet('SELECT COUNT(*) as cnt FROM histories WHERE user_id = ?', [uid]),
        dbGet('SELECT COUNT(*) as cnt FROM collections WHERE user_id = ?', [uid])
      ])
      data.myHistoryCount = (myHist && myHist.cnt) || 0
      data.myCollectionCount = (myCol && myCol.cnt) || 0

      // 最近 7 天识别趋势（按天聚合，用于画小柱状图）
      const rows = await dbAll(`
        SELECT date(create_time) AS day, COUNT(*) AS cnt
        FROM histories WHERE user_id = ? AND create_time >= datetime('now', '-6 days')
        GROUP BY day ORDER BY day
      `, [uid])
      const map = {}
      rows.forEach((r) => { map[r.day] = r.cnt })
      const trend = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000)
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
        trend.push({ day: key.slice(5), count: map[key] || 0 })
      }
      data.trend = trend
    }

    res.json({ code: 200, data })
  } catch (e) {
    console.error('获取统计失败:', e)
    res.json({ code: 500, message: '获取统计失败' })
  }
})

// 识别次数最多的病害排行（数据可视化 / 答辩展示用）
app.get('/api/stats/hot', async (req, res) => {
  try {
    const { dbAll } = require('./config/db')
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 8))
    const rows = await dbAll(`
      SELECT disease_name AS name, COUNT(*) AS count
      FROM histories WHERE disease_name IS NOT NULL AND disease_name <> ''
      GROUP BY disease_name ORDER BY count DESC LIMIT ?
    `, [limit])
    res.json({ code: 200, data: rows })
  } catch (e) {
    console.error('获取排行失败:', e)
    res.json({ code: 500, data: [], message: '获取排行失败' })
  }
})

// ===== 仅本机可用的重启端点 =====
// 用途：改了代码后，如果忘了关掉旧的后端进程，新代码不会生效（端口还被旧进程占着）。
// 访问 http://localhost:3000/api/_restart 可以让当前进程退出，然后重新 node app.js 即可。
// 安全：只接受来自本机的请求。
app.post('/api/_restart', (req, res) => {
  const ip = String(req.ip || req.connection.remoteAddress || '').replace('::ffff:', '')
  const proxied = req.headers['x-forwarded-for'] || req.headers['x-real-ip']
  // 反向代理下 req.ip 会变成代理地址（127.0.0.1），不额外判断就成了"公网可重启"
  if (proxied) {
    return res.status(403).json({ code: 403, message: '仅限本机直连调用（检测到代理头）' })
  }
  if (!['127.0.0.1', '::1', 'localhost'].includes(ip)) {
    return res.status(403).json({ code: 403, message: '仅限本机调用' })
  }
  console.log('🔄 收到本机重启请求，进程即将退出（请重新执行 node app.js）')
  res.json({ code: 200, message: '服务即将关闭，请重新执行 node app.js' })
  setTimeout(() => process.exit(0), 500)
})

app.get('/', (req, res) => {
  res.send(`<h1>🌱 服务正常</h1><p>后台：<a href="/admin">/admin</a> · 健康检查：<a href="/api/health">/api/health</a></p>`)
})

// ==================== 上传图片的访问控制 ====================
// 问题：public 目录是静态托管的，任何人拿到 URL 就能看别人的作物照片。
// 做法：用 /uploads 路由覆盖静态托管，要求「本人或管理员」才能访问。
//
// 两个关键点：
//   1. <image> 标签没法带 Authorization 头，所以 token 允许放在 query 上
//      （前端 imageUrl() 会自动拼 ?token=xxx）
//   2. 数据库里图片地址有两种历史格式：
//        /uploads/xxx
//        http://<老IP>:3000/uploads/xxx
//      所以用 LIKE %/uploads/<文件名> 匹配，两种都能查到归属
app.use('/uploads', async (req, res, next) => {
  try {
    const rel = decodeURIComponent(req.path || '').replace(/^\/+/, '')
    if (!rel || rel.indexOf('..') >= 0) return res.status(400).send('非法路径')

    const filePath = path.join(__dirname, 'public', 'uploads', rel)

    // 读 token（header 或 query）
    const raw = req.header('Authorization') || req.header('token') || req.query.token || ''
    const token = String(raw).replace(/^Bearer\s+/i, '').trim()
    let user = null
    if (token) {
      try { user = require('jsonwebtoken').verify(token, require('./config/secrets').JWT_SECRET) } catch (e) { user = null }
    }

    // ========== 以下三类【公开可读】，必须放在登录检查之前 ==========
    // 原因：<image> 标签带不了 Authorization 头，游客又没有 token。
    // 如果先判断登录，这些图片对游客一律 401 —— 就和「百科接口不需要登录」
    // 的设定自相矛盾了（列表能看、配图却看不了）。
    const { dbGet } = require('./config/db')

    // 1) 病害库图片：百科是公开内容，配图也应公开
    const lib = await dbGet('SELECT id FROM diseases WHERE image LIKE ? LIMIT 1', ['%/uploads/' + rel])
    if (lib) return res.sendFile(filePath)

    // 2) 头像：个人资料、后台用户列表都要显示
    const isAvatar = await dbGet('SELECT id FROM users WHERE avatar LIKE ? LIMIT 1', ['%/uploads/' + rel])
    if (isAvatar) return res.sendFile(filePath)

    // 3) 管理后台：浏览器访问 <img> 会自动带 session cookie
    if (req.session && req.session.isAdmin) return res.sendFile(filePath)

    // ========== 以下需要登录 ==========
    if (!user || !user.id) {
      return res.status(401).send('图片需要登录后查看')
    }

    // 管理员可看全部
    const me = await dbGet('SELECT is_admin FROM users WHERE id = ?', [user.id])
    if (me && me.is_admin) return res.sendFile(filePath)

    // 本人：历史记录里有这张图就放行（识别记录属于个人隐私，不公开）
    const own = await dbGet(
      "SELECT id FROM histories WHERE user_id = ? AND (image LIKE ? OR image_url LIKE ?) LIMIT 1",
      [user.id, '%/uploads/' + rel, '%/uploads/' + rel]
    )
    if (own) return res.sendFile(filePath)

    return res.status(403).send('无权查看该图片')
  } catch (e) {
    console.error('图片访问出错:', e.message)
    next()
  }
})

// 404：接口返回 JSON，页面返回提示（避免前端拿到 HTML 而报“不是接口数据”）
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ code: 404, message: '接口不存在: ' + req.method + ' ' + req.path })
  }
  res.status(404).send('<h1>404 页面不存在</h1><p><a href="/">返回首页</a> · <a href="/admin">管理后台</a></p>')
})

// 全局错误处理：任何未捕获的异常都返回结构化 JSON，避免进程崩溃或返回 HTML
app.use((err, req, res, next) => {
  console.error('❌ 未处理的异常:', err && err.stack ? err.stack : err)
  if (res.headersSent) return next(err)
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
  res.status(500).send('<h1>500 服务器错误</h1><p><a href="/">返回首页</a></p>')
})

// ==================== 启动服务 ====================
// 安全体检：管理员还在用 123456 这类默认密码就大声提醒
async function warnWeakAdminPassword() {
  try {
    const bcrypt = require('bcryptjs')
    const { dbGet } = require('./config/db')
    const row = await dbGet('SELECT password FROM users WHERE username = ?', ['admin'])
    if (!row || !row.password) return
    const weak = ['123456', 'admin', '12345678', 'password']
    for (const p of weak) {
      if (await bcrypt.compare(p, row.password)) {
        console.warn('')
        console.warn('⚠️  安全提醒：管理员账号 admin 仍在使用默认密码「' + p + '」')
        console.warn('   请立即更换（我的 → 设置 → 修改密码，或后台右上角「修改密码」）。')
        console.warn('')
        return
      }
    }
  } catch (e) { /* 检查失败不影响启动 */ }
}

async function startServer() {
  try {
    await initDB()
    console.log('✅ 数据库初始化成功')

    await warnWeakAdminPassword()

    // 登录日志保留 30 天，启动时清一次，之后每天清一次
    const guard = require('./middleware/loginGuard')
    const clean = () => guard.cleanOldLogs(30).catch(() => {})
    clean()
    const timer = setInterval(clean, 24 * 60 * 60 * 1000)
    if (timer.unref) timer.unref()

    const server = app.listen(PORT, () => {
      console.log(`✅ 服务运行：http://localhost:${PORT}`)
      if (process.env.NODE_ENV === 'production') {
        console.log('🚀 运行模式：生产环境（已启用压缩/安全头/访问日志）')
      }
      printLanUrls(PORT)
      console.log('🔑 密钥读取情况：DEEPSEEK_API_KEY ' + (process.env.DEEPSEEK_API_KEY ? '已读取' : '未读取') +
        ' ｜ BAIDU_API_KEY ' + (process.env.BAIDU_API_KEY ? '已读取' : '未读取') +
        ' ｜ BAIDU_SECRET_KEY ' + (process.env.BAIDU_SECRET_KEY ? '已读取' : '未读取'))
      console.log('🤖 AI 识别状态：' + (() => {
        const ds = !!process.env.DEEPSEEK_API_KEY
        const bd = !!(process.env.BAIDU_API_KEY && process.env.BAIDU_SECRET_KEY)
        if (ds && bd) return 'DeepSeek + 百度植物识别（真实 AI 识别）'
        if (ds) return '仅 DeepSeek（用大模型识图 + 判断病害）'
        if (bd) return '仅百度植物识别（病害按本地库匹配）'
        const demo = String(process.env.DEMO_MODE || '') === '1'
        return demo
          ? '未配置密钥 —— 当前 DEMO_MODE=1，识别会返回「演示数据」（明确标注非识别结果）'
          : '未配置密钥 —— 识别功能会直接报错提示配置密钥（不再返回假结果）。填好 DEEPSEEK_API_KEY 后重启即可；只想看界面可设 DEMO_MODE=1'
      })())
      console.log('🧩 Node ' + process.versions.node + ' ｜ 数据库驱动 ' + (String(process.env.DB_DRIVER || 'sqlite').toLowerCase() === 'mysql' ? 'MySQL' : 'SQLite'))
      console.log(`🔧 管理后台：http://localhost:${PORT}/admin`)
    })

    // 端口被占用时给出明确提示（常见原因：上一次的后端没关掉，旧代码还在跑）
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error('')
        console.error('❌ 端口 ' + PORT + ' 已被占用 —— 已经有一个后端在运行（可能跑的是旧代码）')
        console.error('   请先关掉那个后端的命令行窗口，或结束它，然后重新执行 node app.js')
        console.error('   提示：识别结果异常时，很可能就是旧后端还在服务，你改的代码没生效。')
        console.error('')
        process.exit(1)
      }
      console.error('❌ 服务启动错误：', err)
      process.exit(1)
    })

    // 退出时打个招呼（数据库的关闭由 config/db.js 里的 SIGINT/SIGTERM 处理）
    process.on('SIGTERM', () => console.log('\n收到 SIGTERM，正在退出...'))
    process.on('SIGINT', () => console.log('\n收到 SIGINT，正在退出...'))
  } catch (err) {
    console.error('❌ 启动失败：', err)
    process.exit(1)
  }
}
startServer()
