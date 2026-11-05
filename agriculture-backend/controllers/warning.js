const { dbAll } = require('../config/db')
const { REGIONS, getForecast } = require('../lib/weather')
const { computeRisks } = require('../lib/risk')

// 获取所有预警信息
exports.getWarningList = async (req, res) => {
  try {
    const list = await dbAll('SELECT * FROM warnings ORDER BY create_time DESC')
    res.json({ code: 200, data: list })
  } catch (err) {
    res.json({ code: 500, data: [], message: '获取预警信息失败' })
  }
}
// 按天气自动算未来 3 天病害风险
// 数据来源：Open-Meteo 预报（真实数据）+ risk_rules（出自知识库发病条件）
exports.getRisk = async (req, res) => {
  const region = String(req.query.region || '').trim()
  if (!REGIONS[region]) {
    return res.json({
      code: 400,
      message: '暂不支持该地区（可选：' + Object.keys(REGIONS).join('、') + '）',
      data: { supported: Object.keys(REGIONS) }
    })
  }
  try {
    const [forecast, rules] = await Promise.all([
      getForecast(region),
      dbAll(`SELECT r.* FROM risk_rules r
         JOIN diseases d ON d.id = r.disease_id
         WHERE r.enabled = 1 AND d.verified = 1`)
    ])
    const days = computeRisks(forecast.days, rules)
    res.json({
      code: 200,
      data: {
        region,
        city: forecast.city,
        updated: forecast.updated,
        days,
        ruleCount: rules.length,
        disclaimer: '按天气预报与已知发病条件匹配估算，仅供参考；具体防治请结合田间实际。'
      }
    })
  } catch (e) {
    console.error('风险计算失败:', e.message)
    res.json({ code: 500, message: '风险计算失败：' + e.message, data: { days: [] } })
  }
}
