<template>
  <view class="page-wrap container">
    <NavBar title="我的收藏" />

    <!-- 列表操作行：条数 + 清空 -->
    <view class="list-bar" v-if="collectionList.length > 0">
      <text class="list-count">共 {{ collectionList.length }} 条</text>
      <text class="clear-btn" @click="clearAllCollection">清空全部</text>
    </view>

    <!-- 收藏列表 -->
    <view class="list-section" v-if="collectionList.length > 0">
      <view class="collection-card card" v-for="(item, index) in collectionList" :key="item.id || index" @click="goToDetail(item)">
        <image class="collection-image" :src="getImage(item.image)" mode="aspectFill"></image>
        <view class="collection-info">
          <text class="disease-name">{{ item.name }}</text>
          <text class="disease-type">{{ item.type }}</text>
          <text class="collect-time">收藏时间：{{ item.collectTime }}</text>
        </view>
        <!-- 取消收藏按钮 -->
        <view class="delete-btn" @click.stop="deleteCollection(index)">
          <image class="delete-icon" src="/static/icons/line-trash.png" mode="aspectFit" />
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view class="empty-state" v-else>
      <image class="empty-emoji" src="/static/icons/empty-collect.png" mode="aspectFit" />
      <text class="empty-text">暂无收藏内容</text>
      <text class="empty-hint">在百科详情页点右下角收藏，就会出现在这里</text>
      <button class="go-btn" @click="goToEncyclopedia">去浏览百科</button>
    </view>

    <AppDialog
      :visible="showLoginTip"
      title="需要登录"
      content="识别记录和收藏会保存在你的账号里，登录后即可查看。"
      confirm-text="去登录"
      cancel-text="暂时不看"
      icon="lock"
      @confirm="onLoginConfirm"
      @cancel="onLoginCancel"
    />

    <!-- 取消收藏 / 清空的确认弹窗 -->
    <AppDialog
      :visible="showConfirm"
      :title="confirmTitle"
      :content="confirmContent"
      :confirm-text="confirmText"
      cancel-text="取消"
      icon="delete"
      :danger="true"
      @confirm="onConfirmOk"
      @cancel="onConfirmCancel"
    />

    <TabBar current="" />
  </view>
</template>

<script>
import { imageUrl } from '@/utils/config.js'
import { safeBack } from '@/utils/nav.js'
import TabBar from '@/components/TabBar.vue'
import NavBar from '@/components/NavBar.vue'
import AppDialog from '@/components/AppDialog.vue'
import { api } from '@/utils/api.js'

export default {
  components: { TabBar, NavBar, AppDialog },
  data() {
    return {
      collectionList: [],
      showLoginTip: false,
      showConfirm: false,
      confirmTitle: '确认操作',
      confirmContent: '',
      confirmText: '确定',
      confirmAction: null
    }
  },

  onShow() {
    
    // 游客未登录：这些数据属于个人，引导去登录
    if (!uni.getStorageSync('token')) {
      this.showLoginTip = true
      return
    }
    this.loadCollections()
  },

  methods: {
    // 统一确认弹窗
    askConfirm(content, confirmText, action) {
      this.confirmContent = content
      this.confirmText = confirmText || '确定'
      this.confirmAction = action
      this.showConfirm = true
    },
    onConfirmOk() {
      this.showConfirm = false
      const fn = this.confirmAction
      this.confirmAction = null
      if (typeof fn === 'function') fn()
    },
    onConfirmCancel() {
      this.showConfirm = false
      this.confirmAction = null
    },

    // 未登录时的自定义弹窗
    onLoginConfirm() {
      this.showLoginTip = false
      uni.navigateTo({ url: '/pages/login/login?from=collection' })
    },
    onLoginCancel() {
      this.showLoginTip = false
      try { safeBack() } catch (e) {
        uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/index/index' }) })
      }
    },
    async loadCollections() {
      try {
        const res = await api.getCollectList()
        this.collectionList = (res.data || []).map(item => ({
          id: item.id,
          disease_id: item.disease_id,
          name: item.name,
          type: item.type,
          image: item.image,
          collectTime: item.create_time
        }))
      } catch (e) {
        // fallback 本地数据
        this.collectionList = uni.getStorageSync('collectionList') || []
      }
    },

    // 后端返回的是 /uploads/xxx.jpg 相对地址，要拼上当前后端地址；静态图保持原样
    getImage(url) {
      const u = String(url || '').trim()
      if (!u) return '/static/default-disease.png'
      if (u.charAt(0) !== '/') return u
      // 相对路径统一交给 imageUrl 拼后端地址（/uploads/、/images/seed/ 都要处理）
      return imageUrl(u)
    },

    // 只传 id：详情页会回后端取完整数据。
    // 以前是把整个对象 JSON 塞进 item 参数，URL 又长又容易在 H5 里解析失败（详情页显示"未知病虫害"）。
    goToDetail(item) {
      const id = item && (item.disease_id || item.id)
      if (!id) {
        uni.showToast({ title: '数据异常，请返回重试', icon: 'none' })
        return
      }
      uni.navigateTo({ url: '/pages/encyclopedia-detail/encyclopedia-detail?id=' + encodeURIComponent(String(id)) })
    },

    async deleteCollection(index) {
      const item = this.collectionList[index]
      this.askConfirm('确定要取消收藏这条记录吗？', '取消收藏', async () => {
          try {
            if (item.id) await api.delCollect(item.id)
          } catch (e) {
            // 失败就不要动列表，否则下次刷新会"复活"
            return uni.showToast({ title: (e && e.message) || '取消失败，请重试', icon: 'none' })
          }
          this.collectionList.splice(index, 1)
          uni.setStorageSync('collectionList', this.collectionList)
          uni.showToast({ title: '已取消收藏', icon: 'success' })
        })
    },

    async clearAllCollection() {
      this.askConfirm('确定要清空所有收藏吗？此操作不可恢复', '清空', async () => {
          try {
            await api.clearCollect()   // 一条 SQL 清空，避免逐条请求半途失败
          } catch (e) {
            return uni.showToast({ title: (e && e.message) || '清空失败，请重试', icon: 'none' })
          }
          this.collectionList = []
          uni.setStorageSync('collectionList', [])
          uni.showToast({ title: '清空成功', icon: 'success' })
        })
    },

    goToEncyclopedia() {
      uni.navigateTo({ url: '/pages/encyclopedia/encyclopedia' })
    }
  }
}
</script>

<style scoped>
.container {
  background-color: #F8FAFC;
  min-height: 100vh;
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

/* ========== 收藏列表 ========== */
.list-section {
  padding: 48rpx;
}

.collection-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  padding: 32rpx;
  margin-bottom: 32rpx;
  transition: all 0.3s ease;
  cursor: pointer;
}

.collection-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 16rpx 48rpx rgba(0, 0, 0, 0.08);
}

.collection-image {
  width: 160rpx;
  height: 160rpx;
  border-radius: 16rpx;
  margin-right: 32rpx;
  flex-shrink: 0;
}

.collection-info {
  flex: 1;
  min-width: 0;
  padding-right: 56rpx; /* 给右上角删除按钮留位 */
}

.disease-name {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  font-size: 32rpx;
  line-height: 1.42;
  font-weight: 600;
  color: #1E293B;
  margin-bottom: 12rpx;
  word-break: break-word;
}

.disease-type {
  display: block;
  font-size: 25rpx;
  color: #64748B;
  margin-bottom: 8rpx;
}

.collect-time {
  display: block;
  font-size: 23rpx;
  color: #94A3B8;
}

.delete-btn {
  position: absolute;
  top: 16rpx;
  right: 16rpx;
  width: 68rpx;
  height: 68rpx;
  border-radius: 50%;
  background: #FEF2F2;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  line-height: 0;
}
.delete-btn:active { background: #FEE2E2; }
.delete-icon { width: 34rpx; height: 34rpx; opacity: 0.55; }
.delete-btn:active .delete-icon { opacity: 0.9; }


/* ========== 空状态 ========== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 320rpx);
  padding: 0 60rpx 120rpx;
}
.empty-hint {
  font-size: 24rpx;
  color: #94A3B8;
  margin-top: 10rpx;
  letter-spacing: 0.5rpx;
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
  margin-top: 44rpx;
  height: 92rpx;
  line-height: 92rpx;
  padding: 0 64rpx;
  background: linear-gradient(135deg, #34D399, #059669);
  color: #FFFFFF;
  border: none;
  border-radius: 46rpx;
  font-size: 28rpx;
  font-weight: 600;
  letter-spacing: 1rpx;
  box-shadow: 0 12rpx 32rpx rgba(5, 150, 105, 0.25);
  cursor: pointer;
  transition: all 0.2s ease;
}
.go-btn:active { transform: translateY(2rpx); box-shadow: 0 6rpx 16rpx rgba(5, 150, 105, 0.22); }

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

/* 说明：这里原来有个 @media (max-width: 1536rpx) 断点，会把卡片内部改成竖排。
   但 1536rpx = 768px，【手机宽度永远小于它】，所以那条规则在手机上一直生效，
   导致文字被挤成竖列。属于早期做电脑端适配留下的坑，已删除。 */

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
</style>