// ==================== 全局地址配置（唯一需要改的地方）====================
// 以前每个文件里都写死了 http://10.x.x.x:3000，电脑 IP 一变登录就失败。
// 现在后端地址在这里自动推导，电脑 IP 再变也不用改代码。
//
// 规则：
//   1. H5（浏览器运行）  -> 自动使用当前网页的地址。前后端都在同一台电脑上时【零配置】可用。
//   2. 手机 App / 小程序 -> 没有网页地址，用下面的 APP_BASE_URL。
//   3. 自动兜底          -> H5 下如果当前网页地址连不上后端，会自动再试 APP_BASE_URL。
//
// 【只在真机 App / 小程序 里需要改】把 APP_BASE_URL 改成后端电脑当前的局域网 IP。
// 后端启动时会打印可用地址，例如：http://192.168.5.14:3000
// =====================================================================

export const PORT = 3000

// ⚠️ 只有【手机 App / 微信小程序】会用到下面这个地址（它们没有"当前网页地址"可参考）。
//    H5（浏览器）会自动用当前网页地址，这里填什么都没关系。
//
// 【换网络后要改这里】填后端启动时打印的地址（去掉 :3000 那部分端口）：
//    · 微信开发者工具里调试  -> 'http://127.0.0.1'      ← 默认值（工具和电脑在同一台机器）
//    · 手机真机预览          -> 'http://<电脑局域网IP>'  ← 见下方「运行时覆盖」
//    · 正式发布的小程序      -> 'https://你的域名.com'   ← 小程序正式版必须是 HTTPS
//
// 【运行时覆盖】改了地址不想重新编译？在小程序开发者工具的
//   调试器 → Storage 面板，新增键 `backendUrl`（字符串），值为后端地址，
//   然后点「编译」即可生效（优先级高于下面的常量）。
// APK/真机用：改成电脑当前的局域网 IP（后端启动时会打印）
export const BACKEND_HOST = 'http://10.114.25.6'
export const APP_BASE_URL = BACKEND_HOST + ':' + PORT

const PROBE_CACHE_KEY = 'apiBaseUrl:v2'
try { uni.removeStorageSync('apiBaseUrl') } catch (e) {}

function trimSlash(u) {
  return String(u || '').replace(/\/+$/, '')
}

// 当前运行环境
function currentPlatform() {
  // 用 uni-app 的编译期条件判断平台。
  // 好处：不用调已废弃的系统信息接口（微信基础库 2.20.1 起废弃），
  // 而且编译时只会留下一段代码，没有运行时开销。
  // #ifdef MP-WEIXIN
  return 'mp-weixin'
  // #endif
  // #ifdef H5
  return 'h5'
  // #endif
  // #ifdef APP-PLUS
  return 'app'
  // #endif
  // 未匹配到条件（例如其它小程序平台）时的兜底
  return 'app'
}

// H5：当前网页所在的地址，就是最可靠的后端地址（前后端同一台电脑）
function pageOrigin() {
  let o = ''
  try {
    // #ifdef H5
    o = window.location.origin
    // #endif
  } catch (e) {
    o = ''
  }
  return o
}

function readCached() {
  try { return uni.getStorageSync(PROBE_CACHE_KEY) || '' } catch (e) { return '' }
}

function writeCached(v) {
  try { uni.setStorageSync(PROBE_CACHE_KEY, v) } catch (e) {}
}

// ==================== 同步地址缓存 ====================
// 作用：让图片地址等【必须在渲染时同步拿到】的场景也能用上后端地址。
// 之前这里返回的是 Promise，导致 <image :src="..."> 绑定到 Promise，图片全部不显示。
let _resolved = ''
const _waiters = []

// 初始值：H5 用当前网页地址，App/小程序用配置地址。探测成功后会被覆盖。
;(function initBase() {
  const platform = currentPlatform()
  const origin = platform === 'h5' ? trimSlash(pageOrigin()) : ''
  const cached = trimSlash(readCached())
  const fallback = trimSlash(APP_BASE_URL)
  // 运行时覆盖（小程序开发者工具里改 Storage 的 backendUrl 即可，不用重新编译）
  let override = ''
  try { override = trimSlash(uni.getStorageSync('backendUrl') || '') } catch (e) { override = '' }
  _resolved = override || ((cached && cached !== origin && portOf(cached)) ? cached : (origin || fallback))
})()

function portOf(u) {
  const m = /^https?:\/\/[^/:]+:(\d+)/i.exec(String(u || ''))
  if (m) return m[1]
  return /^https:/i.test(String(u || '')) ? '443' : '80'
}

function setBase(url) {
  const v = trimSlash(url)
  if (!v || v === _resolved) return
  _resolved = v
  console.log('[config] 后端地址 ->', v)
  // 通知页面：地址变了，需要重新渲染（图片地址会跟着更新）
  uni.$emit('apiBaseUrlChanged', v)
}

// 同步获取当前后端地址（渲染时可安全调用）
export function baseUrlSync() {
  return _resolved
}

// 后端地址就绪的 Promise：地址已定时立即返回；探测中则等探测结果（最多 6 秒兜底）
export function getBaseUrl() {
  if (_resolved && !_probing) return Promise.resolve(_resolved)
  return new Promise((resolve) => {
    let done = false
    const finish = () => { if (!done) { done = true; resolve(_resolved) } }
    _waiters.push(finish)
    setTimeout(finish, 6500)
  })
}

// 网络异常时调用：丢掉探测结果，下次请求重新探测
export function invalidateBaseUrl() {
  _probing = false
  _probed = false
  try { uni.removeStorageSync(PROBE_CACHE_KEY) } catch (e) {}
}

// 拼接接口地址（api.js 使用）
export function buildUrl(p) {
  return getBaseUrl().then((base) => base + p)
}

// 同步拼接：图片地址等渲染场景使用
//   /uploads/x.jpg                     -> 当前后端地址 + 路径
//   http://<旧IP>/uploads/x.jpg        -> 换成当前后端地址（数据库里的老数据也能显示）
//   https://cdn.xxx/x.jpg 等外部地址   -> 原样返回，不做改写
export function assetUrl(p) {
  const path = String(p || '').trim()
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) {
    // 只改写指向某个后端服务器的 /uploads 地址，其它外链保持原样
    if (path.indexOf('/uploads/') >= 0) {
      const m = path.match(/\/uploads\/[^?#]+/)
      if (m) return baseUrlSync() + withToken(m[0])
    }
    return path
  }
  if (path.charAt(0) === '/') return baseUrlSync() + withToken(path)
  return path
}

// 上传的图片现在需要鉴权（只有本人和管理员能看），
// 而 <image> 标签没法带请求头，所以把 token 拼到 query 上。
// 只对 /uploads 路径生效，避免把 token 泄露给外部站点。
function withToken(u) {
  try {
    if (u.indexOf('/uploads/') < 0) return u
    if (/[?&]token=/.test(u)) return u
    const token = uni.getStorageSync('token')
    if (!token) return u
    return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token)
  } catch (e) {
    return u
  }
}

// 兼容旧名字：以前是异步的，现在改为同步返回字符串
export function imageUrl(raw) {
  return assetUrl(raw)
}

// ==================== 后端地址探测 ====================
let _probing = false
let _probed = false

function pickBaseUrl() {
  const platform = currentPlatform()
  const origin = platform === 'h5' ? trimSlash(pageOrigin()) : ''
  const fallback = trimSlash(APP_BASE_URL)
  if (!origin) return fallback
  if (origin === fallback) return origin

  const cached = trimSlash(readCached())

  // 候选项（按优先级）：
  //   1. 上次记住的地址 —— 但【必须重新验证】。
  //      以前的写法是直接 return cached，结果一旦缓存错（比如后端没启动时把前端
  //      自己的 5173 当成后端存下来），就会永远用错地址、再也纠正不回来。
  //   2. 同一个网页主机的 3000 端口 —— 前后端同机部署时最标准的情况。
  //      比如页面在 http://10.227.89.6:5173，后端通常就是 http://10.227.89.6:3000。
  //   3. 当前网页地址本身（后端和前端同端口时）。
  //   4. 配置里的固定地址（给真机 App / 小程序用）。
  const candidates = []
  const add = (u) => { if (u && candidates.indexOf(u) < 0) candidates.push(u) }

  add(cached)
  const m = /^(https?:\/\/[^/:]+)(?::\d+)?$/i.exec(origin || '')
  if (m) add(m[1] + ':' + PORT)
  add(origin)
  add(fallback)
  if (!candidates.length) return origin || fallback

  return new Promise((resolve) => {
    // 兜底：最多探测 6 秒，超时用第一个候选，避免页面一直转圈
    const guard = setTimeout(() => resolve(candidates[0]), 6000)
    let i = 0
    const tryNext = () => {
      if (i >= candidates.length) { clearTimeout(guard); return resolve(candidates[0]) }
      const base = candidates[i++]
      uni.request({
        url: base + '/api/health',
        method: 'GET',
        timeout: 2500,
        // 必须确认对方真的是我们的后端（返回 code:200 的 JSON）。
        // Vite / HBuilderX 开发服务器对任意路径都返回 HTML，那些响应会在这里被排除。
        success: (res) => {
          const d = res.data
          if (res.statusCode === 200 && d && d.code === 200) {
            clearTimeout(guard)
            writeCached(base)
            resolve(base)
          } else {
            tryNext()
          }
        },
        fail: tryNext
      })
    }
    tryNext()
  })
}

// 首次调用时探测一次（异步，不阻塞渲染）；并发调用共享同一次探测
let _pending = null
export function ensureBaseUrl() {
  if (_probed && !_pending) return Promise.resolve(_resolved)
  if (_pending) return _pending
  _probed = true
  _probing = true
  _pending = Promise.resolve(pickBaseUrl()).then((base) => {
    _probing = false
    setBase(base)
    const list = _waiters.splice(0)
    list.forEach((fn) => fn())
    return _resolved
  }).catch((e) => {
    _probing = false
    console.warn('[config] 后端地址探测失败，继续使用', _resolved, e && e.message)
    return _resolved
  })
  return _pending
}

// 模块加载即开始探测，页面渲染时地址已经基本确定
ensureBaseUrl()

// ==================== 运行时设置后端地址 ====================
// 用途：App/小程序 装到别人手机上时，让对方在「系统设置 → 后端地址」里填自己的服务器，
// 不用重新打包。值存在本地存储里，优先级高于编译时的 BACKEND_HOST。
export function currentBackendUrl() {
  try {
    return trimSlash(uni.getStorageSync('backendUrl') || '') || _resolved
  } catch (e) {
    return _resolved
  }
}

export function setBackendUrl(url) {
  const v = trimSlash(String(url || '').trim())
  try {
    if (v) uni.setStorageSync('backendUrl', v)
    else uni.removeStorageSync('backendUrl')
  } catch (e) {}
  // 手动设置后不再自动探测，避免被探测结果覆盖
  _probed = true
  _probing = false
  if (v) {
    setBase(v)
  } else {
    // 恢复默认（编译时的地址）
    setBase(trimSlash(APP_BASE_URL))
  }
  return v || trimSlash(APP_BASE_URL)
}
