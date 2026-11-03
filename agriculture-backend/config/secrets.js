/**
 * 密钥集中管理
 *
 * 生产环境请在 .env 里设置 JWT_SECRET / SESSION_SECRET（各 32 位以上随机串）。
 * 未配置时回退到开发默认值并告警 —— 这个值绝不能用于线上。
 */
const DEV_FALLBACK = 'dev-only-secret-change-me'

const JWT_SECRET = process.env.JWT_SECRET || DEV_FALLBACK
const SESSION_SECRET = process.env.SESSION_SECRET || DEV_FALLBACK

if (!process.env.JWT_SECRET || !process.env.SESSION_SECRET) {
  console.warn('⚠️  未配置 JWT_SECRET / SESSION_SECRET，正在使用开发默认值。上线前请在 .env 中设置。')
}

module.exports = { JWT_SECRET, SESSION_SECRET }
