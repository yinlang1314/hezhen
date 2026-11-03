#!/bin/bash
# ==================================================================
#  禾诊 · 病虫害识别系统（旧项目）—— macOS 启动脚本 v2
#
#  用法：
#    1) 放在项目根目录（和 pages.json、agriculture-backend 同级）
#    2) chmod +x 启动旧项目-mac.command
#    3) 双击，或： bash 启动旧项目-mac.command
#
#  子命令：
#    test      只检查环境
#    diagnose  诊断：打印依赖/HBuilderX/端口/日志，出问题时发这段
#    stop      停止后端
# ==================================================================

set -u

G="\033[32m"; Y="\033[33m"; R="\033[31m"; C="\033[36m"; D="\033[90m"; N="\033[0m"
cmd="$1"
if [ -z "$cmd" ]; then cmd="start"; fi

echo ""
echo -e "$G========================================================$N"
echo -e "$G  禾诊 · 病虫害识别系统（旧项目）  macOS$N"
echo -e "$G========================================================$N"

# ---------- 定位项目 ----------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT=""
check_dir() { if [ -f "$1/agriculture-backend/app.js" ]; then ROOT="$1"; return 0; fi; return 1; }
if [ -n "${HZ_ROOT:-}" ] && [ -f "$HZ_ROOT/agriculture-backend/app.js" ]; then
  ROOT="$HZ_ROOT"
elif check_dir "$SCRIPT_DIR"; then :
elif check_dir "$SCRIPT_DIR/禾诊"; then :
elif check_dir "$(pwd)"; then :
else
  echo -e "$R  [错误] 没找到项目目录（需要 agriculture-backend/app.js）$N"
  echo -e "$D         把脚本放进项目根目录，或 export HZ_ROOT=/路径/禾诊$N"
  exit 1
fi
BACKEND="$ROOT/agriculture-backend"
PIDFILE="$BACKEND/.backend.pid"
LOGFILE="$BACKEND/backend.log"
H5_PID="$ROOT/.h5.pid"
echo -e "$D  项目目录: $ROOT$N"

# ---------- 找 HBuilderX（多路径 + mdfind） ----------
find_hbx() {
  local c
  for c in "/Applications/HBuilderX.app/Contents/MacOS/cli" \
           "$HOME/Applications/HBuilderX.app/Contents/MacOS/cli" \
           "/Applications/HBuilderX/HBuilderX.app/Contents/MacOS/cli" \
           "/Applications/HBuilderX/cli"; do
    if [ -x "$c" ]; then echo "$c"; return 0; fi
  done
  if command -v mdfind >/dev/null 2>&1; then
    c="$(mdfind "kMDItemCFBundleIdentifier == 'io.dcloud.HBuilderX'" 2>/dev/null | head -1)"
    if [ -n "$c" ] && [ -x "$c/Contents/MacOS/cli" ]; then echo "$c/Contents/MacOS/cli"; return 0; fi
    c="$(mdfind -name "HBuilderX.app" 2>/dev/null | head -1)"
    if [ -n "$c" ] && [ -x "$c/Contents/MacOS/cli" ]; then echo "$c/Contents/MacOS/cli"; return 0; fi
  fi
  return 1
}
HBX_CLI="$(find_hbx)"

# ---------- 诊断模式 ----------
if [ "$cmd" = "diagnose" ]; then
  echo ""
  echo -e "$C  ===== 诊断信息（把这一段发给我）=====$N"
  echo "  系统: $(sw_vers -productVersion 2>/dev/null) $(uname -m)"
  echo "  项目: $ROOT"
  echo "  Node: $(node -v 2>/dev/null || echo 未安装)"
  echo "  npm:  $(npm -v 2>/dev/null || echo 未安装)"
  echo "  HBuilderX CLI: ${HBX_CLI:-未找到}"
  echo "  /Applications/HBuilderX.app: $([ -d /Applications/HBuilderX.app ] && echo 存在 || echo 不存在)"
  echo "  依赖 node_modules: $([ -d "$BACKEND/node_modules" ] && echo 存在 || echo 不存在)"
  if [ -d "$BACKEND/node_modules" ]; then
    echo -n "  sqlite3 原生模块: "
    ( cd "$BACKEND" && node -e "require('sqlite3'); console.log('可用')" 2>/dev/null || echo "不可用（需 npm install）" )
  fi
  echo "  .env: $([ -f "$BACKEND/.env" ] && echo 存在 || echo 不存在)"
  echo -n "  3000 端口: "; lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1 && echo 占用中 || echo 空闲
  echo -n "  5173 端口: "; lsof -nP -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1 && echo 占用中 || echo 空闲
  echo -n "  后端健康: "; curl -s -m 3 http://127.0.0.1:3000/api/health || echo "无响应"
  echo ""
  if [ -f "$LOGFILE" ]; then
    echo "  ---- 后端日志最后 20 行 ----"
    tail -n 20 "$LOGFILE"
  else
    echo "  （还没有后端日志）"
  fi
  echo -e "$C  ===== 诊断结束 =====$N"
  echo ""
  exit 0
fi

# ---------- 停止 ----------
if [ "$cmd" = "stop" ]; then
  for f in "$PIDFILE" "$H5_PID"; do
    if [ -f "$f" ]; then
      PID="$(cat "$f")"
      kill "$PID" 2>/dev/null && echo -e "$G  已停止进程 $PID$N"
      rm -f "$f"
    fi
  done
  exit 0
fi

# ---------- Node ----------
if ! command -v node >/dev/null 2>&1; then
  echo -e "$R  [错误] 没找到 node，请先装 Node.js：https://nodejs.org$N"
  exit 1
fi
echo -e "$D  Node.js: $(node -v)$N"
echo -e "$D  HBuilderX: ${HBX_CLI:-未找到}$N"

# ---------- 依赖 ----------
need=0
if [ ! -d "$BACKEND/node_modules" ]; then need=1;
elif ! ( cd "$BACKEND" && node -e "require('sqlite3')" >/dev/null 2>&1 ); then
  need=1; echo -e "$Y  node_modules 原生模块不匹配（Windows 拷来的），需要重装$N"
fi
if [ "$need" = "1" ]; then
  echo -e "$C  正在安装依赖（1~3 分钟）…$N"
  ( cd "$BACKEND" && npm install --no-audit --no-fund ) || { echo -e "$R  依赖安装失败$N"; exit 1; }
fi

# ---------- .env ----------
if [ ! -f "$BACKEND/.env" ]; then
  cp "$BACKEND/.env.example" "$BACKEND/.env" 2>/dev/null
  echo -e "$Y  已从 .env.example 生成 .env（AI 密钥要自己填）$N"
fi

# ---------- IP ----------
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null)"
[ -z "$LAN_IP" ] && LAN_IP="$(ipconfig getifaddr en1 2>/dev/null)"
[ -z "$LAN_IP" ] && LAN_IP="$(ifconfig 2>/dev/null | awk '/inet /{print $2}' | grep -v '^127' | head -1)"

CFG="$ROOT/utils/config.js"
if [ -n "$LAN_IP" ] && [ -f "$CFG" ]; then
  CUR="$(grep -o "BACKEND_HOST = 'http://[^']*'" "$CFG" | head -1 | sed "s|.*http://||" | sed "s/'//")"
  if [ -n "$CUR" ] && [ "$CUR" != "$LAN_IP" ]; then
    sed -i "" "s|BACKEND_HOST = 'http://[^']*'|BACKEND_HOST = 'http://$LAN_IP'|" "$CFG"
    echo -e "$Y  [地址已更新] $CUR -> $LAN_IP$N"
  fi
fi

# ---------- 端口 ----------
busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
B3=0; B5=0
busy 3000 && B3=1
busy 5173 && B5=1

echo -e "$D----------------------------------------------------------$N"
echo -e "$C  访问地址$N"
echo -e "$Y     http://localhost:5173$N"
[ -n "$LAN_IP" ] && echo -e "$Y     http://$LAN_IP:5173   （手机，同一 WiFi）$N"
echo -e "$D  管理后台$N"
echo -e "$Y     http://localhost:3000/admin$N"
echo -e "$D  账号 admin / Nong2026#SL$N"
echo -e "$D----------------------------------------------------------$N"

if [ "$cmd" = "test" ]; then
  echo -e "$C  [测试模式] 未启动任何服务$N"
  exit 0
fi

# ---------- 后端 ----------
if [ "$B3" = "1" ]; then
  echo -e "$D  3000 已被占用，跳过$N"
else
  echo -e "$C  启动后端…$N"
  ( cd "$BACKEND" && nohup node app.js > "$LOGFILE" 2>&1 & echo $! > "$PIDFILE" )
  sleep 2
fi

# ---------- 前端 ----------
STATIC_H5="$ROOT/unpackage/dist/build/h5/index.html"
if [ "$B5" = "1" ]; then
  echo -e "$D  5173 已在运行，跳过$N"
elif [ -n "$HBX_CLI" ]; then
  echo -e "$C  启动 H5（HBuilderX 编译中，约 40 秒）…$N"
  "$HBX_CLI" project open --path "$ROOT" >/dev/null 2>&1
  sleep 1
  nohup "$HBX_CLI" launch web --project "$ROOT" > "$ROOT/.h5-launch.log" 2>&1 &
  echo $! > "$H5_PID"
elif [ -f "$STATIC_H5" ]; then
  echo -e "$C  找到已打包的 H5，用内置静态服务器启动…$N"
  TMPD="$(mktemp -d)"
  SERVER="$TMPD/server.js"
  cat > "$SERVER" <<'EOFSERVER'
const http = require("http"), fs = require("fs"), path = require("path");
const root = process.argv[2], port = Number(process.argv[3] || 5173);
const mime = { ".html":"text/html; charset=utf-8", ".js":"text/javascript", ".css":"text/css",
  ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".gif":"image/gif",
  ".svg":"image/svg+xml", ".json":"application/json", ".ico":"image/x-icon",
  ".woff":"font/woff", ".woff2":"font/woff2", ".ttf":"font/ttf", ".map":"application/json" };
http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p === "/") p = "/index.html";
  let file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end("forbidden"); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { file = path.join(root, "index.html"); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
}).listen(port, () => console.log("H5 static server: http://localhost:" + port));
EOFSERVER
  nohup node "$SERVER" "$(dirname "$STATIC_H5")" 5173 > "$ROOT/.h5.log" 2>&1 &
  echo $! > "$H5_PID"
else
  echo ""
  echo -e "$Y  ============================================$N"
  echo -e "$Y   前端需要 HBuilderX（Mac 版），而且是免费的$N"
  echo -e "$Y  ============================================$N"
  echo -e "$D   下载：https://www.dcloud.io/hbuilderx.html$N"
  echo -e "$D   装好后把 HBuilderX.app 拖进「应用程序」，再运行本脚本$N"
  echo -e "$D   （只要能打开 HBuilderX 就行，不需要登录）$N"
  echo ""
  echo -e "$G   现在就能用管理后台：http://localhost:3000/admin$N"
  echo ""
  echo -e "$D   如果 HBuilderX 其实已经装了，运行诊断把结果发我：$N"
  echo -e "$D   bash 启动旧项目-mac.command diagnose$N"
fi

# ---------- 等待 ----------
echo ""
echo -e "$C  等待服务就绪…$N"
OK3=0; OK5=0; i=0
while [ "$i" -lt 25 ]; do
  sleep 2
  if [ "$OK3" = "0" ] && curl -s -o /dev/null -m 2 http://127.0.0.1:3000/api/health; then OK3=1; fi
  if [ "$OK5" = "0" ] && curl -s -o /dev/null -m 2 http://127.0.0.1:5173/; then OK5=1; fi
  if [ "$OK3" = "1" ] && [ "$OK5" = "1" ]; then break; fi
  i=$((i+1))
done

echo ""
echo -e "$D----------------------------------------------------------$N"
if [ "$OK3" = "1" ]; then echo -e "$G  后端 3000：✅$N"; else echo -e "$R  后端 3000：❌ 看日志 $LOGFILE$N"; fi
if [ "$OK5" = "1" ]; then echo -e "$G  前端 5173：✅$N"; else echo -e "$Y  前端 5173：❌（见上面的提示）$N"; fi
echo -e "$D----------------------------------------------------------$N"
echo ""
if [ "$OK5" = "1" ]; then open "http://localhost:5173" 2>/dev/null
elif [ "$OK3" = "1" ]; then open "http://localhost:3000/admin" 2>/dev/null; fi

echo -e "$D  停止：bash 启动旧项目-mac.command stop$N"
echo -e "$D  诊断：bash 启动旧项目-mac.command diagnose$N"
echo ""
