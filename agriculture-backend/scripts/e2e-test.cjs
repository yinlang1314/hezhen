
/* 端到端回归测试（可重复运行）
 * 用法：node scripts/_e2e-test.cjs <baseUrl> <driver>
 *   driver = mysql | sqlite（用于测试数据清理）
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const fs = require('fs')

const BASE = process.argv[2] || 'http://127.0.0.1:3000'
const DRIVER = process.argv[3] || 'mysql'
const ADMIN_PWD = process.env.E2E_ADMIN_PASSWORD || 'Nong2026#SL'
const results = []
// 记录测试开始时的最大 id，结束时只删自己产生的行（测试可重复运行）
const __MAXID__ = { corrections: 0, login_logs: 0 }
async function snapshotMaxIds() {
  if (DRIVER !== 'mysql') return
  try {
    const m = require('mysql2/promise')
    const c = await m.createConnection({ host: '127.0.0.1', port: 3306, user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE })
    for (const t of Object.keys(__MAXID__)) {
      const [[r]] = await c.query('SELECT COALESCE(MAX(id),0) mx FROM ' + t)
      __MAXID__[t] = r.mx
    }
    await c.end()
  } catch (e) { console.error('快照 id 失败:', e.message) }
}
const t0 = Date.now()

function rec(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? '  ·  ' + detail : ''))
}

async function api(method, p, { token, body, form, raw } = {}) {
  const headers = {}
  if (token) headers.Authorization = 'Bearer ' + token
  let payload
  if (form) payload = form
  else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body) }
  const res = await fetch(BASE + p, { method, headers, body: payload })
  if (raw) return res
  const text = await res.text()
  try { return { status: res.status, json: JSON.parse(text) } } catch (e) { return { status: res.status, text } }
}

async function run() {
  await snapshotMaxIds()
  // ---------- 0. 健康检查 ----------
  const h = await api('GET', '/api/health')
  rec('健康检查', h.status === 200 && h.json.code === 200, 'db=' + h.json.database)

  // ---------- 1. 用户流程 ----------
  const uname = 'e2e_' + Date.now().toString().slice(-7)
  const reg = await api('POST', '/api/user/register', { body: { username: uname, password: 'Test2026#x' } })
  rec('注册', reg.json && reg.json.code === 200, reg.json && reg.json.message)

  const dup = await api('POST', '/api/user/register', { body: { username: uname, password: 'Test2026#x' } })
  rec('重复注册被拒', dup.json && dup.json.code === 400)

  const badLogin = await api('POST', '/api/user/login', { body: { username: uname, password: 'wrong123' } })
  rec('错误密码被拒', badLogin.json && badLogin.json.code === 400)

  const login = await api('POST', '/api/user/login', { body: { username: uname, password: 'Test2026#x' } })
  const token = login.json && login.json.data && login.json.data.token
  rec('登录', !!token)

  const info = await api('GET', '/api/user/info', { token })
  rec('获取个人信息', info.json && info.json.code === 200, info.json && info.json.data && info.json.data.username)

  const prof = await api('POST', '/api/user/profile', { token, body: { nickname: '测试昵称' } })
  rec('修改昵称', prof.json && prof.json.code === 200, prof.json && prof.json.message)

  const cp = await api('POST', '/api/user/change-password', { token, body: { oldPassword: 'Test2026#x', newPassword: 'Test2026#y' } })
  rec('修改密码', cp.json && cp.json.code === 200)

  const relogin = await api('POST', '/api/user/login', { body: { username: uname, password: 'Test2026#y' } })
  const token2 = relogin.json && relogin.json.data && relogin.json.data.token
  rec('新密码登录', !!token2)

  const fb = await api('POST', '/api/user/feedback', { token: token2, body: { type: 'other', content: '端到端测试反馈，稍后清理' } })
  rec('提交反馈', fb.json && fb.json.code === 200)

  // ---------- 2. 知识库 ----------
  const list = await api('GET', '/api/disease/diseases/list?page=1&pageSize=5')
  const listData = list.json && list.json.data
  const arr = Array.isArray(listData) ? listData : (listData && listData.list) || []
  rec('百科列表', list.status === 200 && arr.length > 0, '返回 ' + arr.length + ' 条 · total=' + (listData && listData.total))

  const badPage = await api('GET', '/api/disease/diseases/list?page=-1&pageSize=9999')
  rec('分页参数防御(page=-1)', badPage.status === 200, 'HTTP ' + badPage.status)

  const search = await api('GET', '/api/disease/diseases/list?keyword=玉米&pageSize=5')
  rec('关键词搜索', search.status === 200 && search.json.code === 200)

  const detail = await api('GET', '/api/disease/detail?id=4')
  rec('病害详情', detail.json && detail.json.code === 200, detail.json && detail.json.data && detail.json.data.name)

  // 下面三个是后台管理接口：匿名访问必须被挡住（2026-11-05 修复：原来没鉴权）
  const root = await api('GET', '/api/disease/')
  rec('管理接口·匿名拦截(/)', root.status === 401, 'HTTP ' + root.status)

  const news = await api('GET', '/api/disease/new')
  rec('管理接口·匿名拦截(new)', news.status === 401, 'HTTP ' + news.status)

  const aifill = await api('GET', '/api/disease/ai-fill?name=水稻稻瘟病&limit=3')
  rec('管理接口·匿名拦截(ai-fill)', aifill.status === 401, 'HTTP ' + aifill.status)

  // ---------- 3. 识别 ----------
  // 测试用的图片必须放在仓库里（public/images/seed），不能指向 uploads ——
  // uploads 里的孤儿文件会被 clean-uploads 清掉，测试就会 ENOENT 崩掉。
  const seedDir = path.join(__dirname, '..', 'public', 'images', 'seed')
  const seedPick = (fs.readdirSync(seedDir).filter((f) => /\.(jpe?g|png)$/i.test(f))[0]) || ''
  const imgPath = path.join(seedDir, seedPick)
  const img = fs.readFileSync(imgPath)
  const form = () => { const f = new FormData(); f.append('image', new Blob([img], { type: 'image/jpeg' }), 'test.jpg'); return f }

  const fastT = Date.now()
  const fast = await api('POST', '/api/disease/recognize?fast=1&save=0', { form: form() })
  const fastName = fast.json && fast.json.data && (fast.json.data.name || fast.json.data.diseaseName)
  rec('识别-快速通道', fast.status === 200 && !!fastName, fastName + ' · ' + ((Date.now() - fastT) / 1000).toFixed(2) + 's')

  const full = await api('POST', '/api/disease/recognize', { token: token2, form: form() })
  const histId = full.json && full.json.data && full.json.data.historyId
  rec('识别-完整流程', full.status === 200 && !!full.json.data, (full.json.data && full.json.data.name) + ' · historyId=' + histId)

  const batchForm = new FormData()
  batchForm.append('images', new Blob([img], { type: 'image/jpeg' }), 'a.jpg')
  batchForm.append('images', new Blob([img], { type: 'image/jpeg' }), 'b.jpg')
  const batch = await api('POST', '/api/disease/recognize-batch', { form: batchForm })
  rec('连拍识别(2 张)', batch.status === 200)

  // ---------- 4. 历史 ----------
  const hl = await api('GET', '/api/history/list?page=1&pageSize=5', { token: token2 })
  const hArr = Array.isArray(hl.json.data) ? hl.json.data : []
  rec('历史列表', hl.json && hl.json.code === 200, 'total=' + hl.json.total + ' 返回 ' + hArr.length)

  if (hArr[0]) {
    const hd = await api('GET', '/api/history/detail?id=' + hArr[0].id, { token: token2 })
    rec('历史详情', hd.json && hd.json.code === 200, hd.json && hd.json.data && hd.json.data.disease_name)

    const corr = await api('POST', '/api/disease/correct', { token: token2, body: { historyId: hArr[0].id, aiName: hArr[0].disease_name, correctName: '玉米大斑病', plantName: '玉米' } })
    rec('纠错提交', corr.json && corr.json.code === 200, corr.json && corr.json.message)

    const del = await api('POST', '/api/history/delete', { token: token2, body: { id: hArr[0].id } })
    rec('删除历史', del.json && del.json.code === 200)
  }

  const clr = await api('POST', '/api/history/clear', { token: token2 })
  rec('清空历史', clr.json && clr.json.code === 200)

  // ---------- 5. 收藏 ----------
  const did = arr[0] && arr[0].id
  const add = await api('POST', '/api/collection/add', { token: token2, body: { disease_id: did, name: arr[0] && arr[0].name, type: arr[0] && arr[0].type, image: arr[0] && arr[0].image } })
  rec('添加收藏', add.json && add.json.code === 200, add.json && add.json.message)

  const cl = await api('GET', '/api/collection/list', { token: token2 })
  const cArr = Array.isArray(cl.json.data) ? cl.json.data : (cl.json.data && cl.json.data.list) || []
  rec('收藏列表', cl.json && cl.json.code === 200, '共 ' + cArr.length + ' 条')

  if (cArr[0]) {
    const cd = await api('POST', '/api/collection/delete', { token: token2, body: { id: cArr[0].id } })
    rec('取消收藏', cd.json && cd.json.code === 200)
  }

  // ---------- 6. 预警 / 问答 ----------
  const warn = await api('GET', '/api/warning/list')
  const wArr = Array.isArray(warn.json.data) ? warn.json.data : (warn.json.data && warn.json.data.list) || []
  rec('预警列表', warn.json && warn.json.code === 200, '共 ' + wArr.length + ' 条')

  const chat = await api('POST', '/api/chat/ask', { body: { question: '玉米叶片出现长条形褐色病斑是什么病？', history: [] } })
  const chatText = chat.json && (chat.json.data && (chat.json.data.answer || chat.json.data.content)) 
  rec('AI 问答', chat.status === 200 && !!chatText, chatText ? String(chatText).slice(0, 24) + '…' : (chat.json && chat.json.message))

  // ---------- 7. 后台 ----------
  const adminLogin = await fetch(BASE + '/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: 'admin', password: ADMIN_PWD }),
    redirect: 'manual'
  })
  const cookies = (adminLogin.headers.getSetCookie ? adminLogin.headers.getSetCookie() : [adminLogin.headers.get('set-cookie')])
    .map((x) => String(x).split(';')[0]).filter(Boolean).join('; ')
  rec('后台登录', adminLogin.status === 302 || adminLogin.status === 200)

  const pages = [
    ['/', '数据概览'], ['/diseases', '病虫害库'], ['/diseases?status=pending', '待核实筛选'],
    ['/histories', '识别历史'], ['/users', '用户管理'], ['/corrections', '纠错'],
    ['/feedback', '反馈'], ['/security', '安全日志'], ['/password', '改密页']
  ]
  for (const [p, name] of pages) {
    const res = await fetch(BASE + '/admin' + p, { headers: { cookie: cookies } })
    const html = await res.text()
    const bad = /读取失败|出错了|服务器错误|Cannot read/.test(html)
    rec('后台·' + name, res.status === 200 && !bad, html.length + ' 字节')
  }

  // ---------- 8. 数据一致性 ----------
  const stats = await api('GET', '/api/stats/summary')
  rec('统计接口', stats.json && stats.json.code === 200, JSON.stringify(stats.json.data || {}).slice(0, 80))

  // ---------- 清理测试数据 ----------
  const mysql = require('mysql2/promise')
  const sqlite3 = require('sqlite3')
  if (DRIVER === 'mysql') {
    const conn = await mysql.createConnection({ host: '127.0.0.1', port: 3306, user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE })
    await conn.query("DELETE FROM feedback WHERE content LIKE '端到端测试反馈%'")
    await conn.query("DELETE FROM corrections WHERE id > ?", [__MAXID__.corrections || 0])
    await conn.query("DELETE FROM login_logs WHERE id > ?", [__MAXID__.login_logs || 0])
    await conn.query("DELETE FROM users WHERE username = ?", [uname])
    for (const t of ['corrections', 'login_logs']) {
      const [[mx]] = await conn.query('SELECT COALESCE(MAX(id),0) mx FROM ' + t)
      await conn.query('ALTER TABLE ' + t + ' AUTO_INCREMENT = ' + (mx.mx + 1))
    }
    const [[u]] = await conn.query("SELECT COUNT(*) c FROM users")
    const [[f]] = await conn.query("SELECT COUNT(*) c FROM feedback")
    console.log('\n清理后 users=' + u.c + ' feedback=' + f.c)
    await conn.end()
  } else {
    const lite = await new Promise((res, rej) => { const db = new sqlite3.Database(path.join(__dirname, '..', 'agriculture.db'), (e) => e ? rej(e) : res(db)) })
    const exec = (sql, p = []) => new Promise((res, rej) => lite.run(sql, p, (e) => e ? rej(e) : res()))
    await exec("DELETE FROM feedback WHERE content LIKE '端到端测试反馈%'")
    await exec("DELETE FROM login_logs WHERE username = ?", [uname])
    await exec("DELETE FROM users WHERE username = ?", [uname])
    lite.close()
    console.log('\nSQLite 测试数据已清理')
  }

  const pass = results.filter((r) => r.ok).length
  console.log('\n========== ' + pass + '/' + results.length + ' 通过 · ' + ((Date.now() - t0) / 1000).toFixed(1) + 's ==========')
  const fails = results.filter((r) => !r.ok)
  if (fails.length) { console.log('失败项:'); fails.forEach((f) => console.log('  ✗ ' + f.name + '  ' + (f.detail || ''))) }
  process.exit(fails.length ? 1 : 0)
}

run().catch((e) => { console.error('测试异常:', e); process.exit(2) })
