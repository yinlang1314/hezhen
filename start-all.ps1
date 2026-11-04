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
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "后端没能启动，前端就先不起了。" -ForegroundColor Red
    Write-Host "按上面提示处理后，重新运行 一键启动.bat 即可" -ForegroundColor Yellow
    exit 1
  }
}

# ---------- 2. H5 开发服务器 ----------
$h5 = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if ($h5) {
  Write-Host "H5 开发服务器已在运行（端口 5173）" -ForegroundColor Yellow
} else {
  # 自动探测 HBuilderX（不再写死某台电脑的路径）
  $cli = $null
  $candidates = @()
  if ($env:HBUILDERX_HOME) { $candidates += (Join-Path $env:HBUILDERX_HOME 'cli.exe') }
  # 注意：不能用 Join-Path 拼不存在的盘符（会抛 DriveNotFoundException），
  # 这里一律用字符串拼接 + Test-Path 静默判断
  $vendorDirs = @('C:\Program Files\HBuilderX', 'C:\Program Files (x86)\HBuilderX',
                  'D:\HBuilderX', 'E:\HBuilderX', 'F:\HBuilderX', 'G:\HBuilderX',
                  'D:\yingyong\HBuilderX', 'E:\wj\HBuilderX', 'D:\应用\HBuilderX',
                  'C:\HBuilderX')
  if ($env:LOCALAPPDATA) { $vendorDirs += ($env:LOCALAPPDATA + '\Programs\HBuilderX') }
  if ($env:USERPROFILE) { $vendorDirs += ($env:USERPROFILE + '\HBuilderX') }
  foreach ($d in $vendorDirs) {
    $candidates += ($d.TrimEnd('\') + '\cli.exe')
  }
  # 注册表里找安装目录（HBuilderX 卸载项）
  foreach ($k in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
                   'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
                   'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*')) {
    Get-ItemProperty $k -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -match 'HBuilderX' -and $_.InstallLocation } |
      ForEach-Object { $candidates += ($_.InstallLocation.TrimEnd('\') + '\cli.exe') }
  }
  foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) { $cli = $c; break }
  }

  if (-not $cli) {
    Write-Host "未找到 HBuilderX（cli.exe）。" -ForegroundColor Yellow
    Write-Host "  前端不受影响：直接用 HBuilderX 打开项目 → 运行 → 运行到浏览器" -ForegroundColor Yellow
    Write-Host "  或设置环境变量指定安装目录：HBUILDERX_HOME=D:\你的路径\HBuilderX" -ForegroundColor Yellow
  } else {
    Write-Host ("HBuilderX: " + $cli)
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
