<template>
  <view class="page-wrap container">
    <NavBar title="知识百科" />

    <view class="search-section">
      <view class="search-box">
        <image class="search-icon" src="/static/icons/line-search.png" mode="aspectFit" />
        <input 
          class="search-input" 
          v-model="searchKeyword" 
          placeholder="搜索病虫害名称"
          @input="onSearchInput"
        />
      </view>
    </view>

    <view class="category-section">
      <scroll-view scroll-x class="category-scroll" show-scrollbar="false">
        <view class="category-list">
          <view 
            class="category-item" 
            :class="activeCategory === item.id ? 'active' : ''"
            v-for="item in categoryList" 
            :key="item.id"
            @click="changeCategory(item.id)"
          >
            {{ item.name }}
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 加载中 -->
    <view class="loading-state" v-if="loading">
      <view class="skeleton-card" v-for="i in 3" :key="i">
        <view class="skeleton-img"></view>
        <view class="skeleton-info">
          <view class="skeleton-line w60"></view>
          <view class="skeleton-line w40"></view>
          <view class="skeleton-line w80"></view>
        </view>
      </view>
    </view>

    <!-- 列表 -->
    <view class="list-section" v-else-if="filteredList.length > 0">
      <view class="disease-card card" v-for="item in filteredList" :key="item.id" @click="goToDetail(item)">
        <view class="disease-img-wrap">
          <image class="disease-image" v-if="item.image" :src="getImage(item)" mode="aspectFill"></image>
          <view class="disease-image img-placeholder" v-else>
            <image class="ph-emoji" src="/static/icons/line-leaf.png" mode="aspectFit" />
          </view>
          <view class="level-badge" :class="'lv' + (item.level || 2)">{{ item.level_text || '常规' }}</view>
        </view>
        <view class="disease-info">
          <text class="disease-name">{{ item.name }}</text>
          <text class="tag type-tag">{{ item.type || item.category || '未分类' }}</text>
          <text class="disease-desc">{{ (item.symptom || '').substring(0, 40) || '暂无描述' }}...</text>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view class="empty-state" v-else>
      <image class="empty-emoji" src="/static/icons/empty-book.png" mode="aspectFit" />
      <text class="empty-title">{{ searchKeyword ? '未找到相关病虫害' : '暂无病虫害数据' }}</text>
      <text class="empty-desc">{{ searchKeyword ? '换个关键词试试' : '数据库正在建设中' }}</text>
    </view>

    <TabBar current="encyclopedia" />
  </view>
</template>

<script>
import { imageUrl, ensureBaseUrl } from '@/utils/config.js'
import TabBar from '@/components/TabBar.vue'
import NavBar from '@/components/NavBar.vue'
import { api } from '@/utils/api.js'

export default {
  components: { TabBar, NavBar },
  data() {
    return {
      searchKeyword: '',
      categoryList: [
        { id: 0, name: '全部' },
        { id: 1, name: '细菌性病害' },
        { id: 2, name: '真菌性病害' },
        { id: 3, name: '病毒性病害' },
        { id: 4, name: '虫害' },
        { id: 5, name: 'AI 收录' }
      ],
      activeCategory: 0,
      diseaseList: [],
      page: 1,
      pageSize: 50,
      total: 0,
      loadingMore: false,
      searchTimer: null,
      filteredList: [],
      loading: false
    }
  },

  onShow() {
        this.getDiseaseData()
  },
  onUnload() {
    // 页面销毁时解绑全局事件，否则每进一次页面就多挂一个监听（内存泄漏）
    uni.$off('apiBaseUrlChanged')
  },

  onPullDownRefresh() {
    this.getDiseaseData()
  },

  onLoad() {
uni.$on('apiBaseUrlChanged', () => { this.$forceUpdate() })
    ensureBaseUrl()
  },

  methods: {
    // 输入防抖：不要每敲一个字就打一次接口
    onSearchInput() {
      if (this.searchTimer) clearTimeout(this.searchTimer)
      this.searchTimer = setTimeout(() => this.getDiseaseData(true), 400)
    },

    // reset=true 表示重新从头查（换关键词、下拉刷新）
    async getDiseaseData(reset) {
      const isReset = reset === true
      if (isReset) { this.page = 1; this.loading = true } else if (this.loadingMore) return
      try {
        const res = await api.getDiseaseList({
          page: this.page,
          pageSize: this.pageSize,
          keyword: this.searchKeyword.trim()     // 服务端搜索，不再只搜已加载的 50 条
        })
        const list = Array.isArray(res.data) ? res.data : (res.data?.list || [])
        this.total = (res.data && res.data.total) || list.length
        this.diseaseList = isReset ? list : this.diseaseList.concat(list)
      } catch (e) {
        console.error('请求失败:', e)
        uni.showToast({ title: '网络异常，请重试', icon: 'none' })
      } finally {
        this.loading = false
        this.loadingMore = false
        uni.stopPullDownRefresh()
        this.filterDisease()
      }
    },

    onReachBottom() {
      // 还有更多就加载下一页
      if (this.diseaseList.length >= this.total) return
      this.loadingMore = true
      this.page += 1
      this.getDiseaseData(false)
    },

    changeCategory(id) {
      this.activeCategory = id
      this.filterDisease()
    },

    filterDisease() {
      let list = [...this.diseaseList]
      const keyword = this.searchKeyword.trim().toLowerCase()

      if (this.activeCategory === 5) {
        list = list.filter(item => String(item.category || '').indexOf('AI') === 0)
      } else if (this.activeCategory !== 0) {
        const categoryMap = {
          1: '细菌性病害',
          2: '真菌性病害',
          3: '病毒性病害',
          4: '虫害'
        }
        list = list.filter(item => item.category === categoryMap[this.activeCategory])
      }

      if (keyword) {
        list = list.filter(item => {
          return (item.name && item.name.toLowerCase().includes(keyword)) ||
                 (item.symptom && item.symptom.toLowerCase().includes(keyword)) ||
                 (item.category && item.category.toLowerCase().includes(keyword))
        })
      }

      this.filteredList = list
    },

    getImage(item) {
      if (!item.image) return '/static/logo.png'
      return imageUrl(item.image)
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
    }
  }
}
</script>

<style scoped>
/* ==================================================================
   知识百科 —— 样式（重写版）
   说明：原样式在多次 UI 调整中叠加了 53 个 !important 与 11 处重复
   定义，导致间距/字号互相打架。这里合并成唯一一份，不再使用
   !important。间距统一用 8rpx 的倍数（24/32/40）。
   ================================================================== */

.container {
  background-color: var(--bg-page);
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding-bottom: 200rpx;   /* 给底部悬浮导航留空间 */
}

/* ---------- 顶栏 ---------- */
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 32rpx;
  background: #fff;
}
.navbar-title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--t-strong);
}
.navbar-right { min-width: 64rpx; }

/* ---------- 搜索 ---------- */
.search-section { padding: 8rpx 32rpx 24rpx; }
.search-box {
  display: flex;
  align-items: center;
  height: 88rpx;
  padding: 0 28rpx;
  border-radius: 999rpx;
  background: #fff;
  box-shadow: var(--sh-card);
}
.search-icon { width: 30rpx; height: 30rpx; margin-right: 16rpx; opacity: .65; }
.search-input {
  flex: 1;
  height: 88rpx;
  font-size: 28rpx;
  color: var(--t-main);
  background: transparent;
}

/* ---------- 分类 ---------- */
.category-section { padding-bottom: 32rpx; }
.category-scroll { white-space: nowrap; width: 100%; }
.category-list { display: inline-flex; padding: 0 32rpx; gap: 16rpx; }
.category-item {
  flex-shrink: 0;
  padding: 14rpx 32rpx;
  border-radius: 999rpx;
  font-size: 26rpx;
  color: var(--t-sub);
  background: #fff;
  border: 2rpx solid #EDF2F7;
}
.category-item.active {
  background: linear-gradient(135deg, #34D399, #059669);
  color: #fff;
  border-color: transparent;
  font-weight: 700;
  box-shadow: var(--sh-float);
}

/* ---------- 列表 ---------- */
.list-section {
  padding: 0 32rpx;
  display: flex;
  flex-direction: column;
  gap: 28rpx;
}
.disease-card {
  display: flex;
  align-items: stretch;
  padding: 24rpx;
  border-radius: var(--r-lg);
  background: #fff;
  box-shadow: var(--sh-card);
}
.disease-img-wrap { position: relative; flex-shrink: 0; }
.disease-image {
  width: 176rpx;
  height: 176rpx;
  border-radius: 20rpx;
  display: block;
  /* 注意：这里不写 background。
     小程序的样式覆盖不如浏览器可靠，如果基础类写 background、占位类写
     background（渐变），可能出现「只生效其中一个」的情况。
     所以背景色交给下面各自的类去设。 */
}
.level-badge {
  position: absolute;
  left: 10rpx;
  bottom: 10rpx;
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
  font-weight: 600;
  background: rgba(15, 23, 42, .55);
  color: #fff;
}
.level-badge.lv3 { background: rgba(220, 38, 38, .9); }
.level-badge.lv2 { background: rgba(217, 119, 6, .9); }
.level-badge.lv1 { background: rgba(21, 128, 61, .9); }

.disease-info {
  flex: 1;
  min-width: 0;
  padding-left: 24rpx;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.disease-name {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--t-strong);
  margin-bottom: 12rpx;
}
.disease-desc {
  font-size: 24rpx;
  color: var(--t-sub);
  line-height: 1.6;
  margin-top: 8rpx;
}
.tag {
  align-self: flex-start;
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
  font-size: 21rpx;
  font-weight: 600;
}
.type-tag { background: #F1F5F9; color: var(--t-sub); }

/* ---------- 骨架屏（加载中）---------- */
.loading-state { padding: 0 32rpx; display: flex; flex-direction: column; gap: 28rpx; }
.skeleton-card {
  display: flex;
  padding: 24rpx;
  border-radius: var(--r-lg);
  background: #fff;
  box-shadow: var(--sh-card);
}
.skeleton-img {
  width: 176rpx;
  height: 176rpx;
  border-radius: 20rpx;
  background: #F1F5F9;
  flex-shrink: 0;
}
.skeleton-info { flex: 1; padding-left: 24rpx; display: flex; flex-direction: column; justify-content: center; gap: 16rpx; }
.skeleton-line { height: 24rpx; border-radius: 12rpx; background: #F1F5F9; }
.skeleton-line.w60 { width: 60%; }
.skeleton-line.w40 { width: 40%; }
.skeleton-line.w80 { width: 80%; }

/* ---------- 空状态 ---------- */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 220rpx 60rpx 0;
}
.empty-emoji { width: 120rpx; height: 120rpx; margin-bottom: 32rpx; opacity: .9; }
.empty-title { font-size: 32rpx; font-weight: 700; color: var(--t-main); margin-bottom: 12rpx; }
.empty-desc { font-size: 25rpx; color: var(--t-faint); }

/* 无图时的占位（比默认 logo 更像有意设计） */
.img-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  /* 只用一个纯色，不用渐变：
     小程序里 .disease-image 的 background 简写和这里的渐变叠加时表现不稳定，
     出现过「渐变不生效、露出基础类的灰底」的情况。纯色最可靠。 */
  background-color: #E8F5EE;
  border: 2rpx solid #D1E7DD;
}
.ph-emoji { width: 56rpx; height: 56rpx; opacity: .75; }

</style>
