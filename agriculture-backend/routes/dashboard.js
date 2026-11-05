// ==================================================================
// 数据看板接口（给 dashboard/ 那个 Vue3 子站用）
//
// 全部只读、只返回聚合结果，且要求管理员身份（requireAdmin：JWT 或后台 session）。
// ==================================================================
const express = require('express')
const router = express.Router()
const requireAdmin = require('../middleware/requireAdmin')
const { dbAll, dbGet } = require('../config/db')

router.use(requireAdmin)

// 顶部卡片：各类总量
router.get('/overview', async (req, res) => {
  try {
    const one = async (sql, params) => {
      const r = await dbGet(sql, params || [])
      return r ? Number(Object.values(r)[0]) : 0
    }
    const data = {
      diseases: await one('SELECT COUNT(*) FROM diseases'),
      verified: await one('SELECT COUNT(*) FROM diseases WHERE verified = 1'),
      users: await one('SELECT COUNT(*) FROM users'),
      wxUsers: await one('SELECT COUNT(*) FROM users WHERE openid IS NOT NULL'),
      histories: await one('SELECT COUNT(*) FROM histories'),
      collections: await one('SELECT COUNT(*) FROM collections'),
      correctionsPending: await one("SELECT COUNT(*) FROM corrections WHERE COALESCE(status,'pending') = 'pending'"),
      feedback: await one('SELECT COUNT(*) FROM feedback')
    }
    res.json({ code: 200, data })
  } catch (e) {
    res.json({ code: 500, message: '统计失败：' + e.message })
  }
})

// 趋势：最近 N 天识别数（MySQL 用 DATE()，SQLite 用 date()，适配层已翻译）
router.get('/trend', async (req, res) => {
  const days = Math.min(60, Math.max(7, parseInt(req.query.days, 10) || 14))
  try {
    // 不要用 date('now','-N days')：MySQL 适配层的方言翻译对带参数的这种写法不可靠，
    // 直接在 JS 里算好起始日期再绑定参数，两种数据库都安全。
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    const rows = await dbAll(
      'SELECT date(create_time) AS d, COUNT(*) AS n FROM histories WHERE create_time >= ? GROUP BY date(create_time) ORDER BY d',
      [since]
    )
    const map = {}
    rows.forEach((r) => { map[String(r.d).slice(0, 10)] = Number(r.n) })
    const out = []
    for (let i = days - 1; i >= 0; i--) {
      const dt = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
      out.push({ date: dt.slice(5), full: dt, count: map[dt] || 0 })
    }
    res.json({ code: 200, data: { days, items: out } })
  } catch (e) {
    res.json({ code: 500, message: '趋势查询失败：' + e.message })
  }
})

// 分布：病害分类 / 核实状态 / 危害等级
router.get('/distribution', async (req, res) => {
  try {
    const [category, level, verified] = await Promise.all([
      // 注意：别名不能叫 name —— diseases 表本身就有 name 列，GROUP BY name 会分错组
      dbAll("SELECT COALESCE(NULLIF(category,''),'未分类') AS label, COUNT(*) AS n FROM diseases GROUP BY COALESCE(NULLIF(category,''),'未分类') ORDER BY n DESC LIMIT 12"),
      dbAll("SELECT COALESCE(NULLIF(level_text,''),'未设置') AS label, COUNT(*) AS n FROM diseases GROUP BY COALESCE(NULLIF(level_text,''),'未设置') ORDER BY n DESC"),
      dbAll('SELECT verified, COUNT(*) AS n FROM diseases GROUP BY verified')
    ])
    res.json({
      code: 200,
      data: {
        category: category.map((r) => ({ name: r.label, value: Number(r.n) })),
        level: level.map((r) => ({ name: r.label, value: Number(r.n) })),
        verified: verified.map((r) => ({ name: Number(r.verified) === 1 ? '已核实' : '待核实', value: Number(r.n) }))
      }
    })
  } catch (e) {
    res.json({ code: 500, message: '分布查询失败：' + e.message })
  }
})

// Top N：识别次数最多的病害
router.get('/top', async (req, res) => {
  const limit = Math.min(20, Math.max(5, parseInt(req.query.limit, 10) || 10))
  try {
    const rows = await dbAll(
      'SELECT disease_name AS name, COUNT(*) AS times, MAX(create_time) AS last_time FROM histories GROUP BY disease_name ORDER BY times DESC LIMIT ' + limit
    )
    res.json({ code: 200, data: rows.map((r) => ({ name: r.name, times: Number(r.times), lastTime: r.last_time })) })
  } catch (e) {
    res.json({ code: 500, message: 'Top 查询失败：' + e.message })
  }
})

// 病虫害库分页列表（给看板的 ProTable 用）
router.get('/diseases', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(5, parseInt(req.query.pageSize, 10) || 10))
    const keyword = String(req.query.keyword || '').trim()
    const verified = String(req.query.verified || '')   // '' | '1' | '0'

    let where = 'WHERE 1=1'
    const params = []
    if (keyword) {
      where += ' AND (name LIKE ? OR category LIKE ?)'
      params.push('%' + keyword + '%', '%' + keyword + '%')
    }
    if (verified === '1' || verified === '0') {
      where += ' AND verified = ?'
      params.push(Number(verified))
    }

    const totalRow = await dbGet('SELECT COUNT(*) AS n FROM diseases ' + where, params)
    const rows = await dbAll(
      'SELECT id, name, category, type, level_text, verified, verify_source, verify_date, medicines FROM diseases ' +
      where + ' ORDER BY id DESC LIMIT ' + pageSize + ' OFFSET ' + ((page - 1) * pageSize),
      params
    )

    res.json({
      code: 200,
      data: {
        total: totalRow ? Number(totalRow.n) : 0,
        page, pageSize,
        list: rows.map((r) => {
          let medCount = 0
          try { medCount = JSON.parse(r.medicines || '[]').length } catch (e) {}
          return {
            id: r.id, name: r.name, category: r.category || '-', type: r.type || '-',
            levelText: r.level_text || '-',
            verified: Number(r.verified) === 1,
            source: r.verify_source || '',
            verifyDate: r.verify_date || '',
            medCount
          }
        })
      }
    })
  } catch (e) {
    res.json({ code: 500, message: '列表查询失败：' + e.message })
  }
})

// 导出病虫害库 CSV（带 BOM，Excel 打开不乱码；前端 ProTable 的「导出」按钮用）
router.get('/export/diseases.csv', async (req, res) => {
  try {
    const rows = await dbAll('SELECT id, name, category, type, level_text, verified, verify_source, verify_date FROM diseases ORDER BY id')
    const head = ['ID', '名称', '分类', '类型', '危害等级', '是否核实', '数据来源', '核对日期']
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'
    const lines = [head.map(esc).join(',')]
    rows.forEach((r) => lines.push([r.id, r.name, r.category, r.type, r.level_text,
      Number(r.verified) === 1 ? '是' : '否', r.verify_source || '', r.verify_date || ''].map(esc).join(',')))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent('病虫害库.csv'))
    res.send('\ufeff' + lines.join('\r\n'))
  } catch (e) {
    res.status(500).send('导出失败：' + e.message)
  }
})

module.exports = router
