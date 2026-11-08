<template>
  <view class="page-wrap" :style="{ paddingTop: statusBarHeight + 'px' }">
    <!-- 头部 -->
    <view class="hero">
      <view class="hero-bg"></view>
      <view class="hero-inner" @click="onHeroTap">
        <view class="avatar-ring">
          <UserAvatar :src="avatar" :name="displayName" :size="108" />
        </view>
        <view class="hero-info">
          <text class="hero-name">{{ loggedIn ? (nickname || username || '用户') : '未登录' }}</text>
          <text class="hero-account">{{ loggedIn ? ('@' + (account || username || '--')) : '点击登录，解锁全部功能' }}</text>
        </view>
        <text class="hero-edit" v-if="loggedIn">编辑 ›</text>
      </view>
      <image class="hero-deco" src="/static/icons/brand-mark.png" mode="aspectFit" />
    </view>

    <!-- 游客提示 -->
    <view class="guest-bar" v-if="!loggedIn">
      <view class="guest-bar-texts">
        <text class="guest-bar-title">当前是游客模式</text>
        <text class="guest-bar-sub">{{ guestHint }}</text>
      </view>
      <text class="guest-bar-btn" @click="goLogin">登录 / 注册</text>
    </view>

    <!-- 数据概览 -->
    <view class="stat-card">
      <view class="stat-cell" @click="goToHistory">
        <text class="stat-num">{{ stats.historyCount || 0 }}</text>
        <text class="stat-label">识别记录</text>
      </view>
      <view class="stat-line"></view>
      <view class="stat-cell" @click="goToCollection">
        <text class="stat-num">{{ stats.collectionCount || 0 }}</text>
        <text class="stat-label">我的收藏</text>
      </view>
      <view class="stat-line"></view>
      <view class="stat-cell">
        <text class="stat-num">{{ stats.diseaseCount || 0 }}</text>
        <text class="stat-label">病害百科</text>
      </view>
    </view>

    <!-- 管理员入口（仅管理员可见） -->
    <view class="admin-bar" v-if="isAdmin" @click="goAdmin">
      <image class="admin-emoji" src="/static/icons/ui-admin.png" mode="aspectFit" />
      <view class="admin-texts">
        <text class="admin-title">管理后台</text>
        <text class="admin-sub">管理病虫害知识库、查看识别历史与用户纠错</text>
      </view>
      <text class="admin-arrow">›</text>
    </view>

    <!-- 最近 7 天识别趋势 -->
    <view class="trend-card" v-if="trend && trend.length">
      <view class="trend-head">
        <text class="trend-title">最近 7 天识别</text>
        <text class="trend-total">{{ trendTotal }} 次</text>
      </view>
      <view class="trend-bars">
        <view class="trend-col" v-for="(d, i) in trend" :key="i">
          <view class="trend-bar-wrap">
            <view class="trend-bar" :style="{ height: barHeight(d.count) }"></view>
          </view>
          <text class="trend-day">{{ d.day }}</text>
        </view>
      </view>
    </view>

    <!-- 菜单 -->
    <view class="menu-card">
      <view class="menu-row" @click="goToHistory">
        <image class="menu-icon" src="/static/icons/me-history.png" mode="aspectFit" />
        <text class="menu-text">识别历史</text>
        <text class="menu-arrow">›</text>
      </view>
      <view class="menu-row" @click="goToCollection">
        <image class="menu-icon" src="/static/icons/me-collect.png" mode="aspectFit" />
        <text class="menu-text">我的收藏</text>
        <text class="menu-arrow">›</text>
      </view>
    </view>

    <view class="menu-card">
      <view class="menu-row" @click="goToSettings">
        <image class="menu-icon" src="/static/icons/me-settings.png" mode="aspectFit" />
        <text class="menu-text">系统设置</text>
        <text class="menu-arrow">›</text>
      </view>
      <view class="menu-row" @click="goToHelp">
        <image class="menu-icon" src="/static/icons/me-help.png" mode="aspectFit" />
        <text class="menu-text">使用帮助</text>
        <text class="menu-arrow">›</text>
      </view>
      <view class="menu-row" @click="goToFeedback">
        <image class="menu-icon" src="/static/icons/me-feedback.png" mode="aspectFit" />
        <text class="menu-text">意见反馈</text>
        <text class="menu-arrow">›</text>
      </view>
    </view>

    <view class="logout-wrap" v-if="loggedIn">
      <view class="logout-btn" @click="handleLogout">退出登录</view>
    </view>

    <TabBar current="profile" />
  </view>
</template>

<script>
import { isLoggedIn, remainingCount, limitHint } from '@/utils/guest.js'
import { imageUrl } from '@/utils/config.js'
import { getStatusBarHeight } from '@/utils/wininfo.js'
import TabBar from '@/components/TabBar.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { api } from '@/utils/api.js'

export default {
  components: { TabBar, UserAvatar },
  data() {
    return {
      statusBarHeight: 0,
      loggedIn: false,
      nickname: '',
      avatar: '',
      guestHint: '',
      username: '',
      account: '',
      stats: { historyCount: 0, collectionCount: 0, diseaseCount: 0 },
      isAdmin: false,          // 管理员入口：来自登录返回的 isAdmin
      trend: [],               // 最近 7 天识别次数
      trendTotal: 0
    }
  },
  computed: {
    // 头像首字：昵称 > 账号
    displayName() {
      return this.nickname || this.username || this.account || ''
    }
  },
  onShow() {
    this.statusBarHeight = getStatusBarHeight()
          this.refreshLoginState()
      // 游客不请求个人信息（没 token 会 401），登录了才拉
      if (this.loggedIn) {
        this.loadUserInfo()
      }
      this.loadStats()
  },
  methods: {
    // 头像文件可能已被删除（历史数据），加载失败就回落到默认头像，别显示破图
    onAvatarError() {
      this.avatar = ''
    },

    async loadUserInfo() {
      const userInfo = uni.getStorageSync('userInfo')
      if (userInfo?.username) {
        this.username = userInfo.username
        this.account = userInfo.username
      }
      try {
        const res = await api.getUserInfo()
        this.username = res.data?.username || this.username
        this.account = res.data?.username || this.account
        this.nickname = res.data?.nickname || ''
        this.avatar = res.data?.avatar ? imageUrl(res.data.avatar) : ''
        this.isAdmin = Number(res.data?.isAdmin || res.data?.is_admin || 0) === 1
        uni.setStorageSync('userInfo', res.data)
      } catch (e) {
        // 接口异常时保持既有缓存展示，仅记录日志
        console.error('获取用户信息失败:', e)
      }
    },
    async loadStats() {
      try {
        const res = await api.getStats()
        const d = res.data || {}
        // 登录用户看"我的"数字，游客看全站数字（后端两个字段都返回）
        this.stats = Object.assign({}, d, {
          historyCount: d.myHistoryCount != null ? d.myHistoryCount : d.historyCount,
          collectionCount: d.myCollectionCount != null ? d.myCollectionCount : d.collectionCount
        })
        this.trend = Array.isArray(d.trend) ? d.trend : []
        this.trendTotal = this.trend.reduce((s, x) => s + Number(x.count || x.n || 0), 0)
      } catch (e) { /* 忽略 */ }
    },

    // 趋势柱高度：按当天最大值归一化，最小 8%（全天 0 次也留一点高度）
    barHeight(count) {
      const max = Math.max(1, ...this.trend.map((x) => Number(x.count || x.n || 0)))
      const h = Math.round((Number(count || 0) / max) * 100)
      return Math.max(8, h) + '%'
    },

    // 管理员入口：H5 新开后台，App/小程序提示用电脑浏览器打开
    goAdmin() {
      // #ifdef H5
      window.open('/admin', '_blank')
      return
      // #endif
      uni.showModal({
        title: '管理后台',
        content: '后台是网页版，请在电脑浏览器打开：' + '\n' + 'http://<后端地址>:3000/admin',
        showCancel: false
      })
    },
    // 刷新登录状态与游客提示
    refreshLoginState() {
      this.loggedIn = isLoggedIn()
      this.guestHint = this.loggedIn ? '' : limitHint()
      if (!this.loggedIn) {
        this.username = ''
        this.account = ''
        this.nickname = ''
        this.avatar = ''
      }
    },

    // 点头部：登录后进资料编辑，游客去登录
    onHeroTap() {
      if (this.loggedIn) {
        uni.navigateTo({ url: '/pages/profile-edit/profile-edit' })
      } else {
        this.goLogin()
      }
    },

    goLogin() {
      uni.navigateTo({ url: '/pages/login/login?from=profile' })
    },

    handleLogout() {
        uni.showModal({
          title: '提示',
          content: '确定要退出登录吗？',
          success: (res) => {
            if (res.confirm) {
              uni.removeStorageSync('token')
              uni.removeStorageSync('userInfo')
              // 关键：清完缓存必须同步界面状态，否则还停在「已登录」，
              // 要手动刷新页面才变（以前的 bug）。
              this.loggedIn = false
              this.nickname = ''
              this.avatar = ''
              this.username = ''
              this.account = ''
              this.stats = { historyCount: 0, collectionCount: 0, diseaseCount: 0 }
              this.refreshLoginState()
              api.logout().catch(() => {})   // 通知后端作废会话，失败也不影响本地退出
              uni.showToast({ title: '已退出登录', icon: 'success' })
            }
          }
        })
      },
    goToHistory() { uni.navigateTo({ url: '/pages/history/history' }) },
    goToCollection() { uni.navigateTo({ url: '/pages/collection/collection' }) },
    goToSettings() { uni.navigateTo({ url: '/pages/settings/settings' }) },
    goToHelp() { uni.navigateTo({ url: '/pages/help/help' }) },
    goToFeedback() { uni.navigateTo({ url: '/pages/feedback/feedback' }) }
  }
}
</script>
<style scoped>
/* ---------- 头部 ---------- */
.hero {
  position: relative;
  margin: 24rpx 32rpx 0;
  border-radius: var(--r-xl);
  background: linear-gradient(135deg, #0f766e 0%, #0f766e 60%, #14b8a6 100%);
  padding: 44rpx 40rpx;
  overflow: hidden;
  box-shadow: 0 16rpx 44rpx rgba(15, 118, 110, 0.28);
}
.hero-bg {
  position: absolute; right: -100rpx; top: -100rpx;
  width: 340rpx; height: 340rpx; border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
}
.hero-inner { position: relative; z-index: 2; display: flex; align-items: center; }
.avatar-ring {
  width: 132rpx; height: 132rpx; border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.hero-info { margin-left: 28rpx; flex: 1; display: flex; flex-direction: column; }
.hero-name { font-size: 42rpx; font-weight: 800; color: #fff; letter-spacing: 0; }
.hero-account { font-size: 24rpx; color: rgba(255, 255, 255, 0.85); margin-top: 10rpx; }
.hero-deco { position: absolute; right: -20rpx; bottom: -20rpx; width: 160rpx; height: 160rpx; opacity: 0.12; }

/* ---------- 数据 ---------- */
.stat-card {
  display: flex; align-items: center;
  margin: -36rpx 32rpx 0;
  background: #fff; border-radius: var(--r-lg);
  box-shadow: 0 10rpx 30rpx rgba(15, 23, 42, 0.1);
  padding: 28rpx 0;
  position: relative; z-index: 3;
}
.stat-cell { flex: 1; display: flex; flex-direction: column; align-items: center; }
.stat-line { width: 2rpx; height: 52rpx; background: var(--line); }
.stat-num { font-size: 40rpx; font-weight: 800; color: var(--c-primary-dark); }
.stat-label { font-size: 22rpx; color: var(--t-faint); margin-top: 8rpx; }

/* ---------- 菜单 ---------- */
.menu-card {
  margin: 28rpx 32rpx 0;
  background: #fff; border-radius: var(--r-lg);
  box-shadow: var(--sh-card);
  overflow: hidden;
}
.menu-row {
  display: flex; align-items: center;
  padding: 30rpx 32rpx;
  border-bottom: 2rpx solid var(--bg-soft);
}
.menu-row:last-child { border-bottom: none; }
.menu-row:active { background: #FAFCFB; }
.menu-icon { width: 64rpx; height: 64rpx; flex-shrink: 0; }
.menu-text { flex: 1; margin-left: 24rpx; font-size: 30rpx; color: var(--t-main); font-weight: 500; }
.menu-arrow { font-size: 44rpx; color: #CBD5E1; line-height: 1; }

/* ---------- 退出 ---------- */
.admin-bar {
  display: flex; align-items: center;
  margin: 28rpx 32rpx 0; padding: 28rpx 30rpx;
  background: linear-gradient(135deg, #f0fdfa, #ccfbf1);
  border-radius: var(--r-lg);
  border: 2rpx solid #99f6e4;
}
.admin-bar:active { transform: scale(0.985); }
.admin-emoji { width: 48rpx; height: 48rpx; margin-right: 20rpx; flex-shrink: 0; }
.admin-texts { flex: 1; display: flex; flex-direction: column; }
.admin-title { font-size: 29rpx; font-weight: 700; color: var(--c-primary-deep); }
.admin-sub { font-size: 21rpx; color: #0f766e; margin-top: 6rpx; }
.admin-arrow { font-size: 44rpx; color: #14b8a6; }

.trend-card {
  margin: 28rpx 32rpx 0; padding: 30rpx 32rpx;
  background: #fff; border-radius: var(--r-lg); box-shadow: var(--sh-card);
}
.trend-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 22rpx; }
.trend-title { font-size: 28rpx; font-weight: 700; color: var(--t-strong); }
.trend-total { font-size: 24rpx; color: var(--c-primary-dark); font-weight: 600; }
.trend-bars { display: flex; align-items: flex-end; justify-content: space-between; }
.trend-col { flex: 1; display: flex; flex-direction: column; align-items: center; }
.trend-bar-wrap { height: 130rpx; display: flex; align-items: flex-end; }
.trend-bar {
  width: 34rpx; border-radius: 10rpx;
  background: linear-gradient(180deg, #5eead4, #0f766e);
  min-height: 6rpx;
}
.trend-day { font-size: 19rpx; color: var(--t-faint); margin-top: 10rpx; }

.logout-wrap { padding: 40rpx 32rpx 0; }
.logout-btn {
  height: 96rpx; border-radius: var(--r-lg);
  background: #fff; color: var(--c-danger);
  font-size: 30rpx; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
  box-shadow: var(--sh-card);
  border: 2rpx solid #FEE2E2;
}
.logout-btn:active { background: #FEF2F2; }

/* ============ 游客模式 ============ */
.hero-edit { font-size: 24rpx; color: rgba(255,255,255,0.9); margin-left: auto; padding-left: 16rpx; }
.guest-bar { display: flex; align-items: center; justify-content: space-between; margin: 0 32rpx 32rpx; padding: 32rpx; border-radius: 24rpx; background: linear-gradient(135deg, #f0fdfa, #ccfbf1); border: 2rpx solid #99f6e4; }
.guest-bar-texts { flex: 1; display: flex; flex-direction: column; }
.guest-bar-title { font-size: 30rpx; font-weight: 700; color: #115e59; }
.guest-bar-sub { font-size: 24rpx; color: #0f766e; margin-top: 6rpx; }
.guest-bar-btn { padding: 14rpx 28rpx; border-radius: 99rpx; background: #0f766e; color: #fff; font-size: 26rpx; font-weight: 700; }
.login-btn { margin: 32rpx; height: 96rpx; border-radius: 24rpx; background: linear-gradient(135deg, #14b8a6, #0f766e); color: #fff; font-size: 32rpx; font-weight: 700; display: flex; align-items: center; justify-content: center; box-shadow: 0 12rpx 32rpx rgba(15, 118, 110,0.25); }

</style>
