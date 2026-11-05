// ==================================================================
// 管理员接口鉴权（JWT 版）
//
// 背景：/api/disease 下面挂着一批后台管理接口（新增/编辑/删除/补全），
// 早期直接从后台页面搬迁过来，忘了加鉴权 —— 匿名就能删改知识库。
// 这里对"必须管理员"的接口统一把关。
//
// 与 routes/admin.js 的 checkAuth 区别：
//   checkAuth 用 session（给 HTML 后台页面用）
//   requireAdmin 用 JWT（给 /api/* 接口用）
// ==================================================================
const jwt = require('jsonwebtoken')
const { JWT_SECRET } = require('../config/secrets')
const { dbGet } = require('../config/db')

module.exports = async (req, res, next) => {
  // 1) 后台页面已经登录过时，放行（浏览器带着 session）
  if (req.session && req.session.isAdmin) return next()

  // 2) 否则要求 JWT，并且该用户必须是管理员
  const raw = req.header('Authorization') || req.header('token') || req.query.token || ''
  const token = String(raw).replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return res.status(401).json({ code: 401, message: '需要管理员权限' })
  }
  let decoded
  try {
    decoded = jwt.verify(token, JWT_SECRET)
  } catch (e) {
    return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' })
  }
  try {
    const row = await dbGet('SELECT is_admin FROM users WHERE id = ?', [decoded.id])
    if (!row || Number(row.is_admin) !== 1) {
      return res.status(403).json({ code: 403, message: '当前账号不是管理员' })
    }
    req.user = decoded
    next()
  } catch (e) {
    res.status(500).json({ code: 500, message: '鉴权失败：' + e.message })
  }
}
