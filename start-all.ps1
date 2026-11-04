param(
  [switch]$NoBrowser
)
# 禾诊 · 一键启动（后端 + 前端开发服务器）
# 后端逻辑已内联，不再需要单独的 start-backend.ps1
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$be = Join-Path $here 'agriculture-backend'
if (-not (Test-Path $be)) { Write-Host "找不到后端目录: $be" -ForegroundColor Red; exit 1 }

Write-Host '=== 禾诊 · 一键启动 ===' -ForegroundColor Green

# ==================== 1. 后端 ====================
$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  Write-Host '后端已在运行（端口 3000）' -ForegroundColor Yellow
} else {
  # 驱动
  $driver = 'sqlite'
  $envFile = Join-Path $be '.env'
  if (Test-Path $envFile) {
    $line = Select-String -Path $envFile -Pattern '^DB_DRIVER=(.+)$' | Select-Object -First 1
    if ($line) { $driver = $line.Matches[0].Groups[1].Value.Trim() }
  }
  Write-Host ('数据库驱动: ' + $driver)

  if ($driver -eq 'mysql') {
    $svc = Get-Service -Name 'MySQL80' -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -ne 'Running') {
      Write-Host 'MySQL 服务未运行，正在启动...' -ForegroundColor Yellow
      Start-Service -Name 'MySQL80'; Start-Sleep -Seconds 3
    }
    if ($svc) { Write-Host ('MySQL80: ' + (Get-Service -Name 'MySQL80').Status) }
    else { Write-Host '未找到 MySQL80 服务（若用 MySQL 请先安装）' -ForegroundColor Yellow }
  }

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host '未找到 node，请先安装 Node.js（推荐 22 LTS）：https://nodejs.org/zh-cn' -ForegroundColor Red
    exit 1
  }
  Write-Host ('Node: ' + (node -v))

  # 依赖
  if (-not (Test-Path (Join-Path $be 'node_modules'))) {
    Write-Host '还没安装依赖，正在执行 npm install（首次约 15~60 秒）...' -ForegroundColor Yellow
    $npm = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { 'npm.cmd' } else { 'npm' }
    Push-Location $be
    & $npm install --no-audit --no-fund 2>&1 | Out-Host
    Pop-Location
    if (-not (Test-Path (Join-Path $be 'node_modules'))) {
      Write-Host 'npm install 失败，请到 agriculture-backend 目录手动执行 npm install' -ForegroundColor Red
      exit 1
    }
  }

  # 启动（输出进日志）
  Write-Host '正在启动 node app.js ...'
  $logDir = Join-Path $be 'logs'
  if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
  $log = Join-Path $logDir 'startup.log'
  Remove-Item $log -ErrorAction SilentlyContinue
  $cmdLine = 'node app.js > "' + $log + '" 2>&1'
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $cmdLine -WorkingDirectory $be -WindowStyle Hidden
  Start-Sleep -Seconds 6

  $ok = $false
  for ($i = 0; $i -lt 12; $i++) {
    try {
      $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/health' -UseBasicParsing -TimeoutSec 3
      if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch { Start-Sleep -Seconds 2 }
  }

  if (-not $ok) {
    Write-Host '后端启动失败，下面是它自己的输出：' -ForegroundColor Red
    Write-Host '----------------------------------------'
    if (Test-Path $log) { Get-Content $log -Tail 25 | ForEach-Object { Write-Host ('  ' + $_) -ForegroundColor DarkYellow } }
    else { Write-Host '  （没有产生日志）' }
    Write-Host '----------------------------------------'
    Write-Host '常见原因：依赖没装好 / 端口被占用 / Node 版本太低' -ForegroundColor Yellow
    Write-Host ('完整日志: ' + $log)
    exit 1
  }
  Write-Host '后端已启动: http://localhost:3000' -ForegroundColor Green
}

# ==================== 2. 前端 ====================
$h5 = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if ($h5) {
  Write-Host 'H5 开发服务器已在运行（端口 5173）' -ForegroundColor Yellow
} else {
  # 自动探测 HBuilderX（不能用 Join-Path 拼不存在的盘符）
  $cli = $null
  $candidates = @()
  if ($env:HBUILDERX_HOME) { $candidates += ($env:HBUILDERX_HOME.TrimEnd('\') + '\cli.exe') }
  $dirs = @('C:\Program Files\HBuilderX','C:\Program Files (x86)\HBuilderX','D:\HBuilderX','E:\HBuilderX','F:\HBuilderX','G:\HBuilderX','D:\yingyong\HBuilderX','E:\wj\HBuilderX','D:\应用\HBuilderX','C:\HBuilderX')
  if ($env:LOCALAPPDATA) { $dirs += ($env:LOCALAPPDATA + '\Programs\HBuilderX') }
  if ($env:USERPROFILE) { $dirs += ($env:USERPROFILE + '\HBuilderX') }
  foreach ($d in $dirs) { $candidates += ($d.TrimEnd('\') + '\cli.exe') }
  foreach ($k in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*')) {
    Get-ItemProperty $k -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match 'HBuilderX' -and $_.InstallLocation } | ForEach-Object { $candidates += ($_.InstallLocation.TrimEnd('\') + '\cli.exe') }
  }
  foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { $cli = $c; break } }

  if (-not $cli) {
    Write-Host '未找到 HBuilderX（cli.exe）。' -ForegroundColor Yellow
    Write-Host '  前端可手动启动：HBuilderX 打开项目 → 运行 → 运行到浏览器' -ForegroundColor Yellow
    Write-Host '  或设置环境变量：setx HBUILDERX_HOME "D:\你的路径\HBuilderX"' -ForegroundColor Yellow
  } else {
    Write-Host ('HBuilderX: ' + $cli)
    if (-not (Get-Process -Name HBuilderX -ErrorAction SilentlyContinue)) {
      Write-Host 'HBuilderX 未运行，正在打开...' -ForegroundColor Yellow
      Start-Process -FilePath $cli -ArgumentList 'open'
      Start-Sleep -Seconds 15
    }
    Write-Host '正在编译前端（首屏约 20~40 秒）...'
    Start-Process -FilePath $cli -ArgumentList @('launch','web','--project',$here) -WindowStyle Minimized
    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep -Seconds 3
      if (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) { break }
    }
    if (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) {
      Write-Host 'H5 已启动: http://localhost:5173' -ForegroundColor Green
    } else {
      Write-Host '前端 60 秒内没起来，可手动在 HBuilderX 点「运行到浏览器」' -ForegroundColor Yellow
    }
  }
}

# ==================== 3. 地址 ====================
if (-not $NoBrowser) {
  Start-Sleep -Seconds 1
  Start-Process 'http://localhost:5173'
  Start-Process 'http://localhost:3000/admin'
}
Write-Host ''
Write-Host '地址汇总:' -ForegroundColor Cyan
Write-Host '  前端 H5   http://localhost:5173'
Write-Host '  后端接口  http://localhost:3000/api/health'
Write-Host '  管理后台  http://localhost:3000/admin'
Write-Host '  手机访问  http://<本机IP>:5173（需与手机同一 Wi-Fi）'