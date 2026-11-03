param(
  [switch]$NoBrowser
)
# 禾诊 · 后端一键启动
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$be   = Join-Path $here 'agriculture-backend'
if (-not (Test-Path $be)) { Write-Host "找不到后端目录: $be" -ForegroundColor Red; exit 1 }

Write-Host "=== 禾诊 · 后端启动 ===" -ForegroundColor Green

# 1. 读取 .env 判断用哪个数据库
$driver = 'sqlite'
$envFile = Join-Path $be '.env'
if (Test-Path $envFile) {
  $line = Select-String -Path $envFile -Pattern '^DB_DRIVER=(.+)$' | Select-Object -First 1
  if ($line) { $driver = $line.Matches[0].Groups[1].Value.Trim() }
}
Write-Host ("数据库驱动: " + $driver)

# 2. MySQL 服务（只在用 mysql 时检查）
if ($driver -eq 'mysql') {
  $svc = Get-Service -Name 'MySQL80' -ErrorAction SilentlyContinue
  if ($svc -and $svc.Status -ne 'Running') {
    Write-Host "MySQL 服务未运行，正在启动..." -ForegroundColor Yellow
    Start-Service -Name 'MySQL80'
    Start-Sleep -Seconds 3
  }
  Write-Host ("MySQL80: " + (Get-Service -Name 'MySQL80').Status)
}

# 3. 端口检查
$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  $proc = Get-Process -Id $listener[0].OwningProcess -ErrorAction SilentlyContinue
  Write-Host ("端口 3000 已被占用（" + $proc.ProcessName + " PID " + $proc.Id + "）—— 后端可能已在运行") -ForegroundColor Yellow
  if (-not $NoBrowser) { Start-Process 'http://localhost:3000/admin' }
  exit 0
}

# 4. node 检查
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "未找到 node，请先安装 Node.js" -ForegroundColor Red; exit 1
}

# 5. 启动
Write-Host "正在启动 node app.js ..."
Start-Process -FilePath 'node' -ArgumentList 'app.js' -WorkingDirectory $be -WindowStyle Minimized
Start-Sleep -Seconds 5

# 6. 健康检查
$ok = $false
for ($i = 0; $i -lt 10; $i++) {
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/health' -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch { Start-Sleep -Seconds 2 }
}

if ($ok) {
  Write-Host "后端已启动: http://localhost:3000" -ForegroundColor Green
  Write-Host "管理后台:   http://localhost:3000/admin" -ForegroundColor Green
  if (-not $NoBrowser) { Start-Process 'http://localhost:3000/admin' }
} else {
  Write-Host "启动超时，请检查 agriculture-backend 目录下是否报错" -ForegroundColor Red
  exit 1
}
