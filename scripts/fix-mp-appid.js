#!/usr/bin/env node
/**
 * 把小程序构建产物里的 appid 改成正式 AppID
 *
 * 为什么需要：HBuilderX 打包时如果 manifest 里 mp-weixin.appid 是空的，
 * 产物 project.config.json 会写成 touristappid（游客模式），
 * 微信开发者工具导入后无法调用 uni.login / 云能力。
 *
 *   node scripts/fix-mp-appid.js              # 修 dist/mp-weixin
 *   node scripts/fix-mp-appid.js --src        # 连 unpackage 的构建产物一起修
 */
const fs = require('fs')
const path = require('path')

const APPID = 'wxd39a68a5252ac842'
const root = path.join(__dirname, '..')
const targets = [path.join(root, 'dist', 'mp-weixin', 'project.config.json')]
if (process.argv.includes('--src')) targets.push(path.join(root, 'unpackage', 'dist', 'build', 'mp-weixin', 'project.config.json'))

let changed = 0
for (const file of targets) {
  if (!fs.existsSync(file)) { console.log('跳过（不存在）: ' + file); continue }
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (cfg.appid === APPID) { console.log('已是正确 appid: ' + file); continue }
  cfg.appid = APPID
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2), 'utf8')
  changed++
  console.log('✅ 已修正: ' + file)
}
console.log(changed ? '完成，共修 ' + changed + ' 处' : '无需修改')
