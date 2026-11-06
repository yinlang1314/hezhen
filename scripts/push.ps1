# 推送脚本：先试 SSH，失败就走 HTTPS + 本地代理（7890）
#
# 用法：powershell -ExecutionPolicy Bypass -File scripts\push.ps1
# 背景：这台机器 SSH(22) 常被重置，HTTPS 直连也不通，需要 FlClash 之类的本地代理。

param([string]$Proxy = "http://127.0.0.1:7890", [string]$Branch = "main")

Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "尝试 SSH 推送…" -ForegroundColor Cyan
git push origin $Branch 2>$null
if ($LASTEXITCODE -eq 0) { Write-Host "✅ SSH 推送成功" -ForegroundColor Green; exit 0 }

Write-Host "SSH 不通，改用 HTTPS + 代理 $Proxy …" -ForegroundColor Yellow
git -c http.proxy=$Proxy -c https.proxy=$Proxy push https://github.com/yinlang1314/hezhen.git $Branch
if ($LASTEXITCODE -eq 0) {
  # 同步本地 remote-tracking 引用，避免 git status 显示 ahead
  $sha = git rev-parse HEAD
  git update-ref "refs/remotes/origin/$Branch" $sha
  Write-Host "✅ HTTPS 推送成功（记得开代理）" -ForegroundColor Green
} else {
  Write-Host "❌ 两种方式都失败：确认代理已开启（默认 127.0.0.1:7890）" -ForegroundColor Red
  exit 1
}
