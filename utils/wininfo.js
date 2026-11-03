/**
 * 窗口信息工具。
 *
 * 为什么不用 uni.getSystemInfoSync()：
 *   微信从基础库 2.20.1 起废弃了 getSystemInfo / getSystemInfoSync，
 *   开发者工具会刷警告，将来会移除。官方拆成了 getWindowInfo /
 *   getDeviceInfo / getAppBaseInfo 等按需调用的接口。
 *
 * 本项目只需要 statusBarHeight 和 windowWidth，所以统一走 getWindowInfo，
 * 在老基础库上回退到 getSystemInfoSync（已 try/catch，不会报错）。
 */
export function getWinInfo() {
  // #ifdef MP-WEIXIN
  try {
    if (typeof wx !== 'undefined' && wx.getWindowInfo) {
      return wx.getWindowInfo()
    }
  } catch (e) { /* 回退到下面的通用接口 */ }
  // #endif
  try {
    return uni.getSystemInfoSync()
  } catch (e) {
    return { statusBarHeight: 0, windowWidth: 375, windowHeight: 667 }
  }
}

/**
 * 取自定义导航栏需要避让的状态栏高度。
 * 小程序里优先用胶囊按钮的位置（比 statusBarHeight 更准），
 * H5 / App 用状态栏高度。
 */
export function getStatusBarHeight() {
  // #ifdef MP-WEIXIN
  try {
    const rect = typeof wx !== 'undefined' && wx.getMenuButtonBoundingClientRect
      ? wx.getMenuButtonBoundingClientRect()
      : null
    if (rect && rect.top) return rect.top
  } catch (e) { /* 用兜底值 */ }
  // #endif
  return (getWinInfo() || {}).statusBarHeight || 0
}
