#!/usr/bin/env node
/**
 * 极简静态服务器 —— 给「没用 HBuilderX 的电脑」看前端用
 *
 * 背景：uni-app 项目要 HBuilderX 编译才有 5173；别人电脑没装 HBuilderX 就看不到界面。
 * 这里直接把已编译好的 dist/h5 用 Node 跑起来（零依赖），页面里的接口会自动指向
 * 同一台机器的 3000 端口后端（H5 用当前网页地址推导后端地址）。
 *
 *   node serve-h5.js            # 默认 5178
 *   node serve-h5.js 8080       # 指定端口
 */
const http = require('http')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, 'dist', 'h5')
const PORT = Number(process.argv[2]) || 5178

if (!fs.existsSync(ROOT)) {
  console.error('找不到前端构建产物：' + ROOT)
  console.error('请先在有 HBuilderX 的电脑上执行：cli publish web --project <项目路径>')
  process.exit(1)
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  if (urlPath === '/') urlPath = '/index.html'
  let file = path.join(ROOT, urlPath)

  // 防止越权访问（../）
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('403') }

  fs.stat(file, (err, st) => {
    if (err || st.isDirectory()) {
      // 只有页面路由才回退到 index.html；带扩展名的静态资源缺失就 404，
      // 否则浏览器会把 index.html 当 js 解析，报一堆莫名其妙的语法错误
      if (path.extname(urlPath)) { res.writeHead(404); return res.end('404') }
      file = path.join(ROOT, 'index.html')
    }
    fs.readFile(file, (e, buf) => {
      if (e) { res.writeHead(404); return res.end('404') }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' })
      res.end(buf)
    })
  })
})

server.listen(PORT, () => {
  console.log('')
  console.log('  禾诊 · 网页版已启动')
  console.log('  ----------------------------------------')
  console.log('  本机访问：  http://localhost:' + PORT)
  console.log('  手机访问：  http://<本机IP>:' + PORT + '（同一 Wi-Fi）')
  console.log('  需要先启动后端：npm start（在 agriculture-backend 目录）')
  console.log('  ----------------------------------------')
  console.log('  按 Ctrl+C 停止')
})
