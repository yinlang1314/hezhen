const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { dbRun, dbGet } = require('../config/db')
const guard = require('../middleware/loginGuard')
const { JWT_SECRET } = require('../config/secrets')

// 注册（bcrypt 哈希密码）
exports.register = async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password) {
      return res.json({ code: 400, message: '用户名和密码不能为空' })
    }
    if (String(username).trim().length < 4) {
      return res.json({ code: 400, message: '账号至少4位' })
    }
    if (String(username).trim().length > 20) {
      return res.json({ code: 400, message: '账号不能超过20位' })
    }
    if (password.length < 6) {
      return res.json({ code: 400, message: '密码长度不能少于6位' })
    }
    if (password.length > 64) {
      return res.json({ code: 400, message: '密码过长' })
    }

    // 检查用户名是否已存在
    const existing = await dbGet('SELECT id FROM users WHERE username = ?', [username])
    if (existing) {
      return res.json({ code: 400, message: '用户名已存在' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    await dbRun('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword])
    res.json({ code: 200, message: '注册成功' })
  } catch (error) {
    console.error('注册失败:', error)
    res.json({ code: 500, message: '注册失败' })
  }
}

// 登录（bcrypt 校验密码）
exports.login = async (req, res) => {
  try {
    const username = String(req.body.username || '').slice(0, 40)
    const password = String(req.body.password || '')
    const ip = guard.clientIp(req)

    if (!username || !password) {
      return res.json({ code: 400, message: '用户名和密码不能为空' })
    }

    // 失败次数过多则临时锁定（防暴力破解）
    const lock = await guard.checkLock(username, ip)
    if (lock.locked) {
      console.warn('🔒 登录被锁定: ' + username + ' @' + ip + ' 来源=' + lock.scope)
      return res.status(429).json({
        code: 429,
        message: '尝试次数过多，该' + lock.scope + '已被临时锁定，请 ' + Math.ceil(lock.remain / 60) + ' 分钟后再试'
      })
    }

    const user = await dbGet('SELECT * FROM users WHERE username = ?', [username])
    if (!user) {
      await guard.logAttempt({ username, ip, success: false, reason: '账号不存在' })
      return res.json({ code: 400, message: '账号或密码错误' })
    }

    // 密码校验：新库一律是 bcrypt 哈希。
    // 注意：原代码对“短密码/非 bcrypt”的账号有一个万能密码 123456 的后门，
    // 任何历史遗留账号都能用 123456 登录，已移除。
    // 若确实存在早期明文密码账号，请用后台「用户管理 → 重置密码」处理。
    let passwordValid = false
    if (String(user.password || '').indexOf('$2') === 0) {
      passwordValid = await bcrypt.compare(password, user.password)
    } else {
      // 明文密码只在“完全相等”时才通过（不再放行 123456）
      passwordValid = (password === user.password)
      if (passwordValid) {
        console.warn('⚠️ 账号 ' + user.username + ' 仍使用明文密码，建议在后台重置为加密密码')
      }
    }

    if (!passwordValid) {
      await guard.logAttempt({ username, userId: user.id, ip, success: false, reason: '密码错误' })
      return res.json({ code: 400, message: '账号或密码错误' })
    }

    guard.clearFailures(username).catch(() => {})
    await guard.logAttempt({ username, userId: user.id, ip, success: true, reason: '登录成功' })

    // 有效期可通过 .env 调整：JWT_EXPIRES（默认 7d；对外部署建议 12h）
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '7d' })
    res.json({
      code: 200,
      message: '登录成功',
      data: {
        token,
        // 返回 isAdmin 供前端提示「可进入管理后台」；昵称/头像供个人中心展示
        userInfo: {
          id: user.id,
          username: user.username,
          nickname: user.nickname || '',
          avatar: safeAvatar(user.avatar),
          isAdmin: !!user.is_admin
        }
      }
    })
  } catch (error) {
    console.error('登录失败:', error)
    res.json({ code: 500, message: '登录失败' })
  }
}

// 头像地址的兜底：数据库里可能存着已被删除的图片（换过头像、清理过 uploads），
// 直接返回会让前端一直请求 404。文件不存在时返回空串，前端显示默认头像。
function safeAvatar(avatar) {
  const v = String(avatar || '').trim()
  if (!v) return ''
  if (v.indexOf('/uploads/') !== 0) return v
  try {
    const rel = v.slice('/uploads/'.length).replace(/^\/+/, '')
    if (!rel || rel.indexOf('..') >= 0) return ''
    const file = require('path').join(__dirname, '..', 'public', 'uploads', rel)
    return require('fs').existsSync(file) ? v : ''
  } catch (e) {
    return v
  }
}

// ==================================================================
// 微信小程序登录
//
// 流程：小程序 uni.login() 拿 code → 这里带着 appid/secret 去微信换 openid
//      → 按 openid 找用户，没有就建一个 → 发 JWT（和账号密码登录同一套 token）
//
// 需要 .env 配两项（微信公众平台 → 开发管理 → 开发设置）：
//   WX_APPID=wxad5fc24db487f28b
//   WX_SECRET=你的 AppSecret
// ==================================================================
exports.wxLogin = async (req, res) => {
  try {
    const code = String((req.body && req.body.code) || '').trim()
    if (!code) return res.json({ code: 400, message: '缺少登录凭证 code' })

    const appid = process.env.WX_APPID || ''
    const secret = process.env.WX_SECRET || ''
    if (!appid || !secret) {
      return res.json({
        code: 400,
        message: '后端未配置微信登录（.env 里需要 WX_APPID 和 WX_SECRET），可先用账号密码登录'
      })
    }

    // 用 code 换 openid（微信官方接口，服务端调用）
    const url = 'https://api.weixin.qq.com/sns/jscode2session?appid=' + encodeURIComponent(appid)
      + '&secret=' + encodeURIComponent(secret)
      + '&js_code=' + encodeURIComponent(code)
      + '&grant_type=authorization_code'
    const wxRes = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const wxJson = await wxRes.json()
    if (wxJson.errcode) {
      console.error('微信登录失败:', wxJson.errcode, wxJson.errmsg)
      return res.json({ code: 400, message: '微信登录失败：' + (wxJson.errmsg || wxJson.errcode) })
    }
    const openid = String(wxJson.openid || '')
    if (!openid) return res.json({ code: 400, message: '微信未返回 openid' })

    // 按 openid 找用户，没有就建
    let user = await dbGet('SELECT * FROM users WHERE openid = ?', [openid])
    let isNew = false
    if (!user) {
      const username = 'wx_' + openid.slice(-8)
      const bcrypt = require('bcryptjs')
      // 微信用户不设可用密码（随机哈希），需要时可在后台重置
      const randomPwd = require('crypto').randomBytes(18).toString('hex')
      const hash = await bcrypt.hash(randomPwd, 10)
      const r = await dbRun(
        'INSERT INTO users (username, password, nickname, openid, source) VALUES (?, ?, ?, ?, ?)',
        [username, hash, '微信用户', openid, 'wechat']
      )
      const newId = (r && (r.insertId || r.lastID)) || null
      user = await dbGet('SELECT * FROM users WHERE id = ?', [newId])
      isNew = true
      console.log('🟢 微信新用户: ' + username + ' openid=' + openid.slice(0, 6) + '***')
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '7d' })
    res.json({
      code: 200,
      message: isNew ? '注册并登录成功' : '登录成功',
      data: {
        token,
        isNew,
        userInfo: {
          id: user.id,
          username: user.username,
          nickname: user.nickname || '',
          avatar: safeAvatar(user.avatar),
          isAdmin: !!user.is_admin
        }
      }
    })
  } catch (e) {
    console.error('微信登录异常:', e.message)
    res.json({ code: 500, message: '微信登录失败：' + e.message })
  }
}

// 获取用户信息
exports.getUserInfo = async (req, res) => {
  try {
    const user = await dbGet('SELECT id, username, nickname, avatar, is_admin, create_time, pwd_changed_at FROM users WHERE id = ?', [req.user.id])
    if (!user) return res.json({ code: 400, message: '用户不存在' })
    res.json({ code: 200, data: {
      id: user.id,
      username: user.username,
      nickname: user.nickname || '',
      avatar: safeAvatar(user.avatar),
      isAdmin: !!user.is_admin,
      create_time: user.create_time,
      // 从未改过密码时，前端可提示“建议修改密码”
      pwdChanged: !!user.pwd_changed_at
    } })
  } catch (error) {
    res.json({ code: 500, message: '获取用户信息失败' })
  }
}

// 修改自己的密码
exports.changePassword = async (req, res) => {
  try {
    const oldPwd = String(req.body.oldPassword || '')
    const newPwd = String(req.body.newPassword || '')
    if (!oldPwd || !newPwd) return res.json({ code: 400, message: '请填写完整' })
    if (newPwd.length < 6) return res.json({ code: 400, message: '新密码不能少于6位' })
    if (newPwd === oldPwd) return res.json({ code: 400, message: '新密码不能与旧密码相同' })
    if (/^(123456|admin|password|111111|000000)$/i.test(newPwd)) {
      return res.json({ code: 400, message: '该密码太常见，容易被猜到，请换一个' })
    }

    const user = await dbGet('SELECT id, password FROM users WHERE id = ?', [req.user.id])
    if (!user) return res.json({ code: 400, message: '用户不存在' })

    const ok = await bcrypt.compare(oldPwd, user.password)
    if (!ok) return res.json({ code: 400, message: '当前密码不正确' })

    const hashed = await bcrypt.hash(newPwd, 10)
    await dbRun("UPDATE users SET password = ?, pwd_changed_at = datetime('now') WHERE id = ?", [hashed, user.id])
    console.log('🔑 用户 ' + req.user.username + ' 修改了密码')
    res.json({ code: 200, message: '密码已修改' })
  } catch (err) {
    console.error('修改密码失败:', err)
    res.json({ code: 500, message: '修改失败' })
  }
}

// 修改个人资料（昵称 / 头像）
exports.updateProfile = async (req, res) => {
  try {
    const nickname = String(req.body.nickname || '').trim().slice(0, 20)
    // 头像地址清洗：前端展示时会拼 ?token=xxx 做鉴权，保存时必须去掉，
    // 否则数据库里会存成 "/uploads/x.png?token=..."，以后永远加载失败。
    let avatar = String(req.body.avatar || '').trim().slice(0, 500)
    avatar = avatar.split('#')[0].split('?')[0].replace(/^https?:\/\/[^/]+/i, '')
    if (avatar && avatar.indexOf('/uploads/') !== 0 && !/^https?:\/\//i.test(avatar)) avatar = ''

    // 昵称允许留空（表示恢复默认，用账号名显示）
    if (nickname && nickname.length < 1) {
      return res.json({ code: 400, message: '昵称不合法' })
    }
    await dbRun('UPDATE users SET nickname = ?, avatar = ? WHERE id = ?', [nickname, avatar, req.user.id])

    const user = await dbGet('SELECT id, username, nickname, avatar, is_admin, pwd_changed_at FROM users WHERE id = ?', [req.user.id])
    res.json({ code: 200, message: '保存成功', data: {
      id: user.id,
      username: user.username,
      nickname: user.nickname || '',
      avatar: safeAvatar(user.avatar),
      isAdmin: !!user.is_admin,
      pwdChanged: !!user.pwd_changed_at
    } })
  } catch (err) {
    console.error('保存资料失败:', err)
    res.json({ code: 500, message: '保存失败' })
  }
}

exports.logout = (req, res) => { res.json({ code: 200, message: '退出成功' }) }

// 提交反馈
exports.submitFeedback = async (req, res) => {
  try {
    const content = String(req.body.content || '').trim().slice(0, 500)
    const type = String(req.body.type || '其他').trim().slice(0, 20)
    if (!content) return res.json({ code: 400, message: '请输入反馈内容' })

    await dbRun(
      'INSERT INTO feedback (user_id, type, content) VALUES (?, ?, ?)',
      [req.user.id, type, content]
    )
    console.log(`📝 用户反馈 [${type}]: ${content.substring(0, 100)}`)
    res.json({ code: 200, message: '感谢您的反馈！' })
  } catch (err) {
    console.error('提交反馈失败:', err)
    res.json({ code: 500, message: '提交失败' })
  }
}