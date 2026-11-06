#!/usr/bin/env node
/**
 * APK 打包收尾：云打包出来后跑这一条
 *
 *   node scripts/finalize-apk.js
 *
 * 做四件事：
 *   1) 找 unpackage/release/apk 里最新的 APK，用 aapt2 读包名/版本
 *   2) 复制成 dist/apk/hezhen-v<版本>.apk
 *   3) 算 sha256 / 大小，更新 agriculture-backend/version.json
 *   4) 打印需要提交的文件
 *
 * 前置：HBuilderX 里已「发行 → 原生App-云打包」，APK 下载到 unpackage/release/apk
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execSync } = require('child_process')

const root = path.join(__dirname, '..')
const releaseDir = path.join(root, 'unpackage', 'release', 'apk')
const outDir = path.join(root, 'dist', 'apk')
const versionFile = path.join(root, 'agriculture-backend', 'version.json')

// aapt2 在 HBuilderX 插件目录里（用来读 APK 元信息）
const AAPT = 'E:\\wj\\HBuilderX\\plugins\\uts-development-android\\static\\win\\aapt2.exe'

if (!fs.existsSync(releaseDir)) {
  console.error('❌ 没找到 ' + releaseDir + '，先在 HBuilderX 里云打包')
  process.exit(1)
}

const apks = fs.readdirSync(releaseDir)
  .filter((f) => f.toLowerCase().endsWith('.apk'))
  .map((f) => ({ name: f, full: path.join(releaseDir, f), mtime: fs.statSync(path.join(releaseDir, f)).mtime }))
  .sort((a, b) => b.mtime - a.mtime)

if (!apks.length) {
  console.error('❌ ' + releaseDir + ' 里没有 .apk')
  process.exit(1)
}

const apk = apks[0]
console.log('① 最新 APK：' + apk.name)
console.log('   时间：' + apk.mtime.toLocaleString('zh-CN'))

// 用 aapt2 读包名与版本（比解析 APK 内 JSON 稳）
let pkgName = '', versionName = '', versionCode = 0
try {
  const out = execSync('"' + AAPT + '" dump badging "' + apk.full + '"', { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  const m = out.match(/package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/)
  if (m) { pkgName = m[1]; versionCode = Number(m[2]); versionName = m[3] }
} catch (e) {
  console.warn('⚠️ aapt2 读取失败：' + e.message)
}

if (!versionName) {
  // 兜底：读项目 manifest（去掉注释再解析）
  const raw = fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  const mf = JSON.parse(raw)
  versionName = mf.versionName
  versionCode = Number(mf.versionCode)
  console.warn('⚠️ 用项目 manifest 兜底：v' + versionName)
}

console.log('② 包名：' + (pkgName || '（未读到）'))
console.log('   版本：v' + versionName + '（' + versionCode + '）')

if (versionCode && versionCode < 110) {
  console.error('❌ versionCode=' + versionCode + '，比预期的 110 小 —— 检查是不是打错包了')
  process.exit(1)
}
if (pkgName && pkgName !== 'com.yinlang1314.hezhen') {
  console.error('❌ 包名是 ' + pkgName + '，旧包是 com.yinlang1314.hezhen，装不上')
  process.exit(1)
}

// 归档
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
const outName = 'hezhen-v' + versionName + '.apk'
const outPath = path.join(outDir, outName)
fs.copyFileSync(apk.full, outPath)
const buf = fs.readFileSync(outPath)
const sha256 = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase()
console.log('③ 归档：dist/apk/' + outName + '（' + (buf.length / 1048576).toFixed(2) + ' MB）')
console.log('   sha256：' + sha256)

// 更新 version.json
const ver = JSON.parse(fs.readFileSync(versionFile, 'utf8'))
const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
ver.android = {
  versionName,
  versionCode,
  url: 'https://github.com/yinlang1314/hezhen/raw/main/dist/apk/' + outName,
  notes: (ver.android && ver.android.notes) || '',
  builtAt: now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()),
  file: 'dist/apk/' + outName,
  sha256: sha256.slice(0, 24)
}
fs.writeFileSync(versionFile, JSON.stringify(ver, null, 2), 'utf8')
console.log('④ version.json 已更新（应用内「检查更新」会读到 v' + versionName + '）')
console.log('')
console.log('下一步：git add dist/apk agriculture-backend/version.json && git commit')
