#!/usr/bin/env node
/**
 * 构建 Vue 看板并同步到后端的 public/dashboard
 *
 * 为什么：看板是独立 Vue 工程，但要和后端同端口访问（http://localhost:3000/dashboard），
 * 每次改完要 build → 复制产物。这里一条命令搞定。
 *
 *   node dashboard/sync-to-backend.cjs
 */
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = __dirname
const target = path.join(root, '..', 'agriculture-backend', 'public', 'dashboard')

console.log('① 构建看板…')
execSync('npm run build', { cwd: root, stdio: 'inherit' })

console.log('② 同步产物到后端…')
if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true })
const copy = (s, d) => {
  fs.mkdirSync(d, { recursive: true })
  for (const e of fs.readdirSync(s, { withFileTypes: true })) {
    const sp = path.join(s, e.name), dp = path.join(d, e.name)
    if (e.isDirectory()) copy(sp, dp); else fs.copyFileSync(sp, dp)
  }
}
copy(path.join(root, 'dist'), target)
console.log('✅ 完成：重启后端后访问 http://localhost:3000/dashboard')
