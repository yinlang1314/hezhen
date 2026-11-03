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
