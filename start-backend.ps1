param(
  [switch]$NoBrowser
)
# 禾诊 · 后端一键启动
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$be   = Join-Path $here 'agriculture-backend'
if (-not (Test-Path $be)) { Write-Host "找不到后端目录: $be" -ForegroundColor Red; exit 1 }

Write-Host '=== 禾诊 · 后端启动 ===' -ForegroundColor Green

# 1. 读取 .env 判断用哪个数据库
$driver = 'sqlite'
$envFile = Join-Path $be '.env'
if (Test-Path $envFile) {
  $line = Select-String -Path $envFile -Pattern '^DB_DRIVER=(.+)$' | Select-Object -First 1
  if ($line) { $driver = $line.Matches[0].Groups[1].Value.Trim() }
}
Write-Host ('数据库驱动: ' + $driver)

# 2. MySQL 服务（只在用 mysql 时检查）
if ($driver -eq 'mysql') {
  $svc = Get-Service -Name 'MySQL80' -ErrorAction SilentlyContinue
  if (-not $svc) { Write-Host '未找到 MySQL80 服务，若用 MySQL 请先安装/启动它' -ForegroundColor Yellow }
  elseif ($svc.Status -ne 'Running') {
    Write-Host 'MySQL 服务未运行，正在启动...' -ForegroundColor Yellow
    Start-Service -Name 'MySQL80'
    Start-Sleep -Seconds 3
  }
  if ($svc) { Write-Host ('MySQL80: ' + (Get-Service -Name 'MySQL80').Status) }
}

# 3. 端口检查
$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  $proc = Get-Process -Id $listener[0].OwningProcess -ErrorAction SilentlyContinue
  Write-Host ('端口 3000 已被占用（' + $proc.ProcessName + ' PID ' + $proc.Id + '）—— 后端可能已在运行') -ForegroundColor Yellow
  if (-not $NoBrowser) { Start-Process 'http://localhost:3000/admin' }
  exit 0
}

# 4. node 检查
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host '未找到 node，请先安装 Node.js（推荐 22 LTS）' -ForegroundColor Red
  Write-Host '下载：https://nodejs.org/zh-cn' -ForegroundColor Yellow
  exit 1
}
Write-Host ('Node: ' + (node -v))

# 5. 依赖检查（没装 node_modules 时自动装，避免 node 直接崩）
if (-not (Test-Path (Join-Path $be 'node_modules'))) {
  Write-Host '还没安装依赖，正在执行 npm install（首次约 15~60 秒）...' -ForegroundColor Yellow
  $npm = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { 'npm.cmd' } else { 'npm' }
  Push-Location $be
  & $npm install --no-audit --no-fund 2>&1 | Out-Host
  Pop-Location
  if (-not (Test-Path (Join-Path $be 'node_modules'))) {
    Write-Host 'npm install 失败，请到 agriculture-backend 目录手动执行 npm install 查看报错' -ForegroundColor Red
    exit 1
  }
}

# 6. 启动（输出重定向到日志，失败时能直接打印）
Write-Host '正在启动 node app.js ...'
$logDir = Join-Path $be 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = Join-Path $logDir 'startup.log'
Remove-Item $log -ErrorAction SilentlyContinue
$cmdLine = 'node app.js > "' + $log + '" 2>&1'
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $cmdLine -WorkingDirectory $be -WindowStyle Hidden
Start-Sleep -Seconds 6

# 7. 健康检查
$ok = $false
for ($i = 0; $i -lt 12; $i++) {
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/health' -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch { Start-Sleep -Seconds 2 }
}

if ($ok) {
  Write-Host '后端已启动: http://localhost:3000' -ForegroundColor Green
  Write-Host '管理后台:   http://localhost:3000/admin' -ForegroundColor Green
  if (-not $NoBrowser) { Start-Process 'http://localhost:3000/admin' }
  exit 0
}

Write-Host '启动超时，下面是后端自己的输出：' -ForegroundColor Red
Write-Host '----------------------------------------'
if (Test-Path $log) { Get-Content $log -Tail 25 | ForEach-Object { Write-Host ('  ' + $_) -ForegroundColor DarkYellow } }
else { Write-Host '  （没有产生日志）' }
Write-Host '----------------------------------------'
Write-Host '常见原因：' -ForegroundColor Yellow
Write-Host '  1. 依赖缺失      -> cd agriculture-backend 后 npm install'
Write-Host '  2. 端口被占用    -> 先关掉占用的程序'
Write-Host '  3. Node 版本太低 -> 装 Node 22 LTS'
Write-Host ('完整日志: ' + $log)
exit 1