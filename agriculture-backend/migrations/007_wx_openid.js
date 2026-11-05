// 007 · 微信小程序登录：users 增加 openid
//
// 微信登录流程：小程序 uni.login 拿 code → 后端 jscode2session 换 openid
// → 按 openid 找/建用户 → 发 JWT。
// openid 只在本应用内唯一，不加 UNIQUE 约束也能用，但加了能防重复注册。
module.exports = {
  id: '007',
  name: 'users 增加微信 openid',
  async up({ run, all, dialect, ensureColumn, hasIndex, ensureIndex }) {
    const short = dialect === 'mysql' ? 'VARCHAR(64)' : 'TEXT'
    await ensureColumn('users', 'openid', short)

    if (!(await hasIndex('users', 'idx_users_openid'))) {
      await ensureIndex('users', 'idx_users_openid', ['openid'])
    }

    // 微信用户的注册来源，便于后台区分（可选，失败不影响）
    await ensureColumn('users', 'source', dialect === 'mysql' ? 'VARCHAR(16)' : 'TEXT').catch(() => {})
  }
}
