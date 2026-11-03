// ==================== 公用格式化工具 ====================

// 用药字段可能是两种形态，统一成 { name, usage } 数组：
//   对象数组（本项目的标准格式）：[{ name: '苯醚甲环唑', usage: '1500倍液喷雾' }]
//   纯字符串数组（早期数据或 AI 直接返回）：['苯醚甲环唑 1500倍液']
export function formatMedicines(list) {
  if (!list) return []
  let arr = list
  if (typeof arr === 'string') {
    const s = arr.trim()
    if (!s) return []
    try {
      const parsed = JSON.parse(s)
      arr = Array.isArray(parsed) ? parsed : [s]
    } catch (e) {
      arr = s.split(/\n|；|;/).filter((x) => x.trim())
    }
  }
  if (!Array.isArray(arr)) return []
  return arr.map((item) => {
    if (item && typeof item === 'object') {
      return {
        name: String(item.name || item.medicine || item.title || '未命名药剂'),
        usage: String(item.usage || item.use || item.method || item.desc || ''),
        tox: String(item.tox || '')   // 毒性（农药登记库里的低毒/中等毒）
      }
    }
    const text = String(item || '').trim()
    const m = text.match(/^([^\s，,：:（(]+)[\s，,：:（(]+(.*)$/)
    return m ? { name: m[1], usage: m[2] } : { name: text, usage: '' }
  }).filter((x) => x.name)
}

// 统一成字符串数组（防治建议、预防措施等）
export function toStringList(list) {
  if (!list) return []
  if (typeof list === 'string') {
    const s = list.trim()
    if (!s) return []
    try {
      const parsed = JSON.parse(s)
      return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [s]
    } catch (e) {
      return s.split(/\n/).map((x) => x.trim()).filter(Boolean)
    }
  }
  return Array.isArray(list) ? list.map((x) => (x && typeof x === 'object') ? (x.name || JSON.stringify(x)) : String(x)) : []
}
