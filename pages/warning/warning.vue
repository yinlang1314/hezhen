<template>
  <view class="page-wrap container">
    <NavBar title="病虫害预警中心" />

    <scroll-view scroll-y class="scroll-container" refresher-enabled
      :refresher-triggered="isRefreshing" @refresherrefresh="onRefresh">
      <!-- 统计卡片 -->
      <view class="stats-section">
        <view class="stats-card card">
          <view class="stat-item">
            <text class="stat-number">{{ highCount }}</text>
            <text class="stat-label">高风险</text>
          </view>
          <view class="stat-divider"></view>
          <view class="stat-item">
            <text class="stat-number">{{ mediumCount }}</text>
            <text class="stat-label">中风险</text>
          </view>
          <view class="stat-divider"></view>
          <view class="stat-item">
            <text class="stat-number">{{ lowCount }}</text>
            <text class="stat-label">低风险</text>
          </view>
          <view class="stat-divider"></view>
          <view class="stat-item">
            <text class="stat-number">{{ totalCount }}</text>
            <text class="stat-label">全部预警</text>
          </view>
        </view>
      </view>

      <!-- 筛选 -->
      <view class="filter-section">
        <view class="filter-card card">
          <view class="filter-row">
            <text class="filter-label">地区：</text>
            <picker class="filter-picker" :value="regionIndex" :range="regions" @change="onRegionChange">
              <text class="picker-text">{{ regions[regionIndex] }}</text>
              <text class="chevron-icon">⌄</text>
            </picker>
          </view>
          <view class="filter-row">
            <text class="filter-label">等级：</text>
            <view class="level-buttons">
              <text class="level-btn" :class="{ active: selectedLevel === 'all' }" @click="selectedLevel = 'all'">全部</text>
              <text class="level-btn high" :class="{ active: selectedLevel === 'high' }" @click="selectedLevel = 'high'">高风险</text>
              <text class="level-btn medium" :class="{ active: selectedLevel === 'medium' }" @click="selectedLevel = 'medium'">中风险</text>
              <text class="level-btn low" :class="{ active: selectedLevel === 'low' }" @click="selectedLevel = 'low'">低风险</text>
            </view>
          </view>
        </view>
      </view>


      <!-- 本地风险预测（按真实天气算，选「全国」时隐藏） -->
      <view class="risk-card card">
        <view class="risk-head">
          <view>
            <text class="risk-title">本地风险预测</text>
            <text class="risk-sub">{{ regions[regionIndex] }} · 未来 3 天</text>
          </view>
          <text class="risk-refresh" @click="loadRisk">{{ riskLoading ? "计算中…" : "刷新" }}</text>
        </view>

        <view class="risk-hint" v-if="regionIndex === 0">
          <text>选择上方「地区」里的省份，就能看到当地未来 3 天的病害风险</text>
        </view>

        <view class="risk-loading" v-else-if="riskLoading">
          <text>正在结合天气计算…</text>
        </view>

        <view class="risk-error" v-else-if="riskError">
          <text>{{ riskError }}</text>
        </view>

        <view v-else>
          <view class="risk-day" v-for="(d, di) in riskDays" :key="d.date">
            <view class="risk-day-head">
              <text class="risk-date">{{ di === 0 ? "今天" : d.date.slice(5) }}</text>
              <text class="risk-weather">{{ d.tmean }}℃ · 湿度 {{ d.humidity }}% · 雨 {{ d.rain }}mm</text>
            </view>
            <view class="risk-items" v-if="d.items.length">
              <view class="risk-item" v-for="it in d.items" :key="it.name" :class="'lv' + it.level">
                <text class="risk-name">{{ it.name }}</text>
                <text class="risk-level">{{ it.levelText }}</text>
              </view>
            </view>
            <text class="risk-none" v-else>暂无达到阈值的病害</text>
          </view>
          <text class="risk-note">{{ riskDisclaimer }}</text>
        </view>
      </view>

      <!-- 列表 -->
      <view class="warning-list" v-if="filteredList.length > 0">
        <view class="warning-item card" v-for="item in filteredList" :key="item.id" @click="showDetail(item)">
          <view class="new-badge" v-if="item.isNew">最新</view>
          <view class="warning-level" :class="item.level">
            <text class="level-text">{{ item.levelText }}</text>
          </view>
          <view class="warning-info">
            <view class="info-header">
              <text class="warning-title">{{ item.title }}</text>
            </view>
            <view class="warning-location">
          <image class="loc-icon" src="/static/icons/line-pin.png" mode="aspectFit" />
          <text class="loc-text">{{ item.location }}</text>
        </view>
            <text class="warning-time">{{ item.time }}</text>
          </view>
          <text class="arrow-icon">›</text>
        </view>
      </view>

      <view class="empty-state" v-else>
        <image class="empty-emoji" src="/static/icons/empty-warning.png" mode="aspectFit" />
        <text class="empty-title">暂无预警信息</text>
        <text class="empty-desc">当前没有需要关注的病虫害预警，可稍后再看看</text>
        <button class="go-btn" @click="goToRecognize">去识别病虫害</button>
      </view>

      <view class="bottom-space"></view>
    </scroll-view>

    <!-- ============ 预警详情（自实现弹窗）============ -->
    <view class="mask" v-if="showPopup" @click="closeDetail" @touchmove.stop.prevent="noop"></view>
    <view class="sheet" v-if="showPopup && currentWarning"
      :style="{ top: capsuleTop + 'rpx' }">
      <!-- 顶部标题（右侧留出胶囊按钮的位置） -->
      <view class="sheet-head">
        <view class="sheet-head-left">
          <text class="sheet-head-title">预警详情</text>
          <text class="sheet-head-sub">第 {{ currentWarning.id }} 号预警</text>
        </view>
        <view class="close-btn" @click="closeDetail"><text class="close-icon">✕</text></view>
      </view>

      <scroll-view scroll-y class="sheet-body">
          <view class="sheet-inner">
        <!-- 1. 风险头图 -->
        <view class="hero" :class="currentWarning.level">
          <view class="hero-badge">
            <text class="hero-badge-text">{{ currentWarning.levelText }}</text>
          </view>
          <text class="hero-title">{{ currentWarning.title }}</text>
          <text class="hero-note">{{ levelAdvice }}</text>
        </view>

        <!-- 2. 核心信息 -->
        <view class="sec">
          <view class="sec-title"><text class="sec-bar"></text><text class="sec-text">预警信息</text></view>
          <view class="info-grid">
            <view class="info-cell">
              <text class="info-label">发生地区</text>
              <text class="info-value">{{ currentWarning.location }}</text>
            </view>
            <view class="info-cell">
              <text class="info-label">发布时间</text>
              <text class="info-value">{{ currentWarning.time }}</text>
            </view>
            <view class="info-cell wide">
              <text class="info-label">影响范围</text>
              <text class="info-value">{{ currentWarning.area || '暂无说明' }}</text>
            </view>
          </view>
        </view>

        <!-- 3. 病害档案（来自病害百科） -->
        <view class="sec" v-if="disease">
          <view class="sec-title">
            <text class="sec-bar"></text>
            <text class="sec-text">病害档案</text>
            <text class="sec-tag" v-if="disease.type">{{ disease.type }}</text>
          </view>

          <view class="kv" v-if="disease.host"><text class="kv-k">寄主</text><text class="kv-v">{{ disease.host }}</text></view>
          <view class="kv" v-if="disease.period"><text class="kv-k">高发期</text><text class="kv-v">{{ disease.period }}</text></view>
          <view class="kv" v-if="disease.levelText"><text class="kv-k">危害程度</text><text class="kv-v">{{ disease.levelText }}</text></view>

          <view class="block" v-if="shortText(disease.symptom)">
            <text class="block-label">典型症状</text>
            <text class="block-text">{{ shortText(disease.symptom) }}</text>
          </view>
          <view class="block" v-if="shortText(disease.cause)">
            <text class="block-label">发病原因</text>
            <text class="block-text">{{ shortText(disease.cause) }}</text>
          </view>
          <view class="block" v-if="shortText(disease.spread)">
            <text class="block-label">传播途径</text>
            <text class="block-text">{{ shortText(disease.spread) }}</text>
          </view>
        </view>

        <!-- 4. 防治方案 -->
        <view class="sec">
          <view class="sec-title"><text class="sec-bar"></text><text class="sec-text">防治方案</text></view>

          <view class="block accent" v-if="currentWarning.suggestion">
            <text class="block-label">官方建议</text>
            <text class="block-text">{{ currentWarning.suggestion }}</text>
          </view>

          <view class="block" v-if="disease && shortText(disease.suggestions)">
            <text class="block-label">综合防治</text>
            <text class="block-text">{{ shortText(disease.suggestions) }}</text>
          </view>

          <view class="block" v-if="disease && shortText(disease.prevention)">
            <text class="block-label">预防措施</text>
            <text class="block-text">{{ shortText(disease.prevention) }}</text>
          </view>
        </view>

        <!-- 5. 推荐药剂 -->
        <view class="sec" v-if="medicines.length">
          <view class="sec-title"><text class="sec-bar"></text><text class="sec-text">推荐药剂</text><text class="sec-count">{{ medicines.length }} 种</text></view>
          <view class="med" v-for="(m, i) in medicines" :key="i">
            <view class="med-head">
              <text class="med-name">{{ m.name }}</text>
              <text class="med-idx">{{ i + 1 }}</text>
            </view>
            <text class="med-use" v-if="m.usage">{{ m.usage }}</text>
          </view>
        </view>

        <!-- 没有关联病害时的说明 -->
        <view class="sec" v-if="!disease">
          <view class="block">
            <text class="block-label">说明</text>
            <text class="block-text">该预警暂未关联到病害库的详细档案。你可以拍照识别，让 AI 判断具体病害并给出防治方案。</text>
          </view>
        </view>

        <!-- 操作按钮 -->
        <view class="sheet-actions">
          <button class="act act-ghost" @click="goToEncyclopedia">查看百科</button>
          <button class="act act-main" @click="goToRecognize">拍照识别</button>
        </view>
        <view class="sheet-safe"></view>
                </view>
</scroll-view>
    </view>

    <TabBar current="warning" v-if="!showPopup" />
  </view>
</template>

<script>
import TabBar from '@/components/TabBar.vue'
import NavBar from '@/components/NavBar.vue'
import { getWinInfo } from '@/utils/wininfo.js'
import { api } from '@/utils/api.js'

export default {
  components: { TabBar, NavBar },

  data() {
    return {
      isRefreshing: false,
      regionIndex: 0,
      regions: ['全国', '江西省', '广东省', '湖南省', '福建省', '浙江省'],
      selectedLevel: 'all',
      warningList: [],
      currentWarning: null,
      showPopup: false,
      diseaseMap: {},     // 病害名 -> 病害档案，用于关联预警
      // 微信小程序右上角有「胶囊按钮」（三个点+圆圈），弹窗必须避开它
      capsuleTop: 26,     // 弹窗顶部的 rpx 值（会按胶囊实际位置覆盖）
      // 本地风险预测（按天气预报算）
      riskLoading: false,
      riskError: '',
      riskDays: [],
      riskDisclaimer: '',

    }
  },

  onLoad(query) {
    // 支持 /pages/warning/warning?region=江西省 直接定位
    if (query && query.region) {
      const idx = this.regions.indexOf(decodeURIComponent(query.region))
      if (idx > 0) this.regionIndex = idx
    }
  },

  onShow() {
    this.loadWarnings()
    this.loadDiseaseMap()
    this.measureCapsule()
    this.loadRisk()
  },

  computed: {
    filteredList() {
      return this.warningList.filter(item => {
        if (this.selectedLevel !== 'all' && item.level !== this.selectedLevel) return false
        if (this.regionIndex !== 0 && !item.location.includes(this.regions[this.regionIndex].slice(0, 2))) return false
        return true
      })
    },
    totalCount() { return this.filteredList.length },
    highCount() { return this.filteredList.filter(item => item.level === 'high').length },
    mediumCount() { return this.filteredList.filter(item => item.level === 'medium').length },
    lowCount() { return this.filteredList.filter(item => item.level === 'low').length },

    // 当前预警关联到的病害档案（三层匹配，尽量找到）
    disease() {
      const w = this.currentWarning
      if (!w) return null
      const title = String(w.title || '')
      const names = Object.keys(this.diseaseMap)
      const pickLongest = (arr) => arr.sort((a, b) => b.length - a.length)[0]

      // 1) 标题与病害名完全一致
      if (this.diseaseMap[title]) return this.diseaseMap[title]

      // 2) 标题里包含病害名（例：「柑橘溃疡病高发预警」含「柑橘溃疡病」）
      const inTitle = names.filter(n => n.length >= 3 && title.includes(n))
      if (inTitle.length) return this.diseaseMap[pickLongest(inTitle)]

      // 3) 去掉「预警/高发/迁飞/发生」等修饰词后再匹配
      //    （例：「番茄晚疫病预警」→「番茄晚疫病」）
      const clean = title.replace(/预警|高发|迁飞|发生|流行|警报|提示|紧急|注意/g, '').trim()
      if (this.diseaseMap[clean]) return this.diseaseMap[clean]
      const inClean = names.filter(n => clean.length >= 2 && n.includes(clean))
      if (inClean.length) return this.diseaseMap[pickLongest(inClean)]

      return null
    },

    // 推荐药剂（统一成数组）
    medicines() {
      const d = this.disease
      if (!d || !d.medicines) return []
      if (Array.isArray(d.medicines)) return d.medicines.slice(0, 6)
      // 后端可能是 JSON 字符串
      try {
        const arr = JSON.parse(d.medicines)
        return Array.isArray(arr) ? arr.slice(0, 6) : []
      } catch (e) {
        return String(d.medicines).split(/[;；\n]/).filter(Boolean).slice(0, 6).map(t => ({ name: t, usage: '' }))
      }
    },

    // 按风险等级给一句行动建议
    levelAdvice() {
      const m = {
        high: '高风险预警：请立即采取防治措施，并密切观察周边地块',
        medium: '中风险预警：建议提前预防，加强田间巡查',
        low: '低风险预警：保持关注，做好日常管理即可'
      }
      return m[(this.currentWarning || {}).level] || '请关注该预警信息'
    }
  },

  methods: {
    // 本地风险：按所选省份的天气算
    async loadRisk() {
      if (this.regionIndex === 0) { this.riskDays = []; this.riskError = ''; return }
      const region = this.regions[this.regionIndex]
      this.riskLoading = true
      this.riskError = ''
      try {
        const res = await api.getWarningRisk(region)
        if (res && res.code === 200) {
          this.riskDays = (res.data.days || []).map(d => ({ ...d, items: d.items || [] }))
          this.riskDisclaimer = res.data.disclaimer || ''
        } else {
          this.riskError = (res && res.message) || '暂时算不出风险'
          this.riskDays = []
        }
      } catch (e) {
        this.riskError = '网络异常，点「刷新」重试'
        this.riskDays = []
      } finally {
        this.riskLoading = false
      }
    },

    // 测量微信胶囊按钮位置：弹窗顶部要落在它下面，右上角也要避开
    // （H5 / App 没有胶囊，保持默认值即可）
    measureCapsule() {
        try {
          // #ifdef MP-WEIXIN
          const rect = uni.getMenuButtonBoundingClientRect && uni.getMenuButtonBoundingClientRect()
          if (rect && rect.bottom) {
            const info = getWinInfo()
            const rpx = 750 / (info.windowWidth || 375)
            // 弹窗定位在【胶囊下方 + 8rpx】，本来就不会和胶囊重叠，
            // 所以不需要给头部留右边的空位。以前算了个 capsuleRight 当 padding-right，
            // 结果把标题和关闭按钮整体挤到了左边。
            this.capsuleTop = Math.max(Math.round((rect.bottom + 8) * rpx), 120)
          }
          // #endif
        } catch (e) {
          console.warn('测量胶囊按钮失败，使用默认位置:', e && e.message)
        }
      },

    async loadWarnings() {
      try {
        const res = await api.getWarningList()
        this.warningList = (res.data || []).map(item => ({
          id: item.id,
          title: item.title,
          level: item.level,
          levelText: item.level_text,
          location: item.location,
          time: item.create_time,
          area: item.area,
          suggestion: item.suggestion,
          isNew: item.is_new === 1
        }))
      } catch (e) {
        console.error('加载预警失败:', e)
      }
    },

    // 拉取病害库，供详情面板关联展示
    async loadDiseaseMap() {
      try {
        const res = await api.getDiseaseList({ page: 1, pageSize: 200 })
        const list = (res && res.data && res.data.list) || []
        const map = {}
        list.forEach(d => { if (d && d.name) map[d.name] = d })
        this.diseaseMap = map
      } catch (e) {
        console.warn('加载病害库失败（详情将只显示预警本身的信息）:', e && e.message)
      }
    },

    // 长文本截断，避免详情面板被超长症状说明淹没
    shortText(t, max = 260) {
      const s = String(t == null ? '' : t).trim()
      if (!s) return ''
      // 去掉 AI 自动生成的鉴别诊断等冗长段落
      const cut = s.split('【鉴别诊断】')[0].split('【图像证据】')[0].trim()
      return cut.length > max ? cut.slice(0, max) + '…' : cut
    },

    onRegionChange(e) {
      this.regionIndex = Number(e.detail.value)
      this.loadRisk()          // 换地区要重算本地风险
    },

    async onRefresh() {
      this.isRefreshing = true
      await this.loadWarnings()
      this.isRefreshing = false
    },

    showDetail(item) {
      this.currentWarning = item
      this.showPopup = true
    },
    closeDetail() { this.showPopup = false },
    noop() {},

    goToRecognize() {
      this.closeDetail()
      uni.navigateTo({ url: '/pages/recognize/recognize' })
    },

    goToEncyclopedia() {
      const w = this.currentWarning
      const d = this.disease
      this.closeDetail()
      if (d && d.id) {
        uni.navigateTo({ url: '/pages/encyclopedia-detail/encyclopedia-detail?id=' + d.id })
      } else {
        uni.navigateTo({ url: '/pages/encyclopedia/encyclopedia?keyword=' + encodeURIComponent((w && w.title || '').replace(/预警|高发|迁飞/g, '')) })
      }
    }
  }
}
</script>

<style scoped>

/* ===== 本地风险预测 ===== */
.risk-card {
  margin-bottom: 24rpx;
  padding: 28rpx 28rpx 22rpx;
}
.risk-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20rpx;
}
.risk-title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: #0F172A;
}
.risk-sub {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #94A3B8;
}
.risk-refresh {
  font-size: 23rpx;
  color: #0f766e;
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
  background: #f0fdfa;
}
.risk-hint {
  padding: 26rpx 0;
  font-size: 23rpx;
  color: #64748B;
  line-height: 1.6;
  text-align: center;
}
.risk-loading, .risk-error {
  padding: 24rpx 0;
  text-align: center;
  font-size: 24rpx;
  color: #64748B;
}
.risk-error { color: #B45309; }
.risk-day {
  padding: 16rpx 0;
  border-top: 1px solid #F1F5F9;
}
.risk-day:first-child { border-top: none; }
.risk-day-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12rpx;
}
.risk-date {
  font-size: 26rpx;
  font-weight: 600;
  color: #334155;
}
.risk-weather {
  font-size: 21rpx;
  color: #94A3B8;
}
.risk-items {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.risk-item {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 8rpx 16rpx;
  border-radius: 22rpx;
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
}
.risk-name { font-size: 23rpx; color: #334155; }
.risk-level { font-size: 21rpx; font-weight: 600; }
.risk-item.lv3 { background: #FEF2F2; border-color: #FECACA; }
.risk-item.lv3 .risk-level { color: #b91c1c; }
.risk-item.lv2 { background: #FFFBEB; border-color: #FDE68A; }
.risk-item.lv2 .risk-level { color: #B45309; }
.risk-item.lv1 { background: #F0FDF4; border-color: #BBF7D0; }
.risk-item.lv1 .risk-level { color: #0f766e; }
.risk-none {
  font-size: 22rpx;
  color: #CBD5E1;
}
.risk-note {
  display: block;
  margin-top: 18rpx;
  padding-top: 16rpx;
  border-top: 1px dashed #E2E8F0;
  font-size: 20rpx;
  color: #94A3B8;
  line-height: 1.6;
}
.container { background-color: #F8FAFC; min-height: 100%; display: flex; flex-direction: column; padding-bottom: 160rpx; }
.scroll-container { flex: 1; height: 0; min-height: 0; }

/* 导航栏 */
.navbar { display: flex; align-items: center; justify-content: space-between; height: 128rpx; padding: 0 48rpx; background-color: #FFFFFF; box-shadow: 0 2px 16rpx rgba(0,0,0,0.05); position: sticky; top: 0; z-index: 100; }
.navbar-left { display: flex; align-items: center; }
.navbar-title { font-size: 36rpx; font-weight: 600; color: #333; position: absolute; left: 50%; transform: translateX(-50%); }
.navbar-right { width: 48rpx; }
.chevron-icon { font-size: 28rpx; color: #94A3B8; }
.arrow-icon { font-size: 40rpx; color: #CBD5E1; margin-left: 16rpx; }

/* 统计 */
.stats-section { padding: 32rpx 48rpx; }
.stats-card { display: flex; justify-content: space-around; padding: 40rpx 32rpx; }
.stat-item { display: flex; flex-direction: column; align-items: center; }
.stat-number { font-size: 48rpx; font-weight: 700; color: #0f766e; margin-bottom: 8rpx; }
.stat-label { font-size: 24rpx; color: #666; }
.stat-divider { width: 2rpx; height: 80rpx; background-color: #F0F0F0; }

/* 筛选 */
.filter-section { padding: 0 48rpx 32rpx; }
.filter-card { padding: 40rpx; }
.filter-row { display: flex; align-items: center; margin-bottom: 32rpx; }
.filter-row:last-child { margin-bottom: 0; }
.filter-label { width: 100rpx; font-size: 28rpx; color: #666; flex-shrink: 0; }
.filter-picker { flex: 1; display: flex; align-items: center; justify-content: space-between; padding: 16rpx 24rpx; background: #F8FAFC; border-radius: 16rpx; }
.picker-text { font-size: 28rpx; color: #333; }
.level-buttons { display: flex; gap: 16rpx; flex-wrap: wrap; }
.level-btn { padding: 12rpx 24rpx; border-radius: 32rpx; font-size: 26rpx; color: #666; background: #F0F0F0; }
.level-btn.active { background: #0f766e; color: #fff; }
.level-btn.high.active { background: #b91c1c; }
.level-btn.medium.active { background: #F39C12; }
.level-btn.low.active { background: #F1C40F; }

/* 列表 */
.warning-list { padding: 0 48rpx; display: flex; flex-direction: column; gap: 32rpx; }
.warning-item { display: flex; align-items: center; padding: 32rpx; position: relative; }
.new-badge { position: absolute; top: 16rpx; right: 16rpx; padding: 4rpx 16rpx; background: #b91c1c; color: #fff; font-size: 20rpx; border-radius: 16rpx; }
.warning-level { width: 120rpx; height: 120rpx; border-radius: 24rpx; display: flex; align-items: center; justify-content: center; margin-right: 32rpx; flex-shrink: 0; }
.warning-level.high { background: #FEE2E2; }
.warning-level.medium { background: #FEF3E2; }
.warning-level.low { background: #FEF9E7; }
.level-text { font-size: 26rpx; font-weight: 600; }
.high .level-text { color: #b91c1c; }
.medium .level-text { color: #F39C12; }
.low .level-text { color: #F1C40F; }
.warning-info { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
.warning-title { font-size: 32rpx; font-weight: 600; color: #333; }
.warning-location { display: flex; align-items: center; font-size: 26rpx; color: #666; }
.loc-icon { width: 26rpx; height: 26rpx; margin-right: 8rpx; flex-shrink: 0; }
.warning-time { font-size: 24rpx; color: #999; }

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 340rpx);
  padding: 0 60rpx 120rpx;
}
.empty-emoji { width: 144rpx; height: 144rpx; margin-bottom: 48rpx; opacity: 0.9; }
.empty-title { font-size: 36rpx; font-weight: 600; color: #333; margin-bottom: 16rpx; }
.empty-desc { font-size: 28rpx; color: #999; margin-bottom: 60rpx; }
.go-btn {
  margin-top: 44rpx;
  height: 92rpx;
  line-height: 92rpx;
  padding: 0 64rpx;
  background: linear-gradient(135deg, #14b8a6, #0f766e);
  color: #FFFFFF;
  border: none;
  border-radius: 46rpx;
  font-size: 28rpx;
  font-weight: 600;
  letter-spacing: 1rpx;
  box-shadow: 0 12rpx 32rpx rgba(15, 118, 110, 0.25);
  cursor: pointer;
  transition: all 0.2s ease;
}
.go-btn:active { transform: translateY(2rpx); box-shadow: 0 6rpx 16rpx rgba(15, 118, 110, 0.22); }
.bottom-space { height: 200rpx; }

/* ============ 详情弹窗 ============ */
.mask { position: fixed; left: 0; right: 0; top: 0; bottom: 0; background: rgba(15, 23, 42, 0.55); z-index: 10000; }
.sheet {
  position: fixed;
  left: 0;
  right: 0;
  top: 120rpx;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background: #F8FAFC;
  border-top-left-radius: 40rpx;
  border-top-right-radius: 40rpx;
  z-index: 10001;
  overflow: hidden;
  animation: sheetUp 0.22s ease-out;
  box-sizing: border-box;
  width: 100%;
}
@keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 36rpx 40rpx;
  background: #FFFFFF;
  border-bottom: 2rpx solid #F1F5F9;
  flex-shrink: 0;
  box-sizing: border-box;
  width: 100%;
}
.sheet-head-left { display: flex; flex-direction: column; }
.sheet-head-title { font-size: 36rpx; font-weight: 700; color: #0F172A; }
.sheet-head-sub { font-size: 22rpx; color: #94A3B8; margin-top: 4rpx; }
.close-btn { width: 60rpx; height: 60rpx; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #F1F5F9; }
.close-icon { font-size: 30rpx; color: #64748B; }

.sheet-body {
  flex: 1;
  min-height: 0;
  /* 注意：padding 不能加在 scroll-view 上。
     小程序的 scroll-view 会把 padding 加在外层滚动容器上，
     内层内容区仍是满宽，结果内容看起来整体偏右（浏览器没这个问题）。
     所以 padding 放到里面的 .sheet-inner 上。 */
}
.sheet-inner {
  padding: 32rpx 40rpx;
  box-sizing: border-box;
  width: 100%;
}

/* 风险头图 */
.hero { border-radius: 28rpx; padding: 48rpx 40rpx; margin-bottom: 28rpx; display: flex; flex-direction: column; align-items: center; }
.hero.high { background: linear-gradient(135deg, #FEF2F2, #FEE2E2); }
.hero.medium { background: linear-gradient(135deg, #FFFBEB, #FEF3E2); }
.hero.low { background: linear-gradient(135deg, #FEFCE8, #FEF9E7); }
.hero-badge { padding: 8rpx 28rpx; border-radius: 99rpx; margin-bottom: 20rpx; background: rgba(255,255,255,0.9); }
.hero-badge-text { font-size: 26rpx; font-weight: 700; }
.hero.high .hero-badge-text { color: #b91c1c; }
.hero.medium .hero-badge-text { color: #D97706; }
.hero.low .hero-badge-text { color: #CA8A04; }
.hero-title { font-size: 42rpx; font-weight: 800; color: #0F172A; text-align: center; line-height: 1.35; }
.hero-note { font-size: 26rpx; color: #475569; margin-top: 16rpx; text-align: center; line-height: 1.6; }

/* 区块 */
.sec { background: #FFFFFF; border-radius: 28rpx; padding: 36rpx 32rpx; margin-bottom: 28rpx; }
.sec-title { display: flex; align-items: center; margin-bottom: 28rpx; }
.sec-bar { width: 8rpx; height: 32rpx; border-radius: 4rpx; background: #0f766e; margin-right: 16rpx; }
.sec-text { font-size: 32rpx; font-weight: 700; color: #0F172A; }
.sec-tag { margin-left: 16rpx; padding: 4rpx 16rpx; border-radius: 99rpx; background: #ccfbf1; color: #115e59; font-size: 22rpx; font-weight: 600; }
.sec-count { margin-left: auto; font-size: 24rpx; color: #94A3B8; }

/* 信息格 */
.info-grid { display: flex; flex-wrap: wrap; gap: 20rpx; }
.info-cell { width: calc(50% - 10rpx); background: #F8FAFC; border-radius: 20rpx; padding: 24rpx; }
.info-cell.wide { width: 100%; }
.info-label { display: block; font-size: 22rpx; color: #94A3B8; margin-bottom: 8rpx; }
.info-value { font-size: 27rpx; color: #1E293B; font-weight: 600; line-height: 1.5; }

/* 键值行 */
.kv { display: flex; padding: 16rpx 0; border-bottom: 2rpx solid #F8FAFC; }
.kv:last-of-type { border-bottom: none; }
.kv-k { width: 140rpx; font-size: 26rpx; color: #94A3B8; flex-shrink: 0; }
.kv-v { flex: 1; font-size: 27rpx; color: #1E293B; font-weight: 600; line-height: 1.6; }

/* 文本块 */
.block { background: #F8FAFC; border-radius: 20rpx; padding: 28rpx; margin-bottom: 20rpx; }
.block:last-child { margin-bottom: 0; }
.block.accent { background: #f0fdfa; border-left: 8rpx solid #0f766e; }
.block-label { display: block; font-size: 24rpx; color: #64748B; font-weight: 700; margin-bottom: 12rpx; }
.block-text { font-size: 27rpx; color: #334155; line-height: 1.8; }

/* 药剂 */
.med { border: 2rpx solid #E2E8F0; border-radius: 20rpx; padding: 24rpx 28rpx; margin-bottom: 20rpx; }
.med:last-child { margin-bottom: 0; }
.med-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10rpx; }
.med-name { font-size: 30rpx; font-weight: 700; color: #0F172A; }
.med-idx { width: 40rpx; height: 40rpx; border-radius: 50%; background: #ccfbf1; color: #115e59; font-size: 22rpx; font-weight: 700; text-align: center; line-height: 40rpx; }
.med-use { font-size: 25rpx; color: #64748B; line-height: 1.7; }

/* 底部操作 */
.sheet-actions { display: flex; gap: 24rpx; padding: 8rpx 0 24rpx; }
.act { flex: 1; height: 92rpx; border-radius: 20rpx; font-size: 30rpx; font-weight: 600; border: none; line-height: 92rpx; }
.act-ghost { background: #FFFFFF; color: #334155; border: 2rpx solid #E2E8F0; }
.act-main { background: linear-gradient(135deg, #14b8a6, #0f766e); color: #FFFFFF; }
.sheet-safe { height: calc(48rpx + env(safe-area-inset-bottom)); }
</style>
