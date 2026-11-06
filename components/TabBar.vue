<template>
  <view class="tabbar-wrap">
    <view class="tabbar">
      <view
        class="tab-item"
        :class="{ active: current === item.path }"
        v-for="item in validTabList"
        :key="item.path"
        @click="switchTab(item.path)"
      >
        <view class="tab-icon-wrap" :class="{ 'on': current === item.path }">
          <image class="tab-img" :src="current === item.path ? item.iconOn : item.icon" mode="aspectFit" />
        </view>
        <text class="tab-text">{{ item.text }}</text>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  props: {
    current: {
      type: String,
      default: 'index'
    }
  },

  data() {
    return {
      tabList: [
        { path: 'index', text: '首页', icon: '/static/icons/tab-index.png', iconOn: '/static/icons/tab-index-on.png' },
        { path: 'recognize', text: '识别', icon: '/static/icons/tab-recognize.png', iconOn: '/static/icons/tab-recognize-on.png' },
        { path: 'encyclopedia', text: '百科', icon: '/static/icons/tab-encyclopedia.png', iconOn: '/static/icons/tab-encyclopedia-on.png' },
        { path: 'history', text: '历史', icon: '/static/icons/tab-history.png', iconOn: '/static/icons/tab-history-on.png' },
        { path: 'warning', text: '预警', icon: '/static/icons/tab-warning.png', iconOn: '/static/icons/tab-warning-on.png' },
        { path: 'profile', text: '我的', icon: '/static/icons/tab-profile.png', iconOn: '/static/icons/tab-profile-on.png' }
      ]
    }
  },

  computed: {
    validTabList() {
      return this.tabList.filter(item => item && typeof item === 'object' && item.path)
    }
  },

  methods: {
    switchTab(path) {
      if (path === this.current) return
      // 使用 reLaunch 关闭所有页面后打开目标页，模拟原生 tab 切换
      uni.reLaunch({
        url: `/pages/${path}/${path}`
      })
    }
  }
}
</script>

<style scoped>
/* 悬浮胶囊式导航：比贴底的白色长条更有层次 */
.tabbar-wrap {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 0 20rpx calc(16rpx + env(safe-area-inset-bottom));
  z-index: 9999;
  pointer-events: none;
}

.tabbar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  height: 116rpx;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(20rpx);
  border-radius: 36rpx;
  box-shadow: 0 8rpx 36rpx rgba(15, 23, 42, 0.12);
  border: 1rpx solid rgba(255, 255, 255, 0.8);
  pointer-events: auto;
}

.tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  height: 100%;
}

.tab-icon-wrap {
  width: 64rpx;
  height: 54rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 18rpx;
  transition: all 0.22s ease;
}

.tab-icon-wrap.on {
  background: linear-gradient(135deg, #ccfbf1, #99f6e4);
  box-shadow: 0 4rpx 14rpx rgba(15, 118, 110, 0.25);
}

.tab-img {
  width: 44rpx;
  height: 44rpx;
  transition: all 0.22s ease;
}

.tab-icon-wrap.on .tab-img {
  transform: translateY(-1rpx);
}

.tab-text {
  font-size: 20rpx;
  color: #94A3B8;
  margin-top: 2rpx;
  transition: all 0.22s ease;
}

.tab-item.active .tab-text {
  color: var(--c-primary-deep, #115e59);
  font-weight: 700;
}
/* 宽屏：底部导航和内容同宽同位置 */
@media screen and (min-width: 750px) {
  .tabbar-wrap {
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    width: 750px;
  }
}
</style>
