// 文本清洗：AI 生成或外部导入的内容里偶尔混入 U+FFFD（显示为 �），
// 这是编码转换时丢字符留下的占位符，直接入库会变成乱码。
// 写库前统一过一遍，避免脏数据进知识库。
const BAD = '\uFFFD'   // 注意：这里存的是"字符本身"，不是字面量 \uFFFD 六个字符

function hasBadChar(s) {
  return String(s == null ? '' : s).includes(BAD)
}

function cleanText(s) {
  return String(s == null ? '' : s).replace(new RegExp(BAD, 'g'), '')
}

// 递归清理对象/数组里的字符串（用于整条 JSON 数组字段）
function cleanDeep(v) {
  if (typeof v === 'string') return cleanText(v)
  if (Array.isArray(v)) return v.map(cleanDeep)
  if (v && typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v)) out[k] = cleanDeep(v[k])
    return out
  }
  return v
}

module.exports = { BAD, hasBadChar, cleanText, cleanDeep }
