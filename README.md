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

启动时会自动检查 Node 版本：**低于 v18 直接报错退出**（提示装哪个版本），v25 以上会警告"原生模块可能没有预编译包"。

## 快速开始

```bash
cd agriculture-backend
npm install
npm start
```

**不需要手动创建 .env**：首次启动会自动按 `.env.example` 生成，并写入随机鉴权密钥。
想启用真实 AI 识别，再编辑 `.env` 填 API 密钥即可。

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

## 没装 HBuilderX？用现成的网页版

仓库里带了**编译好的 H5 页面**（`dist/h5/`），装个 Node 就能看，不需要 HBuilderX：

```text
1. 先启动后端：cd agriculture-backend && npm start
2. 再双击根目录的「启动网页.bat」
3. 浏览器自动打开 http://localhost:5178
```

原理：`serve-h5.js` 是个零依赖静态服务器；页面里的接口地址会自动指向同一台机器的 3000 端口。

## 一键启动（**只需要点这一个**）

| 文件 | 作用 |
|---|---|
| **一键启动.bat** | 后端 + 前端一起启动，自动打开页面 |
| **停止服务.bat** | 停止后端（`stop-all.ps1 -IncludeH5` 连前端一起停）|

底层是两个 PowerShell 脚本（`start-all.ps1` / `stop-all.ps1`），BAT 只是双击入口。

启动时会自动：检查 MySQL 服务 → 检查依赖（缺了自动 `npm install`）→ 启动后端 → 健康检查 → 启动前端 → 打开页面。
失败会打印后端真实报错和日志路径（`agriculture-backend/logs/startup.log`）。

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

### 9. 启动自检都查了什么

每次启动会自动检查并打印：

| 检查 | 行为 |
|---|---|
| Node 版本 | <18 直接退出并提示装哪个版本；≥25 警告原生模块风险 |
| `.env` 是否存在 | 不存在就按 `.env.example` 自动生成（随机密钥） |
| 数据库驱动 | 打印实际用的是 SQLite 还是 MySQL |
| 端口占用 | 3000 被占时提示是哪个进程 |
| API 密钥 | 未配置时明确说明识别会报错（不是静默失败） |

### 10. 后端启动超时 / 一闪就没

脚本会自动装依赖并打印后端真实输出。如果还失败：

```powershell
cd agriculture-backend
npm install        # 先确认依赖装好
node app.js        # 手动跑一次，直接看报错
```

完整日志在 `agriculture-backend/logs/startup.log`。

### 11. 启动脚本报 `Join-Path : Cannot find drive`

旧版脚本在探测 HBuilderX 时会去拼 `F:\HBuilderX`，没有 F 盘的电脑会崩。
**已在 2026-11 修复**（改成字符串拼接 + 存在性判断），更新到最新 main 即可。

### 12. 空库启动时报 `no such table` / `no such column`

已在 2026-11 修复（建表顺序 + diseases 三列）。如果用的是旧版本代码，更新到最新 main 即可。

---

### 13. 知识库里出现乱码（显示为 �）

历史遗留问题：早期 AI 生成/导入的文本里混入了 U+FFFD 占位符。
已用脚本批量修复（69 条），并加了写库前清洗。

以后再出现，可以跑：

```bash
cd agriculture-backend
node scripts/fix-mojibake.js --dry-run   # 先看要改什么
node scripts/fix-mojibake.js             # 实际写库
```

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

## 图片说明

- **演示图片**：`agriculture-backend/public/images/seed/` 内置 9 张真实病害照片（约 430 KB），随仓库一起分发，全新安装即可看到配图。
- **用户上传**：`public/uploads/` 是运行时产生的数据（识别照片、补图），**不提交仓库**；克隆后该目录为空，属正常现象。
- 若某条病害的配图文件不存在，接口会自动返回空字符串，前端显示「暂无配图」，不会出现破图。

## 安全说明

仓库**不含**任何密钥与业务数据：

| 内容 | 处理方式 |
|---|---|
| `.env`（API Key / 数据库密码） | 已在 `.gitignore`，请从 `.env.example` 自行创建 |
| `keystore/`（App 签名证书） | 已排除，自行生成并妥善保管 |
| `*.db`、`public/uploads/` | 已排除（业务数据与 95 MB 图片） |
| JWT / Session 密钥 | 从 `.env` 读取，代码内无硬编码 |

---

## 文档

- 📘 [**操作手册**](./docs/操作手册.md) —— 网页 / 小程序 / App 三种形态怎么用
- 📗 [**开发文档**](./docs/开发文档.md) —— 技术栈、架构、57 个接口、数据库设计、踩坑记录
- 📚 [文档总览](./docs/README.md)

## 开发文档

完整开发文档（技术栈、架构、57 个接口、数据库设计、部署打包、测试记录、已修复问题档案）：

- Word：`E:/deepseep/wendang/禾诊-开发文档-v1.0.docx`（本仓库之外的交付目录）
- 在线查看 Markdown：`E:/deepseep/wendang/禾诊-开发文档-v1.0.md`

---

---

## 打包与发布

### 微信小程序（仓库内已带编译好的包）

`dist/mp-weixin/` 是**已编译好的小程序代码**，不需要装 HBuilderX 就能导入：

```text
1. 装「微信开发者工具」（https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html）
2. 打开 → 导入项目 → 目录选 dist/mp-weixin
3. AppID 已预设为 wxad5fc24db487f28b（换成你自己的也行）
4. 详情 → 本地设置 → 勾选「不校验合法域名」
5. 点「预览」，手机扫码即可在手机上打开
```

**后端地址怎么改**（产物是编译后的 JS，改源码要重新编译）。三种办法：

| 办法 | 操作 | 适合 |
|---|---|---|
| **App/小程序内设置（推荐）** | 打开「我的 → 设置 → 服务器连接 → 后端地址」，填 \`http://电脑IP:3000\` → 保存并测试 | 装到别人手机上，改一次即可 |
| 改 Storage | 开发者工具 → 调试器 → Storage → 新增 \`backendUrl\` → 点「编译」 | 开发调试 |
| 改源码重编译 | 改 \`utils/config.js\` 的 \`BACKEND_HOST\` → 重新编译 | 固定发布 |

原有的两种：

| 办法 | 操作 | 适合 |
|---|---|---|
| 改 Storage（推荐）| 开发者工具 → 调试器 → Storage → 新增 `backendUrl` = `http://电脑IP:3000` → 点「编译」 | 临时切换 |
| 改源码重编译 | 改 `utils/config.js` 的 `BACKEND_HOST` → HBuilderX 重新编译 | 长期固定 |

默认值是 `http://127.0.0.1`：**开发者工具和电脑在同一台机器时可直接用**。

### 自己编译小程序

```bash
# 1. 让 HBuilderX 编译出小程序代码
cli launch mp-weixin --project <项目路径> --compile true
#    产物：unpackage/dist/dev/mp-weixin

# 2. 微信开发者工具 → 导入项目 → 选上面的目录
# 3. 填自己的 AppID（manifest.json → 微信小程序配置）
# 4. 详情 → 本地设置 → 勾选「不校验合法域名」（仅开发阶段）
# 5. 上传 → 微信公众平台提交审核
```

**注意**：小程序正式版要求后端 **HTTPS** 且域名已在微信后台配置。

### Android APK（仓库内已带安装包）

安装包在仓库内：`dist/apk/hezhen-v1.0.1.apk`（15 MB）

👉 https://github.com/yinlang1314/hezhen/blob/main/dist/apk/hezhen-v1.0.1.apk

装机后如果连不上后端：打开「我的 → 设置 → 服务器连接 → 后端地址」，填 `http://电脑IP:3000`，保存并测试。

| 项 | 值 |
|---|---|
| 包名 | `com.yinlang1314.hezhen` |
| 版本 | 1.0.0（versionCode 100）|
| 签名 | `keystore/hezhen.keystore`（别名 hezhen）|
| 体积 | 约 15 MB |

```text
HBuilderX → 发行 → 原生App-云打包
  证书：keystore/hezhen.keystore（别名 hezhen，密码见交付说明）
  需要：DCloud 账号已绑定手机号
```

**关键**：APK 里写死的后端地址在 `utils/config.js` 的 `BACKEND_HOST`。
别人装了这个 APK 只能连到同一个后端，所以必须改成**公网可访问的 HTTPS 地址**，例如：

```js
export const BACKEND_HOST = 'https://api.你的域名.com'
```

发布 APK：GitHub 仓库 → Releases → Draft a new release → 上传 .apk → Publish。

### 三者对比

| 形态 | 别人怎么用 | 门槛 |
|---|---|---|
| 源码 | git clone / 下载 zip | 装 Node |
| H5 | 打开网址 | 后端要有公网地址 |
| 小程序 | 微信里搜/扫码 | 微信审核 + HTTPS 域名 |
| APK | 下载安装 | 内置后端地址要公网可达 |

---

## License

MIT
