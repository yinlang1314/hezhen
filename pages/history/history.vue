<template>
  <view class="page-wrap container">
    <NavBar title="历史记录" />

    <!-- 列表操作行：条数 + 清空 -->
    <view class="list-bar" v-if="historyList.length > 0">
      <text class="list-count">共 {{ historyList.length }} 条</text>
      <text class="clear-btn" @click="clearAllHistory">清空全部</text>
    </view>

    <!-- 历史记录列表 -->
    <view class="list-section" v-if="historyList.length > 0">
      <!-- 每条记录一张卡片 -->
      <view class="history-card card" v-for="(item, index) in historyList" :key="item.id" @click="goToDetail(item)">
        <image class="history-image" :src="getImage(item.image)" mode="aspectFill"></image>
        <view class="history-info">
          <view class="info-header">
            <text class="disease-name">{{ item.name }}</text>
            <view class="info-tags">
              <text class="tag confidence-tag">{{ item.confidence || 0 }}% 匹配</text>
              <text class="tag level-tag" :class="'level-' + (item.level || 2)">
                {{ item.levelText || '中度危害' }}
              </text>
            </view>
          </view>
          <text class="disease-type">{{ item.type || item.category }}</text>
          <text class="record-time">识别时间：{{ item.time }}</text>
        </view>
        <!-- 单条删除按钮 -->
        <view class="delete-btn" @click.stop="deleteHistory(index)">
          <image class="delete-icon" src="/static/icons/line-trash.png" mode="aspectFit" />
        </view>
      </view>

      <!-- 分页状态：放在 v-for【外面】，整页只显示一次 -->
      <view class="load-more">
        <text class="load-more-text" v-if="loadingMore">正在加载…</text>
        <text class="load-more-text" v-else-if="page < totalPages">上拉加载更多（已显示 {{ historyList.length }}/{{ total }} 条）</text>
        <text class="load-more-text dim" v-else>已显示全部 {{ historyList.length }} 条记录</text>
      </view>
    </view>

    <!-- 空状态 -->
    <view class="empty-state" v-else>
      <image class="empty-emoji" src="/static/icons/empty-history.png" mode="aspectFit" />
      <text class="empty-text">暂无识别记录</text>
      <button class="go-btn" @click="goToRecognize">去识别病虫害</button>
    </view>

    <!-- 底部导航栏 -->
    <TabBar current="history" />
  </view>
</template>

<script>
import { imageUrl, ensureBaseUrl } from '@/utils/config.js'
import { safeBack } from '@/utils/nav.js'
import TabBar from '@/components/TabBar.vue'
import NavBar from '@/components/NavBar.vue'
import { api } from '@/utils/api.js'

export default {
  components: { TabBar, NavBar },

  data() {
    return {
      page: 1,             // 当前页码
      totalPages: 1,       // 后端返回的总页数
      total: 0,            // 总条数
      loadingMore: false,  // 防止重复触发加载
      historyList: [],
      loading: false
    }
  },

  onShow() {
    
    // 游客未登录：这些数据属于个人，引导去登录
    if (!uni.getStorageSync('token')) {
      uni.showModal({
        title: '需要登录',
        content: '识别记录和收藏会保存在账号里，登录后即可查看。',
        confirmText: '去登录',
        cancelText: '返回',
        success: (r) => {
          if (r.confirm) uni.navigateTo({ url: '/pages/login/login?from=history' })
          else safeBack()
        }
      })
      return
    }
// 后端地址探测完成后重新渲染，保证图片地址正确
    uni.$on('apiBaseUrlChanged', () => { this.$forceUpdate() })
    ensureBaseUrl()

        this.loadHistory()
  },

  onReachBottom() {
    // 滚到底部自动加载下一页（以前没有，超过 50 条就永远看不到）
    this.loadHistory(true)
  },

  onPullDownRefresh() {
    this.loadHistory()
  },

  methods: {
    async loadHistory(append) {
      // append=true 表示「加载更多」：把新一页追加到已有列表后面
      if (append) {
        if (this.loadingMore) return
        if (this.page >= this.totalPages) return
        this.loadingMore = true
      } else {
        this.page = 1
      }

      const nextPage = append ? this.page + 1 : 1

      try {
        const res = await api.getHistoryList(nextPage, 50)
        const list = (res.data || []).map(item => ({
          id: item.id,
          name: item.disease_name,
          type: item.type || '',
          image: item.image_url,
          confidence: item.confidence,
          level: item.level || 2,
          levelText: item.level_text || '中度危害',
          time: item.create_time,
          symptom: item.symptom,
          spread: item.spread,
          occurrence: item.occurrence,
          plantName: item.plant_name || '',
          aiSource: item.ai_source || '',
          corrected: item.corrected === '1' || item.corrected === 1,
          collected: item.collected || '',
          medicines: item.medicines,
          suggestions: item.suggestions,
          prevention: item.prevention
        }))

        this.historyList = append ? this.historyList.concat(list) : list
        this.page = nextPage
        // 后端会一起返回分页信息，页面据此显示「已加载 x/y 条」并决定还能不能加载更多
        this.total = Number(res.total) || this.historyList.length
        this.totalPages = Number(res.totalPages) || 1
      } catch (e) {
        if (!append) {
          // 只在首次加载失败时回退本地缓存，避免「加载更多」失败把列表清空
          const local = uni.getStorageSync('historyList') || []
          this.historyList = local.map((x) => ({
            id: x.id,
            name: x.name || x.disease_name || '',
            type: x.type || '',
            image: x.image || x.image_url || '',
            confidence: x.confidence,
            level: x.level || 2,
            levelText: x.levelText || x.level_text || '中度危害',
            time: x.time || x.create_time,
            symptom: x.symptom || '',
            spread: x.spread || '',
            occurrence: x.occurrence || '',
            medicines: x.medicines || [],
            suggestions: x.suggestions || [],
            prevention: x.prevention || []
          }))
        } else {
          uni.showToast({ title: '加载失败，请稍后重试', icon: 'none' })
        }
      } finally {
        this.loadingMore = false
        uni.stopPullDownRefresh()
      }
    },

    // 只传 id：详情页会回后端取完整数据。
    // 以前是把整个对象 JSON 塞进 item 参数，URL 又长又容易在 H5 里解析失败（详情页显示"未知病虫害"）。
    goToDetail(item) {
      if (!item || !item.id) {
        uni.showToast({ title: '数据异常，请返回重试', icon: 'none' })
        return
      }
      // 历史记录的 id 和百科库的 id 是两套编号，必须区分开传：
      //   hid = 历史记录 id  -> 详情页去 /api/history/detail 取
      //   id  = 病害 id      -> 详情页去百科库取（历史记录里不一定有）
      uni.navigateTo({ url: '/pages/encyclopedia-detail/encyclopedia-detail?hid=' + encodeURIComponent(String(item.id)) })
    },

    async deleteHistory(index) {
      const item = this.historyList[index]
      uni.showModal({
        title: '提示',
        content: '确定要删除这条记录吗？',
        success: async (res) => {
          if (res.confirm) {
            // 尝试从后端删除
            try {
              if (item.id) await api.delHistory(item.id)
            } catch (e) { /* 忽略后端错误 */ }
            this.historyList.splice(index, 1)
            // 同步本地存储
            uni.setStorageSync('historyList', this.historyList)
            uni.showToast({ title: '删除成功', icon: 'success' })
          }
        }
      })
    },

    async clearAllHistory() {
      uni.showModal({
        title: '提示',
        content: '确定要清空所有历史记录吗？此操作不可恢复',
        success: async (res) => {
          if (res.confirm) {
            try { await api.clearHistory() } catch (e) { /* 忽略 */ }
            this.historyList = []
            uni.setStorageSync('historyList', [])
            uni.showToast({ title: '清空成功', icon: 'success' })
          }
        }
      })
    },

    goToRecognize() {
      uni.navigateTo({ url: '/pages/recognize/recognize' })
    },

    getImage(url) {
      if (!url) return '/static/default-disease.png'
      return imageUrl(url)
    }
  }
}
</script>

<style scoped>
.container {
  background-color: #F8FAFC;
  min-height: 100%;
  padding-bottom: 160rpx;
}

/* ========== 顶部导航栏 ========== */
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 128rpx;
  padding: 0 48rpx;
  background-color: #FFFFFF;
  box-shadow: 0 2px 16rpx rgba(0, 0, 0, 0.05);
  position: sticky;
  top: 0;
  z-index: 100;
}

.navbar-left {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.back-icon { font-size: 44rpx; margin-right: 24rpx; color: #333; }

.navbar-title {
  font-size: 36rpx;
  font-weight: 600;
  color: #333333;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.clear-btn {
  color: #e74c3c;
  font-size: 28rpx;
  cursor: pointer;
}

/* ========== 历史记录列表 ========== */
.list-section {
  padding: 48rpx;
}

.history-card {
  display: flex;
  align-items: center;
  padding: 32rpx;
  margin-bottom: 32rpx;
  transition: all 0.3s ease;
  cursor: pointer;
}

.history-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 16rpx 48rpx rgba(0, 0, 0, 0.08);
}

.history-image {
  width: 160rpx;
  height: 160rpx;
  border-radius: 16rpx;
  margin-right: 32rpx;
  flex-shrink: 0;
  object-fit: cover;
}

.history-info {
  flex: 1;
}

.info-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16rpx;
}

.disease-name {
  font-size: 34rpx;
  font-weight: 600;
  color: #333333;
}

.info-tags {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  align-items: flex-end;
}

.tag {
  padding: 2px 16rpx;
  border-radius: 24rpx;
  font-size: 22rpx;
  font-weight: 500;
}

.confidence-tag {
  background-color: #E8F8EF;
  color: #2ECC71;
}

.level-1 {
  background-color: #E3F2FD;
  color: #2196F3;
}

.level-2 {
  background-color: #FFF3E0;
  color: #FF9800;
}

.level-3 {
  background-color: #FFEBEE;
  color: #E74C3C;
}

.disease-type {
  font-size: 26rpx;
  color: #666666;
  margin-bottom: 8rpx;
  display: block;
}

.record-time {
  font-size: 24rpx;
  color: #999999;
}

.delete-btn {
  padding: 16rpx;
  cursor: pointer;
  flex-shrink: 0;
}

.delete-icon {
  font-size: 30rpx;
  line-height: 1;
}

/* ========== 空状态 ========== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 300rpx;
}

.empty-emoji { width: 120rpx; height: 120rpx; margin-bottom: 32rpx; opacity: 0.9; }
.empty-icon-old {
  width: 180rpx;
  height: 180rpx;
  opacity: 0.3;
  margin-bottom: 40rpx;
}

.empty-text {
  font-size: 28rpx;
  color: #999999;
  margin-bottom: 60rpx;
}

.go-btn {
  background-color: #2ECC71;
  color: #FFFFFF;
  border: none;
  border-radius: 40rpx;
  padding: 16rpx 50rpx;
  font-size: 28rpx;
  cursor: pointer;
  transition: all 0.3s ease;
}

.go-btn:hover {
  background-color: #27AE60;
  transform: translateY(-2px);
}

/* 卡片通用样式 */
.card {
  background-color: #FFFFFF;
  border-radius: 24rpx;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.05);
}

/* 说明：这里原来有个 @media (max-width: 1536rpx) 断点，把 .info-header 改成竖排。
   但 1536rpx = 768px，【手机宽度永远小于它】，所以这条规则在手机上一直生效，
   导致病害名和标签被挤成一列、文字逐字竖排。属于早期做电脑端适配留下的坑，已删除。
   卡片布局统一为：左图 + 右侧信息（名字一行、标签一行、时间一行）。 */

/* ==================== UI 重设计覆盖样式 ==================== */
.navbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 24rpx 32rpx !important;
  background: transparent !important;
  box-shadow: none !important;
  position: static !important;
}
.navbar-title {
  font-size: 34rpx !important;
  font-weight: 700 !important;
  color: var(--t-strong) !important;
  flex: 1;
  text-align: center;
}
.navbar-right { min-width: 120rpx; display: flex; justify-content: flex-end; }
.clear-btn {
  font-size: 25rpx !important;
  color: var(--c-danger) !important;
  padding: 10rpx 22rpx;
  background: #FEF2F2;
  border-radius: 999rpx;
}

.list-section { padding: 0 32rpx !important; }

/* 卡片统一风格 */
.history-card, .collection-card, .disease-card, .card {
  border-radius: var(--r-lg) !important;
  background: #fff !important;
  box-shadow: var(--sh-card) !important;
  border: none !important;
  overflow: hidden;
}
.history-card, .collection-card { margin-bottom: 22rpx !important; }
.history-card:active, .collection-card:active, .disease-card:active { transform: scale(0.985); }

.disease-name { font-size: 31rpx !important; font-weight: 700 !important; color: var(--t-strong) !important; }
.disease-type, .disease-desc { font-size: 23rpx !important; color: var(--t-sub) !important; }
.record-time, .collect-time { font-size: 22rpx !important; color: var(--t-faint) !important; }

.tag {
  border-radius: 999rpx !important;
  padding: 4rpx 16rpx !important;
  font-size: 21rpx !important;
  font-weight: 600 !important;
}
.confidence-tag { background: var(--c-primary-soft) !important; color: var(--c-primary-deep) !important; }
.level-1 { background: #DCFCE7 !important; color: #15803D !important; }
.level-2 { background: #FEF3C7 !important; color: #B45309 !important; }
.level-3 { background: #FEE2E2 !important; color: #B91C1C !important; }
.type-tag { background: #F1F5F9 !important; color: var(--t-sub) !important; }

.delete-btn {
  width: 68rpx; height: 68rpx; border-radius: 50%;
  background: #FEF2F2;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.delete-icon { width: 30rpx; height: 30rpx; }

/* 空状态 */
.empty-state {
  display: flex; flex-direction: column; align-items: center;
  padding: 140rpx 60rpx !important;
}
.empty-emoji { width: 120rpx; height: 120rpx; margin-bottom: 32rpx; opacity: 0.9; }
.empty-text, .empty-title {
  font-size: 30rpx !important; color: var(--t-sub) !important;
  font-weight: 600; margin-bottom: 12rpx;
}
.empty-desc { font-size: 24rpx !important; color: var(--t-faint) !important; }
.go-btn {
  margin-top: 36rpx !important;
  height: 88rpx !important;
  padding: 0 64rpx !important;
  border-radius: 999rpx !important;
  background: linear-gradient(135deg, #34D399, #059669) !important;
  color: #fff !important;
  font-size: 28rpx !important;
  font-weight: 600 !important;
  border: none !important;
  box-shadow: var(--sh-float) !important;
  line-height: 88rpx !important;
}

/* 列表操作行：条数在左、清空在右 */
.list-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8rpx 32rpx 20rpx;
}
.list-count { font-size: 25rpx; color: var(--t-sub); }

/* 分页状态提示 */
.load-more {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32rpx 0 48rpx;
}
.load-more-text { font-size: 24rpx; color: var(--t-sub); }
.load-more-text.dim { color: var(--t-faint); }
</style>