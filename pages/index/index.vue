<template>
  <view class="page-wrap">
    <!-- 顶部问候 -->
    <view class="top-bar" :style="{ paddingTop: (statusBarHeight + 12) + 'px' }">
      <view class="top-left">
        <image class="brand-dot" src="/static/icons/brand-logo.png" mode="aspectFit" />
        <view class="brand-text">
          <text class="brand-name">禾诊</text>
          <text class="brand-date">{{ dateText }}</text>
        </view>
      </view>
      <view class="top-right" :style="{ marginRight: capsuleInset + 'px' }" @click="goToProfile">
        <image class="avatar-emoji" src="/static/icons/avatar-default.png" mode="aspectFit" />
      </view>
    </view>

    <view class="greet">
      <text class="greet-hi">{{ greeting }}，欢迎回来</text>
      <text class="greet-sub">今天也来守护你的作物吧</text>
    </view>

    <!-- 主面板：融合「预警 + 识别入口 + 数据」 -->
    <view class="hero-card" >
      <view class="hero-glow"></view>

      <!-- 顶部：日期 + 风险胶囊 -->
      <view class="hero-top">
        <text class="hero-date">{{ dateText }}</text>
        <view class="risk-pill" v-if="topWarning" :class="'rp-' + topWarning.level">
          <text class="risk-pill-text">{{ topWarning.levelText }}</text>
        </view>
        <view class="risk-pill rp-none" v-else>
          <text class="risk-pill-text">暂无预警</text>
        </view>
      </view>

      <!-- 主体：预警标题 + 说明 或 识别引导 -->
      <block v-if="topWarning">
        <text class="hero-title">{{ topWarning.title }}</text>
        <text class="hero-desc">{{ heroDesc }}</text>

        <view class="hero-advice" v-if="topWarning.suggestion">
          <image class="advice-icon" src="/static/icons/ui-bulb-light.png" mode="aspectFit" />
          <text class="advice-text">{{ adviceShort }}</text>
        </view>
      </block>
      <block v-else>
        <text class="hero-title">拍照识别病虫害</text>
        <text class="hero-desc">百度植物识别 + DeepSeek 诊断，秒级给出防治方案</text>
      </block>

      <!-- 数据行（参考设计：温度/湿度/风力/降雨 那种四宫格） -->
      <view class="hero-metrics">
        <view class="metric" v-for="(m, i) in metrics" :key="i">
          <text class="metric-num">{{ m.value }}</text>
          <text class="metric-label">{{ m.label }}</text>
        </view>
      </view>

      <!-- 底部操作 -->
      <view class="hero-actions">
        <view class="hero-btn-main" @click="goToRecognize">
          <image class="hero-btn-icon" src="/static/icons/tab-recognize-on.png" mode="aspectFit" />
          <text class="hero-btn-text">立即识别</text>
        </view>
        <view class="hero-btn-ghost" @click="goToWarning" v-if="topWarning">
          <text class="hero-btn-text-ghost">预警详情</text>
        </view>
      </view>
    </view>

    <!-- 功能入口 -->
    <view class="features-section">
      <view class="sec-head">
        <text class="sec-title">全部功能</text>
        <text class="sec-sub">{{ features.length }} 大模块</text>
      </view>
      <view class="feature-grid">
        <view class="feature-card" v-for="(item, index) in features" :key="index" @click="handleFeatureClick(item.action)">
          <view class="feature-icon">
            <image class="feature-img" :src="item.icon" mode="aspectFit" />
          </view>
          <view class="feature-body">
            <text class="feature-title">{{ item.title }}</text>
            <text class="feature-desc">{{ item.desc }}</text>
          </view>
          <text class="feature-arrow">›</text>
        </view>
      </view>
    </view>

    <TabBar current="index" />
  </view>
</template>

<script>
import TabBar from '@/components/TabBar.vue'
import { getStatusBarHeight, getWinInfo } from '@/utils/wininfo.js'
import { api } from '@/utils/api.js'

export default {
  components: { TabBar },
  data() {
    return {
      statusBarHeight: 0,
      capsuleInset: 0,
      menuVisible: false,
      greeting: '',
      dateText: '',
      // 病害数量由接口返回，这里只是首屏占位（没网时也不会显示错误数字）
      topWarning: null,      // 首页展示的最高等级预警
      warningList: [],
      welcomeStats: { disease: 0, history: 0, collection: 0 },
      statList: [
        { value: '—', label: '病害库' },
        { value: 'AI', label: '智能诊断' },
        { value: '—', label: '识别记录' }
      ],
      features: [
        { icon: '/static/icons/func-qa.png', title: 'AI 农技问答', desc: '不懂的农业问题直接问，秒回解答', action: 'chat' },
        { icon: '/static/icons/func-scan.png', title: '智能识别', desc: '拍照或上传图片，AI 秒级识别病虫害', action: 'recognize' },
        { icon: '/static/icons/func-book.png', title: '知识百科', desc: '常见病虫害的识别要点与防治方案', action: 'encyclopedia' },
        { icon: '/static/icons/func-alert.png', title: '预警提醒', desc: '实时病虫害预警，提前防范', action: 'warning' },
        { icon: '/static/icons/func-history.png', title: '历史记录', desc: '查看识别记录，追踪病害趋势', action: 'history' }
      ]
    }
  },
  onLoad() {
    this.initStatusBar()
        const now = new Date()
    const h = now.getHours()
    this.greeting = h < 6 ? '凌晨好' : h < 12 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好'
    const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()]
    this.dateText = `${now.getMonth() + 1}月${now.getDate()}日 星期${week}`
    this.loadStats()
    this.loadTopWarning()
  },
  computed: {
    // 面板说明：把预警的地区/范围讲清楚
    heroDesc() {
      const w = this.topWarning
      if (!w) return ''
      const parts = []
      if (w.location) parts.push(w.location)
      if (w.area) parts.push(w.area)
      const head = parts.length ? parts.join(' · ') + '。' : ''
      return head + '请及时查看防治建议，做好防范。'
    },
    // 建议只取第一句，避免面板被长文本撑开
    adviceShort() {
      const s = String((this.topWarning && this.topWarning.suggestion) || '').trim()
      if (!s) return ''
      const cut = s.split(/[；;。]/)[0]
      return cut.length > 42 ? cut.slice(0, 42) + '…' : cut
    },
    // 四宫格指标：预警数量 + 病害库 + 我的记录 + 收藏
    metrics() {
      const hi = this.warningList.filter((x) => x.level === 'high').length
      return [
        { value: this.warningList.length, label: '全部预警' },
        { value: hi, label: '高风险' },
        { value: this.welcomeStats.disease || 0, label: '病害百科' },
        { value: this.welcomeStats.history || 0, label: '识别记录' }
      ]
    }
  },

  methods: {
    // 取状态栏高度（自定义导航栏必须避让，否则标题被时间和胶囊盖住）
    initStatusBar() {
      this.statusBarHeight = getStatusBarHeight()
      // 微信胶囊在右上角，头像要左移，否则会被胶囊挡住
      // #ifdef MP-WEIXIN
      try {
        const rect = typeof wx !== 'undefined' && wx.getMenuButtonBoundingClientRect
          ? wx.getMenuButtonBoundingClientRect()
          : null
        const info = getWinInfo()
        if (rect && rect.left) {
          this.capsuleInset = Math.max(0, (info.windowWidth || 375) - rect.left + 8 - 16)
        }
      } catch (e) { /* 保持 0 */ }
      // #endif
    },

    // 取最高等级的一条预警，作为首页主面板的内容（未登录也能看到）
    async loadTopWarning() {
      try {
        const res = await api.getWarningList()
        const list = (res && res.data) || []
        const rank = { high: 3, medium: 2, low: 1 }
        list.sort((a, b) => (rank[b.level] || 0) - (rank[a.level] || 0))
        this.warningList = list
        const w = list[0]
        if (w) {
          this.topWarning = {
            id: w.id,
            title: w.title,
            level: w.level,
            levelText: w.level_text,
            location: w.location,
            area: w.area,
            suggestion: w.suggestion
          }
        }
      } catch (e) {
        console.warn('首页加载预警失败（不影响其他功能）:', e && e.message)
      }
    },

    // 拉取真实统计：病害库数量、本人识别记录数
    async loadStats() {
      try {
        const res = await api.getStats()
        const d = (res && res.data) || {}
        const disease = Number(d.diseaseCount) || 0
        const mine = Number(d.myHistoryCount)
        this.welcomeStats = {
          disease: disease,
          history: Number.isFinite(mine) ? mine : (Number(d.historyCount) || 0),
          collection: Number(d.myCollectionCount) || 0
        }
        this.statList = [
          { value: disease ? disease + '+' : '—', label: '病害库' },
          { value: 'AI', label: '智能诊断' },
          { value: Number.isFinite(mine) ? String(mine) : String(Number(d.historyCount) || 0), label: '识别记录' }
        ]
      } catch (e) {
        // 接口不可用就保留占位符，不显示假数字
        console.warn('[index] 统计加载失败:', e && e.message)
      }
    },
    toggleMenu() {
      this.menuVisible = !this.menuVisible
    },
    closeMenu() {
      this.menuVisible = false
    },
    // 智能跳转（自动适配 navigateTo / switchTab）
    async smartNavigate(url) {
      this.closeMenu()
      try {
        await uni.navigateTo({ url })
      } catch (e) {
        if (e.errMsg && e.errMsg.includes('navigateTo:fail')) {
          try {
            await uni.switchTab({ url })
          } catch (switchErr) {
            uni.showToast({ title: '页面跳转失败', icon: 'none' })
            console.error('跳转失败:', switchErr)
          }
        }
      }
    },
    handleFeatureClick(action) {
      const map = {
        recognize: '/pages/recognize/recognize',
        encyclopedia: '/pages/encyclopedia/encyclopedia',
        warning: '/pages/warning/warning',
        history: '/pages/history/history',
        chat: '/pages/chat/chat',
      }
      if (map[action]) this.smartNavigate(map[action])
    },
    goToRecognize() { this.smartNavigate('/pages/recognize/recognize') },
    goToEncyclopedia() { this.smartNavigate('/pages/encyclopedia/encyclopedia') },
    goToHistory() { this.smartNavigate('/pages/history/history') },
    goToProfile() { this.smartNavigate('/pages/profile/profile') },
    goToWarning() { this.smartNavigate('/pages/warning/warning') },
    scrollToFeatures() {
      uni.pageScrollTo({ selector: '.features-section', duration: 300 })
    }
  }
}
</script>
<style scoped>
/* ---------- 顶部 ---------- */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 32rpx 8rpx;
}
.top-left { display: flex; align-items: center; }
.brand-dot { width: 76rpx; height: 76rpx; border-radius: 24rpx; display: block; box-shadow: 0 8rpx 20rpx rgba(16, 185, 129, 0.28); }
.brand-text { margin-left: 18rpx; display: flex; flex-direction: column; }
.brand-name { font-size: 32rpx; font-weight: 700; color: var(--t-strong); }
.brand-date { font-size: 22rpx; color: var(--t-faint); margin-top: 2rpx; }
.top-right {
  width: 76rpx; height: 76rpx; border-radius: 50%;
  background: #fff; border: 2rpx solid var(--line);
  display: flex; align-items: center; justify-content: center;
  font-size: 36rpx;
  box-shadow: var(--sh-card);
}

/* ---------- 问候 ---------- */
.greet { padding: 20rpx 32rpx 0; display: flex; flex-direction: column; }
.greet-hi { font-size: 44rpx; font-weight: 800; color: var(--t-strong); letter-spacing: 1rpx; }
.greet-sub { font-size: 25rpx; color: var(--t-sub); margin-top: 8rpx; }

/* ---------- 主识别卡片 ---------- */
.hero-card {
  position: relative;
  margin: 32rpx 32rpx 0;
  border-radius: var(--r-xl);
  background: linear-gradient(135deg, #059669 0%, #10B981 55%, #34D399 100%);
  padding: 44rpx 40rpx;
  overflow: hidden;
  box-shadow: 0 16rpx 44rpx rgba(5, 150, 105, 0.3);
}
.hero-card:active { transform: scale(0.985); }
.hero-glow {
  position: absolute; right: -80rpx; top: -80rpx;
  width: 320rpx; height: 320rpx; border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
}
.hero-title {
  display: block;
  font-size: 48rpx;
  font-weight: 800;
  color: #fff;
  margin-top: 22rpx;
  letter-spacing: 2rpx;
}
.hero-desc {
  display: block;
  font-size: 25rpx;
  color: rgba(255, 255, 255, 0.88);
  line-height: 1.6;
  margin-top: 14rpx;
  max-width: 440rpx;
}
.hero-btn {
  display: inline-flex;
  align-items: center;
  margin-top: 32rpx;
  padding: 18rpx 36rpx;
  border-radius: 999rpx;
  background: #fff;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.14);
}
.hero-btn-icon { width: 34rpx; height: 34rpx; margin-right: 10rpx; flex-shrink: 0; }
.hero-btn-text { font-size: 28rpx; font-weight: 700; color: var(--c-primary-deep); }

/* ---------- 数据概览 ---------- */
.stats-row {
  display: flex;
  margin: 28rpx 32rpx 0;
  background: #fff;
  border-radius: var(--r-lg);
  box-shadow: var(--sh-card);
  padding: 28rpx 0;
}
.stat-item { flex: 1; display: flex; flex-direction: column; align-items: center; position: relative; }
.stat-item + .stat-item::before {
  content: '';
  position: absolute; left: 0; top: 12rpx; bottom: 12rpx;
  width: 2rpx; background: var(--line);
}
.stat-num { font-size: 38rpx; font-weight: 800; color: var(--c-primary-dark); }
.stat-label { font-size: 22rpx; color: var(--t-faint); margin-top: 6rpx; }

/* ---------- 功能列表 ---------- */
.features-section { margin-top: 44rpx; }
.feature-grid { padding: 0 32rpx; display: flex; flex-direction: column; }
.feature-card {
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: var(--r-lg);
  padding: 28rpx 26rpx;
  margin-bottom: 20rpx;
  box-shadow: var(--sh-card);
}
.feature-card:active { transform: scale(0.985); background: #FAFCFB; }
.feature-icon {
  width: 92rpx; height: 92rpx; border-radius: 26rpx;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.feature-img { width: 100%; height: 100%; }
.feature-body { flex: 1; margin-left: 24rpx; display: flex; flex-direction: column; }
.feature-title { font-size: 31rpx; font-weight: 700; color: var(--t-strong); }
.feature-desc { font-size: 23rpx; color: var(--t-sub); margin-top: 8rpx; line-height: 1.5; }
.feature-arrow { font-size: 44rpx; color: #CBD5E1; margin-left: 10rpx; line-height: 1; }

/* ============ 首页主面板（深绿信息卡）============ */
.hero-card {
  position: relative;
  margin: 8rpx 32rpx 32rpx;
  padding: 40rpx 36rpx 32rpx;
  border-radius: 32rpx;
  background: linear-gradient(160deg, #1F6E4C 0%, #2E9E6B 55%, #48B87F 100%);
  box-shadow: 0 20rpx 48rpx rgba(16, 94, 63, .28);
  overflow: hidden;
  color: #fff;
}
.hero-glow {
  position: absolute;
  right: -80rpx;
  top: -80rpx;
  width: 320rpx;
  height: 320rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255,255,255,.16), transparent 70%);
}

/* 顶部：日期 + 风险胶囊 */
.hero-top {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}
.hero-date { font-size: 26rpx; color: rgba(255,255,255,.88); }
.risk-pill {
  padding: 8rpx 26rpx;
  border-radius: 999rpx;
  background: rgba(255,255,255,.95);
}
.risk-pill-text { font-size: 24rpx; font-weight: 700; }
.rp-high .risk-pill-text { color: #DC2626; }
.rp-medium .risk-pill-text { color: #D97706; }
.rp-low .risk-pill-text { color: #CA8A04; }
.rp-none { background: rgba(255,255,255,.25); }
.rp-none .risk-pill-text { color: #fff; }

/* 主体文案 */
.hero-title {
  position: relative;
  display: block;
  font-size: 46rpx;
  font-weight: 800;
  line-height: 1.3;
  margin-bottom: 16rpx;
  color: #fff;
}
.hero-desc {
  position: relative;
  display: block;
  font-size: 26rpx;
  line-height: 1.7;
  color: rgba(255,255,255,.9);
}
.hero-advice {
  position: relative;
  display: flex;
  align-items: flex-start;
  margin-top: 24rpx;
  padding: 20rpx 24rpx;
  border-radius: 18rpx;
  background: rgba(255,255,255,.16);
}
.advice-icon { width: 30rpx; height: 30rpx; margin-right: 10rpx; flex-shrink: 0; opacity: .95; }
.advice-text { flex: 1; font-size: 25rpx; line-height: 1.6; color: #fff; }

/* 四宫格数据 */
.hero-metrics {
  position: relative;
  display: flex;
  margin-top: 32rpx;
  padding-top: 28rpx;
  border-top: 2rpx solid rgba(255,255,255,.22);
}
.metric { flex: 1; display: flex; flex-direction: column; align-items: center; }
.metric-num { font-size: 40rpx; font-weight: 800; color: #fff; line-height: 1.1; }
.metric-label { font-size: 22rpx; color: rgba(255,255,255,.8); margin-top: 8rpx; }

/* 底部操作 */
.hero-actions { position: relative; display: flex; gap: 20rpx; margin-top: 32rpx; }
.hero-btn-main {
  flex: 1;
  height: 92rpx;
  border-radius: 20rpx;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10rpx 26rpx rgba(0,0,0,.14);
}
.hero-btn-icon { width: 32rpx; height: 32rpx; margin-right: 10rpx; flex-shrink: 0; }
.hero-btn-text { font-size: 30rpx; font-weight: 700; color: #1F6E4C; }
.hero-btn-ghost {
  padding: 0 32rpx;
  height: 92rpx;
  border-radius: 20rpx;
  border: 2rpx solid rgba(255,255,255,.6);
  display: flex;
  align-items: center;
  justify-content: center;
}
.hero-btn-text-ghost { font-size: 28rpx; font-weight: 600; color: #fff; }
</style>
