// 编译后修复脚本：给小程序 app.json 补 subPackages 字段
// 背景：微信开发者工具（2.01.2510290）读取项目配置时会访问 config.subPackages，
//       uni-app 编译产物里没有这个字段，工具就抛
//      "Cannot read property 'subPackages' of undefined" 且模拟器起不来。
// 用法：HBuilderX 编译完成后执行  node fix-appjson.js
const fs = require('fs')
const path = require('path')

const targets = [
  path.join(__dirname, 'unpackage/dist/dev/mp-weixin/app.json'),
  path.join(__dirname, 'unpackage/dist/build/mp-weixin/app.json')
]

let fixed = 0
for (const p of targets) {
  if (!fs.existsSync(p)) continue
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'))
    if (j.subPackages) { console.log('已有 subPackages，跳过:', p); continue }
    const out = {}
    out.pages = j.pages
    out.subPackages = []
    Object.keys(j).forEach((k) => { if (k !== 'pages' && k !== 'subPackages') out[k] = j[k] })
    fs.writeFileSync(p, JSON.stringify(out, null, 2), 'utf8')
    console.log('✔ 已修复:', p)
    fixed++
  } catch (e) {
    console.error('处理失败:', p, e.message)
  }
}
console.log(fixed ? '完成，共修复 ' + fixed + ' 个文件' : '没有需要修复的文件')
