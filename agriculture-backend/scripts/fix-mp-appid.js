/**
 * 小程序编译后修正 project.config.json 里的 AppID
 *
 * HBuilderX 的 CLI 发行有时会忽略 manifest 里的 mp-weixin.appid，写成 touristappid，
 * 导致微信开发者工具里用的是"游客身份"。运行本脚本可一键改回真实 AppID。
 *
 *   node scripts/fix-mp-appid.js [AppID]
 */
const fs = require('fs')
const path = require('path')

const appid = process.argv[2] || 'wxad5fc24db487f28b'
const targets = [
  path.join(__dirname, '..', '..', 'unpackage', 'dist', 'build', 'mp-weixin', 'project.config.json'),
  path.join(__dirname, '..', '..', 'unpackage', 'dist', 'dev', 'mp-weixin', 'project.config.json')
]

let fixed = 0
for (const f of targets) {
  if (!fs.existsSync(f)) continue
  try {
    const cfg = JSON.parse(fs.readFileSync(f, 'utf8'))
    if (cfg.appid !== appid) {
      cfg.appid = appid
      fs.writeFileSync(f, JSON.stringify(cfg, null, 2), 'utf8')
      console.log('✅ ' + f.replace(/^.*unpackage/, 'unpackage') + ' → ' + appid)
      fixed++
    }
  } catch (e) {
    console.error('处理失败: ' + f + ' · ' + e.message)
  }
}
console.log(fixed ? '完成，共修正 ' + fixed + ' 个文件' : '无需修改（或产物不存在）')
