const { dbAll } = require('../config/db')

// 获取所有预警信息
exports.getWarningList = async (req, res) => {
  try {
    const list = await dbAll('SELECT * FROM warnings ORDER BY create_time DESC')
    res.json({ code: 200, data: list })
  } catch (err) {
    res.json({ code: 500, data: [], message: '获取预警信息失败' })
  }
}