// ==================== 统一 API 封装 ====================
// 后端地址由 config.js 自动推导（不再写死 IP）
import { buildUrl, invalidateBaseUrl } from './config.js'

// 统一错误对象：保证 err.message 一定可读
function fail(message) {
  return new Error(message || '请求失败')
}

// 通用 JSON 请求
function request(url, method = 'GET', data = {}, timeoutMs) {
  const token = uni.getStorageSync('token') || ''
  return buildUrl(url).then((fullUrl) => new Promise((resolve, reject) => {
    uni.request({
      url: fullUrl,
      method,
      data,
      timeout: timeoutMs || 15000,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        if (res.statusCode === 401) {
        // 游客模式：没登录时不弹回登录页（否则浏览任何页面都会被踢走），
        // 只把错误交给调用方处理即可。
        const hasToken = !!uni.getStorageSync('token')
        if (hasToken) {
          uni.removeStorageSync('token')
          uni.removeStorageSync('userInfo')
          uni.reLaunch({ url: '/pages/login/login' })
        }
        reject(fail('登录已过期，请重新登录'))
          return
        }
        const d = res.data
        // 后端一定返回 JSON。如果拿到的是 HTML（例如请求打到了开发服务器上），
        // 直接说明情况，别再报含糊的“请求失败”。
        const isJson = d && typeof d === 'object'
        if (res.statusCode === 200 && isJson && d.code === 200) {
          resolve(d)
        } else if (!isJson) {
          reject(fail('后端返回的不是接口数据（HTTP ' + res.statusCode +
            '，' + (typeof d === 'string' ? '内容是网页' : '内容为空') +
            '）。请确认后端已启动，且地址是后端地址而不是前端开发服务器地址。'))
        } else {
          reject(fail(d.message || ('请求失败（code ' + d.code + '）')))
        }
      },
      fail: () => {
        invalidateBaseUrl() // 网络异常：下次请求重新探测后端地址
        reject(fail('网络异常，请检查后端服务是否已启动、地址是否正确'))
      }
    })
  }))
}

// 连拍识别：先把每张图上传到 /upload，再把地址 POST 给 /recognize-batch。
// 微信小程序的 wx.uploadFile 只支持单文件，不能依赖 files 数组（H5 才支持）。
function uploadOneImage(filePath) {
  // #ifdef H5
  if (typeof filePath === 'string' && filePath.indexOf('blob:') === 0) {
    // 摄像头抓帧：走同一套上传，返回后端给的文件地址
    const token = uni.getStorageSync('token') || ''
    return buildUrl('/api/disease/upload').then(async (fullUrl) => {
      const blob = await (await fetch(filePath)).blob()
      const fd = new FormData()
      fd.append('image', blob, 'camera.jpg')
      const res = await fetch(fullUrl, { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {}, body: fd })
      const data = await res.json()
      if (data && data.code === 200) {
        return (data.data && (data.data.url || data.data.path)) || data.url || ''
      }
      throw fail((data && data.message) || '上传失败')
    })
  }
  // #endif

  const token = uni.getStorageSync('token') || ''
  return buildUrl('/api/disease/upload').then((fullUrl) => new Promise((resolve, reject) => {
    uni.uploadFile({
      url: fullUrl,
      filePath,
      name: 'image',
      timeout: 60000,
      header: {
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        try {
          const data = JSON.parse(res.data)
          if (res.statusCode === 200 && data && data.code === 200 && data.data && data.data.url) {
            resolve(data.data.url)
          } else {
            reject(fail((data && data.message) || '图片上传失败'))
          }
        } catch (e) {
          reject(fail('服务器响应异常'))
        }
      },
      fail: () => {
        invalidateBaseUrl()
        reject(fail('网络异常，请检查后端服务是否已启动、地址是否正确'))
      }
    })
  }))
}

function uploadBatch(filePaths) {
  const files = (filePaths || []).filter(Boolean).slice(0, 3)
  if (!files.length) return Promise.reject(fail('请先选择照片'))

  // 串行上传，避免 3 张同时上传占满小程序并发/后端限流
  return files.reduce((chain, path) => chain.then(async (urls) => {
    urls.push(await uploadOneImage(path))
    return urls
  }), Promise.resolve([])).then((urls) =>
    // 每张都要单独调 AI，3 张可能要 1~2 分钟
    request('/api/disease/recognize-batch', 'POST', { images: urls }, 180000)
  )
}

// H5 用摄像头抓的帧是 blob: URL，uni.uploadFile 处理不了，
// 这里直接用 fetch + FormData 发，接口契约和 uploadFile 保持一致。
function uploadBlobUrl(url, blobUrl) {
  const token = uni.getStorageSync('token') || ''
  return buildUrl(url).then(async (fullUrl) => {
    const blob = await (await fetch(blobUrl)).blob()
    const fd = new FormData()
    fd.append('image', blob, 'camera.jpg')
    let res
    try {
      res = await fetch(fullUrl, {
        method: 'POST',
        headers: token ? { Authorization: 'Bearer ' + token } : {},
        body: fd
      })
    } catch (e) {
      invalidateBaseUrl()
      throw fail('网络异常，请检查后端服务是否已启动、地址是否正确')
    }
    let data = null
    try { data = await res.json() } catch (e) { throw fail('服务器响应异常') }
    if (res.ok && data && data.code === 200) return data
    throw fail((data && data.message) || '上传失败')
  })
}

function uploadFile(url, filePath, formData = {}) {
  // #ifdef H5
  if (typeof filePath === 'string' && filePath.indexOf('blob:') === 0) {
    return uploadBlobUrl(url, filePath)
  }
  // #endif
  const token = uni.getStorageSync('token') || ''
  return buildUrl(url).then((fullUrl) => new Promise((resolve, reject) => {
    uni.uploadFile({
      url: fullUrl,
      filePath,
      name: 'image',
      formData,
      // AI 识别要先调百度再调 DeepSeek，实测 6~40 秒，30 秒会误报超时
      timeout: 120000,
      header: {
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        try {
          const data = JSON.parse(res.data)
          if (res.statusCode === 200 && data && data.code === 200) {
            resolve(data)
          } else {
            reject(fail((data && data.message) || '上传失败'))
          }
        } catch (e) {
          reject(fail('服务器响应异常'))
        }
      },
      fail: () => {
        invalidateBaseUrl()
        reject(fail('网络异常，请检查后端服务是否已启动、地址是否正确'))
      }
    })
  }))
}

// 导出 API
export const api = {
  // ============ 用户相关 ============
  login: (data) => request('/api/user/login', 'POST', data),
  // 微信小程序一键登录：前端 uni.login 拿 code，后端换 openid
  wxLogin: (code) => request('/api/user/wx-login', 'POST', { code }),
  register: (data) => request('/api/user/register', 'POST', data),
  getUserInfo: () => request('/api/user/info', 'GET'),
  logout: () => request('/api/user/logout', 'POST'),

  // ============ 病虫害百科 ============
  getDiseaseList: (params = {}) => request('/api/disease/diseases/list', 'GET', params),
  getDiseaseDetail: (id) => request('/api/disease/detail', 'GET', { id }),

  // ============ 识别病虫害（上传图片）============
  recognize: (filePath) => uploadFile('/api/disease/recognize', filePath),
  // 实时监测：识别但不写历史记录
  recognizeRealtime: (filePath) => uploadFile('/api/disease/recognize?save=0&fast=1', filePath),

  // ============ 识别历史 ============
  addHistory: (data) => request('/api/history/add', 'POST', data),
  getHistoryList: (page, pageSize) => request('/api/history/list?page=' + (page || 1) + '&pageSize=' + (pageSize || 50), 'GET'),
  getHistoryDetail: (id) => request('/api/history/detail?id=' + encodeURIComponent(id), 'GET'),
  delHistory: (id) => request('/api/history/delete', 'POST', { id }),
  clearHistory: () => request('/api/history/clear', 'POST'),

  // ============ 收藏 ============
  addCollect: (data) => request('/api/collection/add', 'POST', data),
  getCollectList: () => request('/api/collection/list', 'GET'),
  delCollect: (id) => request('/api/collection/delete', 'POST', { id }),
  clearCollect: () => request('/api/collection/clear', 'POST', {}),

  // ============ 预警 ============
  // AI 农业问答（history 传之前的对话，实现多轮）
  askAI: (question, history) => request('/api/chat/ask', 'POST', { question, history: history || [] }, 90000),

  getWarningList: () => request('/api/warning/list', 'GET'),

  // 版本信息（App 检查更新用）
  getVersion: () => request('/api/version', 'GET', {}, 15000),
  // 按天气自动算的区域风险（region 传省份名，如「江西省」）
  getWarningRisk: (region) => request('/api/warning/risk?region=' + encodeURIComponent(region), 'GET', {}, 30000),

  // ============ 通用上传（头像等）============
  uploadImage: (filePath) => uploadFile('/api/disease/upload', filePath),

  // 连拍识别（多张照片合并结论，更准）
  recognizeBatch: (filePaths) => uploadBatch(filePaths),

  // ============ 其他 ============
  getStats: () => request('/api/stats/summary', 'GET'),
  getHotDiseases: (limit = 8) => request('/api/stats/hot', 'GET', { limit }),
  updateProfile: (data) => request('/api/user/profile', 'POST', data),
  changePassword: (data) => request('/api/user/change-password', 'POST', data),
  correctDiagnosis: (data) => request('/api/disease/correct', 'POST', data),
  submitFeedback: (data) => request('/api/user/feedback', 'POST', data)
}
