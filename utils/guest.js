// ==================================================================
// 游客模式：不用登录也能用，但只给 3 次免费识别
//
// 为什么限制 3 次：识别要调用付费 AI 接口（DeepSeek + 百度），
//   完全放开会被刷额度。3 次足够让新用户看到效果，再引导注册。
// ==================================================================

const FREE_LIMIT = 3
const KEY_USED = 'guestUsed'
const KEY_TOTAL = 'guestTotal'

// 是否已登录
export function isLoggedIn() {
  try { return !!uni.getStorageSync('token') } catch (e) { return false }
}

// 已经用掉几次
export function usedCount() {
  try { return Number(uni.getStorageSync(KEY_USED)) || 0 } catch (e) { return 0 }
}

// 免费额度
export const freeLimit = FREE_LIMIT

// 剩余次数（已登录则返回 -1 表示不限）
export function remainingCount() {
  if (isLoggedIn()) return -1
  return Math.max(0, FREE_LIMIT - usedCount())
}

// 还能不能识别
export function canRecognize() {
  if (isLoggedIn()) return true
  return usedCount() < FREE_LIMIT
}

// 消耗一次额度（识别成功后调用）
export function consumeOnce() {
  if (isLoggedIn()) return
  try {
    const n = usedCount() + 1
    uni.setStorageSync(KEY_USED, n)
    uni.setStorageSync(KEY_TOTAL, n)
  } catch (e) {}
}

// ---------- AI 问答额度（与识别分开计）----------
const CHAT_LIMIT = 3
const KEY_CHAT = 'guestChatUsed'

export const chatLimit = CHAT_LIMIT

export function chatUsed() {
  try { return Number(uni.getStorageSync(KEY_CHAT)) || 0 } catch (e) { return 0 }
}

export function chatRemaining() {
  if (isLoggedIn()) return -1
  return Math.max(0, CHAT_LIMIT - chatUsed())
}

export function canAsk() {
  if (isLoggedIn()) return true
  return chatUsed() < CHAT_LIMIT
}

export function consumeAsk() {
  if (isLoggedIn()) return
  try { uni.setStorageSync(KEY_CHAT, chatUsed() + 1) } catch (e) {}
}

export function chatHint() {
  const left = chatRemaining()
  if (left < 0) return ''
  if (left === 0) return '免费提问次数已用完，登录后不限次数'
  return '未登录还可提问 ' + left + ' 次'
}

// 提问额度用完 -> 引导登录
export function promptLoginChat() {
  return new Promise((resolve) => {
    uni.showModal({
      title: '免费提问次数已用完',
      content: '未登录可免费提问 ' + CHAT_LIMIT + ' 次，登录后不限次数。',
      confirmText: '去登录',
      cancelText: '再想想',
      success: (r) => {
        if (r.confirm) {
          uni.navigateTo({ url: '/pages/login/login?from=chat' })
          resolve(true)
        } else resolve(false)
      },
      fail: () => resolve(false)
    })
  })
}

// 提示还剩几次
export function limitHint() {
  const left = remainingCount()
  if (left < 0) return ''
  if (left === 0) return '免费次数已用完，登录后不限次数'
  return '未登录还可识别 ' + left + ' 次'
}

// 免费次数用完 -> 引导登录
//   action: 'recognize' 表示用户是在点识别时被拦下的
export function promptLogin(action) {
  return new Promise((resolve) => {
    uni.showModal({
      title: '免费次数已用完',
      content: '未登录状态下可免费识别 ' + FREE_LIMIT + ' 次，登录后不限次数，还能保存识别记录和收藏。',
      confirmText: '去登录',
      cancelText: '再想想',
      success: (r) => {
        if (r.confirm) {
          uni.navigateTo({ url: '/pages/login/login?from=' + encodeURIComponent(action || 'index') })
          resolve(true)
        } else {
          resolve(false)
        }
      },
      fail: () => resolve(false)
    })
  })
}

// 是否游客（用于页面显示"登录"入口而不是"退出登录"）
export function isGuest() {
  return !isLoggedIn()
}
