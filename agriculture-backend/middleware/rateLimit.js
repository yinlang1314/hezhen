// 简单的内存限流：防止 AI 识别接口被频繁调用（每次都花钱）
// 说明：按 IP + 用户 计数，仅在单进程内有效，对毕业设计/课程项目足够。
const buckets = new Map()

// 定期清理过期桶，避免内存无限增长
setInterval(() => {
  const now = Date.now()
  for (const [key, b] of buckets) {
    if (now > b.resetAt) buckets.delete(key)
  }
}, 60 * 1000).unref()

/**
 * @param {object} opts
 * @param {number} opts.windowMs 时间窗口（毫秒）
 * @param {number} opts.max      窗口内最大请求数
 * @param {string} opts.message  超限提示
 */
function rateLimit(opts) {
  const windowMs = opts.windowMs || 60000
  const max = opts.max || 10
  return (req, res, next) => {
    const id = (req.user && req.user.id) ? 'u' + req.user.id : 'ip' + (req.ip || req.connection.remoteAddress || 'unknown')
    const key = req.baseUrl + '|' + req.path + '|' + id
    const now = Date.now()
    let b = buckets.get(key)
    if (!b || now > b.resetAt) {
      b = { count: 0, resetAt: now + windowMs }
      buckets.set(key, b)
    }
    b.count++
    res.setHeader('X-RateLimit-Limit', max)
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - b.count))
    if (b.count > max) {
      const wait = Math.ceil((b.resetAt - now) / 1000)
      return res.status(429).json({
        code: 429,
        message: (opts.message || '操作过于频繁') + '，请 ' + wait + ' 秒后再试'
      })
    }
    next()
  }
}

module.exports = rateLimit
