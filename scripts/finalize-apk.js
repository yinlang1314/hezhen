#!/usr/bin/env node
/**
 * APK 打包收尾：云打包出来后跑这一条
 *
 *   node scripts/finalize-apk.js
 *
 * 做四件事：
 *   1) 找 unpackage/release/apk 里最新的 APK，读里面的 manifest 确认版本号
 *   2) 复制成 dist/apk/hezhen-v<版本>.apk
 *   3) 算 sha256 / 大小，更新 agriculture-backend/version.json（应用内检查更新用）
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

// 从 APK 里的 manifest.json 读版本（uni-app 会把它打进 assets/apps/<appid>/www/manifest.json）
let version = null
try {
  const script = `
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $z = [System.IO.Compression.ZipFile]::OpenRead('${apk.full.replace(/'/g, "''")}')
    $e = $z.Entries | Where-Object { $_.FullName -like '*www/manifest.json' } | Select-Object -First 1
    if ($e) {
      $sr = New-Object System.IO.StreamReader($e.Open())
      $txt = $sr.ReadToEnd()
      $sr.Close()
      Write-Output $txt
    }
    $z.Dispose()
  `
  const out = execSync('powershell -NoProfile -Command ' + JSON.stringify(script), { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  const json = JSON.parse(out.trim())
  version = (json.version && (json.version.name || json.versionName)) ? { name: json.version.name, code: json.version.code } : null
  if (!version && json.versionName) version = { name: json.versionName, code: json.versionCode }
} catch (e) {
  console.warn('⚠️ 读 APK 内版本失败（' + e.message + '），用 manifest.json 里的版本')
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
const versionName = (version && version.name) || manifest.versionName
const versionCode = Number((version && version.code) || manifest.versionCode)
console.log('② 版本：v' + versionName + '（' + versionCode + '）')

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
  notes: ver.android && ver.android.notes ? ver.android.notes : '',
  builtAt: now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()),
  file: 'dist/apk/' + outName,
  sha256: sha256.slice(0, 24)
}
delete ver.android.note
fs.writeFileSync(versionFile, JSON.stringify(ver, null, 2), 'utf8')
console.log('④ version.json 已更新（应用内「检查更新」会读到 v' + versionName + '）')
console.log('')
console.log('下一步：把 dist/apk 与 version.json 一起提交')
