/**
 * 安全返回上一页。
 *
 * 为什么需要：tab 页面（首页/识别/百科/历史/预警/我的）是用 reLaunch 打开的，
 * 页面栈里只有 1 页，直接 uni.navigateBack() 会报
 *   "navigateBack:fail cannot navigate back at first page"
 * 并且页面卡住不动。
 *
 * 规则：有上一页就返回，没有就回首页。
 */
export function safeBack(fallbackUrl) {
  try {
    const pages = (typeof getCurrentPages === 'function') ? getCurrentPages() : []
    if (pages && pages.length > 1) {
      uni.navigateBack()
      return
    }
  } catch (e) { /* 取页面栈失败，走兜底 */ }
  uni.reLaunch({ url: fallbackUrl || '/pages/index/index' })
}
