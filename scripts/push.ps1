# 推送脚本：先试 SSH，失败走 HTTPS + 本地代理
#
# 用法：powershell -ExecutionPolicy Bypass -File scripts\push.ps1
# 说明：这台机器 GitHub SSH(22) 常被重置、HTTPS 直连不通，需本地代理（默认 7890）。
# 注意：PowerShell 会把 git 的 stderr 当错误显示（红色），但退出码在 $LASTEXITCODE 里，
#       所以这里统一 2>&1 捕获，再按退出码判断。

param([string]$Proxy = "http://127.0.0.1:7890", [string]$Branch = "main")

Set-Location (Join-Path $PSScriptRoot "..")
$ErrorActionPreference = "Continue"

function Try-Push([string[]]$gitArgs, [string]$label) {
  Write-Host ("尝试 " + $label + " …") -ForegroundColor Cyan
  $out = & git @gitArgs 2>&1
  $code = $LASTEXITCODE
  $out | ForEach-Object { Write-Host ("  " + $_) }
  return $code
}

$code = Try-Push @("push", "origin", $Branch) "SSH"
if ($code -eq 0) { Write-Host "✅ SSH 推送成功" -ForegroundColor Green; exit 0 }

$proxyArg = "http.proxy=" + $Proxy
$proxyArg2 = "https.proxy=" + $Proxy
$code = Try-Push @("-c", $proxyArg, "-c", $proxyArg2, "push", "https://github.com/yinlang1314/hezhen.git", $Branch) ("HTTPS + 代理 " + $Proxy)

if ($code -eq 0) {
  $sha = (git rev-parse HEAD).Trim()
  git update-ref ("refs/remotes/origin/" + $Branch) $sha
  Write-Host "✅ HTTPS 推送成功（代理开着就行）" -ForegroundColor Green
} else {
  Write-Host "❌ 两种方式都失败：确认代理已开启（默认 127.0.0.1:7890）" -ForegroundColor Red
  exit 1
}
