const jwt = require('jsonwebtoken')
const { JWT_SECRET } = require('../config/secrets')

module.exports = (req, res, next) => {
  // 支持从 Authorization header 或 token header 获取
  const token = (req.header('Authorization') || '').replace('Bearer ', '') ||
                req.header('token') ||
                req.query.token

  if (!token) {
    return res.status(401).json({ code: 401, message: '该功能需要登录后使用（识别与问答无需登录）' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' })
  }
}