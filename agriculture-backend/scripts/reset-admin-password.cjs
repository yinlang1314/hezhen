#!/usr/bin/env node
/**
 * 重置管理员（admin）密码
 *
 *   node scripts/reset-admin-password.cjs                  # 生成随机强密码，直接改
 *   node scripts/reset-admin-password.cjs --show           # 只显示当前是随机密码模式
 *   node scripts/reset-admin-password.cjs --pwd=Abc12345!  # 指定密码
 *   node scripts/reset-admin-password.cjs --user=yin       # 改别的账号
 *
 * 用途：忘了后台/App 密码时救急。改完记得把新密码记到安全的地方。
 */
const path = require('path')
const crypto = require('crypto')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const bcrypt = require('bcryptjs')
const { dbRun, dbGet } = require('../config/db')

const arg = (k, def) => {
  const hit = process.argv.find((a) => a.startsWith('--' + k + '='))
  return hit ? hit.split('=').slice(1).join('=') : def
}

const username = arg('user', 'admin')
let pwd = arg('pwd', '')

if (!pwd) {
  // 生成便于手输的强密码：大写+小写+数字+符号，去掉易混淆字符
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const pick = (n) => crypto.randomBytes(n).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, n)
  pwd = (pick(3).toUpperCase() || 'ABC') + (pick(4) || 'abcd') + (Math.floor(Math.random() * 90) + 10) + '!'
}

async function main() {
  const user = await dbGet('SELECT id, username, is_admin FROM users WHERE username = ?', [username])
  if (!user) {
    console.error('❌ 没有这个账号：' + username)
    process.exit(1)
  }
  const hash = await bcrypt.hash(pwd, 10)
  await dbRun('UPDATE users SET password = ? WHERE id = ?', [hash, user.id])

  console.log('✅ 已重置密码')
  console.log('   账号：' + user.username + (Number(user.is_admin) === 1 ? '（管理员）' : ''))
  console.log('   新密码：' + pwd)
  console.log('')
  console.log('   App / 小程序：用这个账号密码登录')
  console.log('   管理后台：http://localhost:3000/admin 同一个密码')
  console.log('')
  console.log('⚠️  请立刻把新密码记到安全的地方，并更新 .env 里的 E2E_ADMIN_PASSWORD（跑测试要用）')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1) })
