// ==================================================================
// 病害风险计算
//
// 输入：天气（未来 3 天）+ 风险规则（每条来自知识库的确诊条件原文）
// 输出：每天每种病的风险等级 + 触发原因
//
// 打分（满分 100）：
//   温度是否落在适发区间      40 分
//   湿度是否达到起病阈值      35 分
//   降雨是否达到临界值        25 分
//   70+ 高风险 · 45+ 中风险 · 20+ 低风险
//
// 诚实说明：这是"条件匹配"模型，不是机器学习模型。
// 接口里务必带 disclaimer，别让用户以为这是精确预测。
// ==================================================================

const W_TEMP = 40
const W_HUMIDITY = 35
const W_RAIN = 25

function monthOf(dateStr) {
  return Number(String(dateStr).slice(5, 7))
}

function inMonths(months, dateStr) {
  if (!months) return true
  const list = String(months).split(',').map((x) => parseInt(x, 10)).filter(Boolean)
  if (!list.length) return true
  return list.includes(monthOf(dateStr))
}

// 单条规则 × 单天 → { score, reasons }
function scoreDay(rule, day) {
  let score = 0
  const reasons = []

  // 温度
  const tMin = rule.temp_min, tMax = rule.temp_max
  const hasTemp = tMin != null || tMax != null
  const tempOk = (!hasTemp)
    || ((tMin == null || day.tmean >= tMin) && (tMax == null || day.tmean <= tMax))
  if (hasTemp && tempOk) {
    score += W_TEMP
    reasons.push('均温 ' + day.tmean + '℃（适发 ' + (tMin == null ? '不限' : tMin) + '~' + (tMax == null ? '不限' : tMax) + '℃）')
  }

  // 湿度
  const hMin = rule.humidity_min, hMax = rule.humidity_max
  const hasHum = hMin != null || hMax != null
  const humOk = (!hasHum)
    || ((hMin == null || day.humidity >= hMin) && (hMax == null || day.humidity <= hMax))
  if (hasHum && humOk) {
    score += W_HUMIDITY
    reasons.push('湿度 ' + day.humidity + '%（条件 ' + (hMin == null ? '不限' : '≥' + hMin) + (hMax == null ? '' : '，≤' + hMax) + '）')
  }

  // 降雨
  const rMin = rule.rain_min, rMax = rule.rain_max
  const hasRain = rMin != null || rMax != null
  const rainOk = (!hasRain)
    || ((rMin == null || day.rain >= rMin) && (rMax == null || day.rain <= rMax))
  if (hasRain && rainOk) {
    score += W_RAIN
    reasons.push('降雨 ' + day.rain + 'mm（条件 ' + (rMin == null ? '不限' : '≥' + rMin + 'mm') + (rMax == null ? '' : '，≤' + rMax + 'mm') + '）')
  }

  // 温度不对 → 这条规则当天直接不成立（避免"温度差很远但湿度高"误报）
  if (hasTemp && !tempOk) return { score: 0, reasons: [] }

  return { score, reasons }
}

function levelOf(score) {
  if (score >= 70) return { level: 3, levelText: '高风险' }
  if (score >= 45) return { level: 2, levelText: '中风险' }
  if (score >= 20) return { level: 1, levelText: '低风险' }
  return null
}

/**
 * @param {Array} forecastDays 天气天数
 * @param {Array} rules risk_rules 行
 * @returns {Array} 每天的风险集合
 */
function computeRisks(forecastDays, rules) {
  return forecastDays.map((day) => {
    const items = []
    for (const rule of rules) {
      if (Number(rule.enabled) === 0) continue
      if (!inMonths(rule.months, day.date)) continue
      const s = scoreDay(rule, day)
      if (!s.score) continue
      const lv = levelOf(s.score)
      if (!lv) continue
      items.push({
        diseaseId: rule.disease_id,
        name: rule.disease_name,
        score: s.score,
        level: lv.level,
        levelText: lv.levelText,
        reasons: s.reasons,
        source: rule.note || ''
      })
    }
    items.sort((a, b) => b.score - a.score)
    return {
      date: day.date,
      tmean: day.tmean,
      humidity: day.humidity,
      rain: day.rain,
      items: items.slice(0, 5)      // 每天最多 5 条，避免刷屏
    }
  })
}

module.exports = { computeRisks, scoreDay, levelOf }
