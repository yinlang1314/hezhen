param([switch]$IncludeH5)
# 禾诊 · 停止服务（默认只停后端 3000；加 -IncludeH5 连前端一起停）
$ports = @(3000)
if ($IncludeH5) { $ports += 5173 }

foreach ($port in $ports) {
  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($listener) {
    foreach ($l in $listener) {
      $proc = Get-Process -Id $l.OwningProcess -ErrorAction SilentlyContinue
      if ($proc) {
        Stop-Process -Id $proc.Id -Force
        Write-Host ("已停止 " + $port + " 端口进程: " + $proc.ProcessName + " (PID " + $proc.Id + ")") -ForegroundColor Yellow
      }
    }
  } else {
    Write-Host ("端口 " + $port + " 未在监听，无需停止") -ForegroundColor DarkGray
  }
}
Write-Host "完成。" -ForegroundColor Green
