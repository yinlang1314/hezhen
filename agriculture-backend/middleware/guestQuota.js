// ==================================================================
// 游客识别次数限制（服务端）
//
// 之前"游客 3 次"只存在前端 localStorage —— 清缓存或直接打接口就无限用，
// 等于把付费 AI 接口免费开放。
//
// 这里按「IP + 天」计数，默认 3 次/天，可用环境变量调整：
//   GUEST_RECOGNIZE_LIMIT=0   关闭限制（本地调试用）
// 注意：内存计数，重启清零；够防刷，不是精确计费。
// ==================================================================
const LIMIT = process.env.GUEST_RECOGNIZE_LIMIT === undefined
  ? 3
  : parseInt(process.env.GUEST_RECOGNIZE_LIMIT, 10)

const hits = new Map()   // key: yyyy-mm-dd|ip → count

function today() {
  return new Date().toISOString().slice(0, 10)
}

module.exports = function guestQuota(req, res, next) {
  // 已登录用户不限制（登录本身有限流）
  const hasToken = !!(req.header('Authorization') || req.header('token'))
  if (hasToken) return next()
  if (LIMIT <= 0) return next()

  const ip = String(req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress || '')
    .replace('::ffff:', '').split(',')[0].trim()
  const key = today() + '|' + ip
  const used = hits.get(key) || 0

  if (used >= LIMIT) {
    return res.status(429).json({
      code: 429,
      message: '游客每天可识别 ' + LIMIT + ' 次，登录后不限次数（当前 IP 今日已用完）',
      data: { guestLimit: LIMIT }
    })
  }
  hits.set(key, used + 1)

  // 每天清理一次旧 key，防止内存无限涨
  if (hits.size > 5000) {
    const d = today()
    for (const k of hits.keys()) if (!k.startsWith(d)) hits.delete(k)
  }
  next()
}
