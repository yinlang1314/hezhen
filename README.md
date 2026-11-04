# 禾诊 · 智能病虫害识别系统

面向农户的作物病虫害识别与防治指导应用。拍照或实时对准作物，识别病害并给出**有农药登记依据**的用药方案，配套知识百科、预警、识别历史、收藏与 AI 农技问答。

**三种运行形态**（同一套 uni-app 代码）：H5 网页 · 微信小程序 · Android App

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | uni-app（Vue 3）+ 原生 CSS / rpx，一套代码编译 H5 / 小程序 / App |
| 后端 | Node.js + Express 4 + EJS 后台管理 |
| 数据库 | **SQLite（默认）/ MySQL 双驱动**，改 `.env` 一行切换 |
| AI | DeepSeek `deepseek-flash` 识图诊断 + 百度植物识别 |
| 数据源 | 农业农村部 NY/T 名录 + 中国农药信息网（ICAMA）农药登记库 |

---

## 环境要求

| 项 | 要求 |
|---|---|
| Node.js | **18 / 20 / 22 LTS**（推荐 22；Node 26 等新版本可能没有 sqlite3 预编译包，会编译失败）|
| npm | 随 Node 安装即可 |
| 浏览器 | Chrome / Edge 最新版（H5 运行）|
| HBuilderX | 仅编译前端/打 App 时需要 |

## 快速开始

```bash
# 1. 进入后端
cd agriculture-backend

# 2. 配置环境变量（照 .env.example 复制一份）
cp .env.example .env
#    填 DEEPSEEK_API_KEY / BAIDU_API_KEY / BAIDU_SECRET_KEY
#    生成鉴权密钥：JWT_SECRET / SESSION_SECRET（各 32 位以上随机串）

# 3. 安装依赖并启动
npm install
node app.js
# 或双击项目根目录的「一键启动.bat」
```

- 接口：`http://localhost:3000`
- 管理后台：`http://localhost:3000/admin`
- 首次启动会自动创建管理员 `admin`（初始密码 `123456`，可用 `ADMIN_INIT_PASSWORD` 指定，登录后请立即修改）

### 前端

```bash
# HBuilderX → 运行 → 运行到浏览器；或命令行
cli launch web --project <项目路径>
```

### 小程序 / App

```bash
# 小程序（需在 manifest.json 填自己的 AppID）
cli launch mp-weixin --project <项目路径> --compile true

# Android：HBuilderX → 发行 → 原生App-云打包
# 注意：签名证书不要提交到仓库（已在 .gitignore 里排除）
```

---

## 常见问题

### 1. `npm install` 失败 / sqlite3 编译报错

仓库已内置 `agriculture-backend/.npmrc`（npmmirror 镜像 + sqlite3 预编译源）。仍失败时：

```bash
npm install --registry=https://registry.npmmirror.com
# 仍不行就把 Node 降到 22 LTS 再装
```

### 2. PowerShell 报"在此系统上禁止运行脚本"

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### 3. 双击 .bat 被 Windows"智能应用控制"拦截

从网上下载的文件带 Mark-of-the-Web，未签名的 .bat 会被拦。不用双击，直接跑 .ps1：

```powershell
powershell -ExecutionPolicy Bypass -File .\start-all.ps1
```

（不建议关闭智能应用控制——关掉后想再开启需要重置 Windows。）

### 4. 下载的 zip 解压后有两层同名文件夹

GitHub 的源码包解压是 `hezhen-main/hezhen-main/...`。HBuilderX 要导入**内层**那个（里面有 `pages.json` 的目录）。

### 5. 前端没自动启动（找不到 HBuilderX）

`start-all.ps1` 会按「环境变量 → 常见安装目录 → 注册表」自动探测。装在别处就设一个环境变量：

```powershell
setx HBUILDERX_HOME "D:\你的路径\HBuilderX"
```

或直接在 HBuilderX 里打开项目 → 运行 → 运行到浏览器。

### 6. 想重新初始化数据库

```powershell
Remove-Item agriculture.db, agriculture.db-wal, agriculture.db-shm -ErrorAction SilentlyContinue
```

重启后会按最新表结构自动建表（已支持全新空库初始化）。

### 7. 未配置 AI 密钥时识别会报错

这是**有意为之**：没有密钥就不编造识别结果。

```json
{ "code": 400, "message": "未配置 AI 密钥，无法识别。请..." }
```

- 正常使用：在 `.env` 填 `DEEPSEEK_API_KEY` / `BAIDU_API_KEY` / `BAIDU_SECRET_KEY`
- 只想看界面：`.env` 里加 `DEMO_MODE=1`，会返回一条**明确标注「演示数据、非识别结果」**的知识库条目

### 8. 启动告警 `JWT_SECRET / SESSION_SECRET 未配置`

本地调试可忽略；**上线必须配置**，否则任何人都能伪造 token。

### 9. 空库启动时报 `no such table` / `no such column`

已在 2026-11 修复（建表顺序 + diseases 三列）。如果用的是旧版本代码，更新到最新 main 即可。

---

## 数据库切换

```bash
# .env
DB_DRIVER=sqlite          # 默认，零配置
# DB_DRIVER=mysql         # 需先建库并迁移数据

# SQLite → MySQL 迁移
node scripts/migrate-to-mysql.js --dry-run
node scripts/migrate-to-mysql.js
```

MySQL 建库脚本：`agriculture-backend/scripts/mysql-init.sql`

---

## 目录结构

```
pages/                16 个页面（首页/识别/实时监测/百科/历史/预警/我的…）
components/           NavBar、TabBar
utils/                api / config / guest / helpers
static/icons/         38 个自绘图标
agriculture-backend/
  app.js              入口
  config/db.js        SQLite 实现 + 驱动开关
  config/db-mysql.js  MySQL 适配层
  config/secrets.js   密钥集中管理
  routes/             7 个路由文件（57 个接口）
  views/admin/        12 个 EJS 后台页面
  scripts/            名录导入 / 农药登记抓取 / AI 草稿 / 数据迁移 / 回归测试
一键启动.bat            启动后端 + 前端
```

---

## 数据真实性

- 知识库 249 条：**27 条人工核实已上线**，222 条待核实（App 不可见）
- 每条数据必须填写「数据来源 + 核对日期」才能上线
- AI 生成内容带「（AI草稿）」标记，核实时自动去除
- 8 种作物在中国农药登记库中无登记药剂，如实标注「暂无登记用药」，不编造

---

## 安全说明

仓库**不含**任何密钥与业务数据：

| 内容 | 处理方式 |
|---|---|
| `.env`（API Key / 数据库密码） | 已在 `.gitignore`，请从 `.env.example` 自行创建 |
| `keystore/`（App 签名证书） | 已排除，自行生成并妥善保管 |
| `*.db`、`public/uploads/` | 已排除（业务数据与 95 MB 图片） |
| JWT / Session 密钥 | 从 `.env` 读取，代码内无硬编码 |

---

## 开发文档

完整开发文档（技术栈、架构、57 个接口、数据库设计、部署打包、测试记录、已修复问题档案）：

- Word：`E:/deepseep/wendang/禾诊-开发文档-v1.0.docx`（本仓库之外的交付目录）
- 在线查看 Markdown：`E:/deepseep/wendang/禾诊-开发文档-v1.0.md`

---

## License

MIT
