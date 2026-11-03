const { dbRun, dbGet, dbAll } = require('../config/db')

// 添加收藏
exports.addCollect = async (req, res) => {
  try {
    const userId = req.user.id
    const { disease_id, name, type, image } = req.body
    if (!disease_id || !parseInt(disease_id)) return res.json({ code: 400, message: '参数不完整' })

    const check = await dbGet('SELECT id FROM collections WHERE user_id=? AND disease_id=?', [userId, disease_id])
    if (check) return res.json({ code: 400, message: '已收藏该病虫害' })

    await dbRun('INSERT INTO collections (user_id, disease_id, name, type, image) VALUES (?,?,?,?,?)',
      [userId, disease_id, name || '', type || '', image || ''])
    res.json({ code: 200, message: '收藏成功' })
  } catch (err) {
    console.error('收藏失败:', err)
    res.json({ code: 500, message: '收藏失败' })
  }
}

// 获取收藏列表
exports.getCollectList = async (req, res) => {
  try {
    const userId = req.user.id
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize) || 50))
    const offset = (page - 1) * pageSize

    const total = (await dbGet('SELECT COUNT(*) as cnt FROM collections WHERE user_id=?', [userId]))?.cnt || 0
    const list = await dbAll(
      'SELECT * FROM collections WHERE user_id=? ORDER BY create_time DESC, id DESC LIMIT ? OFFSET ?',
      [userId, pageSize, offset]
    )
    res.json({ code: 200, data: list, page, pageSize, total, totalPages: Math.ceil(total / pageSize) })
  } catch (err) {
    console.error('获取收藏列表失败:', err)
    res.json({ code: 500, data: [], message: '获取收藏列表失败' })
  }
}

// 取消收藏
exports.delCollect = async (req, res) => {
  try {
    const userId = req.user.id
    const rawId = req.body.id
    const diseaseId = req.body.disease_id

    // 支持两种调用方式：按收藏记录 id，或按病害 id（前端详情页手里只有病害 id）
    let owned = null
    if (rawId) {
      owned = await dbGet('SELECT id FROM collections WHERE id=? AND user_id=?', [parseInt(rawId), userId])
    }
    if (!owned && diseaseId) {
      owned = await dbGet('SELECT id FROM collections WHERE disease_id=? AND user_id=?', [parseInt(diseaseId), userId])
    }
    if (!owned) return res.json({ code: 404, message: '未收藏该病虫害' })

    // 必须限定 user_id，否则能删掉别人的收藏
    await dbRun('DELETE FROM collections WHERE id=? AND user_id=?', [owned.id, userId])
    res.json({ code: 200, message: '取消收藏成功' })
  } catch (err) {
    console.error('取消收藏失败:', err)
    res.json({ code: 500, message: '取消收藏失败' })
  }
}