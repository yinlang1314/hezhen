const { dbAll, dbGet, safeParseJSON } = require('../config/db')

// 获取全部病虫害列表
exports.getDiseaseList = async (req, res) => {
  try {
    const list = await dbAll('SELECT id, name, type, category, level, level_text, image, symptom FROM diseases ORDER BY id DESC')
    res.json({ code: 200, data: list })
  } catch (err) {
    console.error('获取病虫害列表失败:', err)
    res.json({ code: 500, data: [], message: '获取病虫害列表失败' })
  }
}

// 获取单个病虫害详情
exports.getDiseaseDetail = async (req, res) => {
  try {
    const { id } = req.query
    const info = await dbGet('SELECT * FROM diseases WHERE id = ?', [id])
    if (!info) {
      return res.json({ code: 400, message: '暂无该病虫害数据' })
    }
    // 字符串还原为数组
    info.medicines = safeParseJSON(info.medicines)
    info.suggestions = safeParseJSON(info.suggestions)
    info.prevention = safeParseJSON(info.prevention)
    res.json({ code: 200, data: info })
  } catch (err) {
    console.error('获取病虫害详情失败:', err)
    res.json({ code: 500, message: '获取病虫害详情失败' })
  }
}