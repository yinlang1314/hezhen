// 看板用的接口封装：token 存 localStorage，和 App/后台同一套 JWT
const TOKEN_KEY = 'dash_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY) || ''
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t || '')
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

async function request(path, options = {}) {
  const token = getToken()
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(options.headers || {})
    }
  })
  let data = null
  try { data = await res.json() } catch (e) { throw new Error('服务返回异常') }
  if (res.status === 401 || res.status === 403) throw new Error('登录已过期，请重新登录')
  if (!data || data.code !== 200) throw new Error((data && data.message) || '请求失败')
  return data.data
}

export const login = (username, password) =>
  request('/api/user/login', { method: 'POST', body: JSON.stringify({ username, password }) })

export const overview = () => request('/api/dashboard/overview')
export const trend = (days = 30) => request('/api/dashboard/trend?days=' + days)
export const distribution = () => request('/api/dashboard/distribution')
export const diseases = (params = {}) => {
  const q = new URLSearchParams()
  Object.keys(params).forEach((k) => { if (params[k] !== '' && params[k] != null) q.set(k, params[k]) })
  return request('/api/dashboard/diseases?' + q.toString())
}

// 天气风险 × 识别量关联分析
export const riskAnalysis = (region) =>
  request('/api/dashboard/risk-analysis?region=' + encodeURIComponent(region || '江西省'))

export const top = (limit = 10) => request('/api/dashboard/top?limit=' + limit)
