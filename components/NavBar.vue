<template>
  <view class="app-nav" :class="{ 'app-nav-white': white }">
    <view :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="app-nav-inner">
        <view v-if="back" class="nav-back app-nav-back" @click="handleBack">
          <text class="app-nav-back-text">‹</text>
        </view>
        <view class="app-nav-center">
          <text class="app-nav-title">{{ title }}</text>
          <text v-if="subtitle" class="app-nav-sub">{{ subtitle }}</text>
        </view>
        <view class="app-nav-right" :style="{ paddingRight: capsuleInset + 'px' }">
          <slot name="right"></slot>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { getStatusBarHeight, getWinInfo } from '@/utils/wininfo.js'
import { safeBack } from '@/utils/nav.js'

export default {
  props: {
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    back: { type: Boolean, default: true },
    fallback: { type: String, default: '/pages/index/index' },
    white: { type: Boolean, default: false }
  },
  data() {
    return { statusBarHeight: 0, capsuleInset: 0 }
  },
  created() {
    this.statusBarHeight = getStatusBarHeight()
    // 微信右上角胶囊：右侧操作要左移，否则会被胶囊挡住
    // #ifdef MP-WEIXIN
    try {
      const rect = typeof wx !== 'undefined' && wx.getMenuButtonBoundingClientRect
        ? wx.getMenuButtonBoundingClientRect()
        : null
      const info = getWinInfo()
      if (rect && rect.left) {
        // 右侧默认距边 16px；左移到胶囊左侧再留 8px
        this.capsuleInset = Math.max(0, (info.windowWidth || 375) - rect.left + 8 - 16)
      }
    } catch (e) { /* 用默认值即可 */ }
    // #endif
  },
  methods: {
    handleBack() {
      safeBack(this.fallback)
    }
  }
}
</script>

<style scoped>
.app-nav { background: transparent; }
.app-nav-white { background: #fff; }

.app-nav-inner {
  position: relative;
  display: flex;
  align-items: center;
  height: 88rpx;
  padding: 0 32rpx;
  box-sizing: border-box;
}

.app-nav-back {
  position: relative;
  z-index: 2;
  flex-shrink: 0;
}
.app-nav-back-text { font-size: 34rpx; line-height: 1; color: var(--t-main); }

.app-nav-center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  max-width: 62%;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 1;
}
.app-nav-title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--t-strong);
  line-height: 1.4;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.app-nav-sub {
  font-size: 21rpx;
  color: var(--t-faint);
  line-height: 1.4;
  margin-top: 2rpx;
  text-align: center;
}

.app-nav-right {
  margin-left: auto;
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
</style>
