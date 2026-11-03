param(
  [switch]$NoBrowser
)
# 禾诊 · 一键启动（后端 + 前端开发服务器）
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "=== 禾诊 · 一键启动 ===" -ForegroundColor Green

# ---------- 1. 后端 ----------
$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  Write-Host "后端已在运行（端口 3000）" -ForegroundColor Yellow
} else {
  & (Join-Path $here 'start-backend.ps1') -NoBrowser | Out-Host
}

# ---------- 2. H5 开发服务器 ----------
$h5 = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if ($h5) {
  Write-Host "H5 开发服务器已在运行（端口 5173）" -ForegroundColor Yellow
} else {
  $cli = 'E:\wj\HBuilderX\cli.exe'
  if (-not (Test-Path $cli)) {
    Write-Host "未找到 HBuilderX，跳过前端启动（也可以直接用 HBuilderX 打开项目运行）" -ForegroundColor Yellow
  } else {
    $hbx = Get-Process -Name HBuilderX -ErrorAction SilentlyContinue
    if (-not $hbx) {
      Write-Host "HBuilderX 未运行，正在启动..." -ForegroundColor Yellow
      Start-Process -FilePath $cli -ArgumentList 'open'
      Start-Sleep -Seconds 15
    }
    Write-Host "正在让 HBuilderX 运行到浏览器（首屏约 20~40 秒）..."
    Start-Process -FilePath $cli -ArgumentList @('launch', 'web', '--project', $here) -WindowStyle Minimized
    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep -Seconds 3
      if (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) { break }
    }
    if (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) {
      Write-Host "H5 已启动: http://localhost:5173" -ForegroundColor Green
    } else {
      Write-Host "H5 未能在 60 秒内启动，可手动在 HBuilderX 里点「运行 → 运行到浏览器」" -ForegroundColor Yellow
    }
  }
}

# ---------- 3. 打开页面 ----------
if (-not $NoBrowser) {
  Start-Sleep -Seconds 1
  Start-Process 'http://localhost:5173'
  Start-Process 'http://localhost:3000/admin'
}

Write-Host ""
Write-Host "地址汇总:" -ForegroundColor Cyan
Write-Host "  前端 H5   http://localhost:5173"
Write-Host "  后端接口  http://localhost:3000/api/health"
Write-Host "  管理后台  http://localhost:3000/admin  (账号见 .env 或首次启动日志)"
Write-Host "  手机访问  http://<本机IP>:5173（需与手机同一 Wi-Fi）"
