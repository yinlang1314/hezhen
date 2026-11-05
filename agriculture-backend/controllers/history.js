const { dbRun, dbGet, dbAll } = require('../config/db')

// 新增识别记录
exports.addHistory = async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null
    const { diseaseName, imageUrl, confidence, name, type, level, levelText, symptom, spread, occurrence, medicines, suggestions, prevention } = req.body

    // 兼容两种字段名
    const disease_name = String(diseaseName || name || '未知病虫害').slice(0, 120)
    const rawImage = String(imageUrl || req.body.image || '')

    // 图片地址不能由客户端随便写（否则能把别人的图挂到自己记录下，或塞外链）
    let image_url = ''
    const m = rawImage.match(/\/uploads\/([^?"'\s]+)/)
    if (m) {
      const rel = decodeURIComponent(m[1])
      const owned = await dbGet(
        "SELECT id FROM histories WHERE user_id = ? AND image_url LIKE ? LIMIT 1",
        [userId, '%/uploads/' + rel]
      )
      const lib = await dbGet('SELECT id FROM diseases WHERE image LIKE ? LIMIT 1', ['%/uploads/' + rel])
      if (owned || lib) image_url = '/uploads/' + rel
    } else if (/^\/images\/seed\/[\w.-]+\.(jpe?g|png|webp)$/i.test(rawImage)) {
      image_url = rawImage
    } else if (/^https?:\/\//i.test(rawImage)) {
      image_url = ''   // 外链一律不存（来源不可控）
    }
    const conf = confidence || 0
    const lv = level || 2
    const lvText = levelText || level_text || '中度危害'

    await dbRun(
      `INSERT INTO histories (user_id, disease_name, image_url, confidence, level, level_text, symptom, spread, occurrence, medicines, suggestions, prevention)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, disease_name, image_url, conf, lv, lvText,
       symptom || '', spread || '', occurrence || '',
       typeof medicines === 'string' ? medicines : JSON.stringify(medicines || []),
       typeof suggestions === 'string' ? suggestions : JSON.stringify(suggestions || []),
       typeof prevention === 'string' ? prevention : JSON.stringify(prevention || [])]
    )
    res.json({ code: 200, message: '记录保存成功' })
  } catch (err) {
    console.error('保存历史记录失败:', err)
    res.json({ code: 500, message: '记录保存失败' })
  }
}

// 查询个人历史记录
exports.getHistoryList = async (req, res) => {
  try {
    const userId = req.user.id
    // 分页：默认第 1 页、每页 50 条（上限 200），避免记录多了以后一次性拉全表
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize) || 50))
    const offset = (page - 1) * pageSize

    const total = (await dbGet('SELECT COUNT(*) as cnt FROM histories WHERE user_id = ?', [userId]))?.cnt || 0
    const list = await dbAll(
      'SELECT * FROM histories WHERE user_id = ? ORDER BY create_time DESC, id DESC LIMIT ? OFFSET ?',
      [userId, pageSize, offset]
    )
    res.json({
      code: 200,
      data: list,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    })
  } catch (err) {
    console.error('获取历史记录失败:', err)
    res.json({ code: 500, data: [], message: '获取历史记录失败' })
  }
}

// 删除单条记录
exports.delHistory = async (req, res) => {
  try {
    const id = parseInt(req.body.id)
    if (!id) return res.json({ code: 400, message: '参数不正确' })

    // 只能删自己的记录：必须带上 user_id 条件，
    // 否则任何登录用户只要猜到 id 就能删掉别人的识别记录
    const owned = await dbGet('SELECT id FROM histories WHERE id = ? AND user_id = ?', [id, req.user.id])
    if (!owned) return res.json({ code: 404, message: '记录不存在或无权删除' })

    await dbRun('DELETE FROM histories WHERE id = ? AND user_id = ?', [id, req.user.id])
    // 关联的纠错记录也清掉，否则 corrections 里会留下指向已删记录的孤儿
    await dbRun('DELETE FROM corrections WHERE history_id = ?', [id]).catch(() => {})
    res.json({ code: 200, message: '删除成功' })
  } catch (err) {
    console.error('删除历史失败:', err)
    res.json({ code: 500, message: '删除失败' })
  }
}

// 清空全部记录
exports.clearHistory = async (req, res) => {
  try {
    const userId = req.user.id
    const r = await dbRun('DELETE FROM histories WHERE user_id = ?', [userId])
    res.json({ code: 200, message: '清空成功', data: { deleted: (r && r.changes) || 0 } })
  } catch (err) {
    console.error('清空历史失败:', err)
    res.json({ code: 500, message: '清空失败' })
  }
}

// 取单条历史记录（详情页用）
// 为什么需要：历史记录的 id 和百科库的 id 是两套编号，
// 详情页拿历史 id 去查百科接口必然查不到，结果整页空白。
exports.getHistoryDetail = async (req, res) => {
  try {
    const id = parseInt(req.query.id)
    if (!id) return res.json({ code: 400, message: '缺少 id', data: null })
    // 只能看自己的记录
    const row = await dbGet('SELECT * FROM histories WHERE id = ? AND user_id = ?', [id, req.user.id])
    if (!row) return res.json({ code: 404, message: '记录不存在', data: null })
    res.json({ code: 200, data: row })
  } catch (err) {
    console.error('获取历史详情失败:', err)
    res.json({ code: 500, message: '获取失败', data: null })
  }
}
