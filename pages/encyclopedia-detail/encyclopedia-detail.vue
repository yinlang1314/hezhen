<template>
  <view class="page-wrap container">
    <NavBar title="病虫害详情" />

    <!-- 顶部信息 -->
    <view class="header-section" v-if="disease">
      <image v-if="disease.image" class="disease-image" :src="getFullImage(disease.image)" mode="aspectFill" />
      <view v-else class="image-placeholder">
        <image class="ph-icon" src="/static/icons/func-book.png" mode="aspectFit" />
        <text class="ph-text">暂无配图</text>
        <text class="ph-tip">识别到该病害后会自动补上</text>
      </view>
      <view class="disease-info">
        <view class="name-row">
          <text class="disease-name">{{ disease.name || '未知病虫害' }}</text>
          <view class="verify-badge" v-if="Number(disease.verified) === 1">
            <text class="verify-check">✓</text>
            <text>已核实</text>
          </view>
        </view>
        <view class="disease-tags" v-if="!failed">
          <text class="tag type-tag">{{ disease.category || '未分类' }}</text>
          <text class="tag level-tag">{{ disease.level_text || '危害等级：中度' }}</text>
        </view>
        <text class="data-source" v-if="disease.verify_source">资料来源：{{ disease.verify_source }}{{ disease.verify_date ? '（核对 ' + disease.verify_date + '）' : '' }}</text>
        <view class="disease-basic" v-if="disease.host || disease.period">
          <text class="basic-item" v-if="disease.host">寄主作物：{{ disease.host }}</text>
          <text class="basic-item" v-if="disease.period">高发时期：{{ disease.period }}</text>
        </view>
      </view>
    </view>

    <!-- ========== 识别失败：不按病害详情渲染，而是讲清楚发生了什么 ========== -->
    <!-- 原因：失败记录的 symptom/cause/medicines 等字段本来就是空的，
         按病害详情渲染只会得到「一片空白」，用户不知道发生了什么、该怎么办。 -->
    <view class="content-section" v-if="disease && failed">
      <view class="fail-card">
        <view class="fail-head">
          <image class="fail-emoji" src="/static/icons/line-search.png" mode="aspectFit" />
          <text class="fail-title">这张照片没能识别出作物病害</text>
        </view>
        <text class="fail-desc">可能原因：画面里没有植物、植物太小或太模糊、光线太暗、拍的是远景或整棵树。</text>

        <view class="fail-tips" v-if="failTips.length">
          <text class="fail-tips-title">重新拍摄的建议</text>
          <view class="list-item" v-for="(t, i) in failTips" :key="i">
            <text class="list-idx">{{ i + 1 }}</text>
            <text class="list-text">{{ t }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 详情模块 -->
    <view class="content-section" v-if="disease && !failed">
      <view class="content-item" v-if="disease.symptom">
        <view class="item-header">
          <text class="item-title">发病症状</text>
        </view>
        <text class="item-content">{{ cleanSymptom }}</text>
      </view>

      <view class="content-item" v-if="disease.cause">
        <view class="item-header">
          <text class="item-title">病原与诱因</text>
        </view>
        <text class="item-content">{{ cleanCause }}</text>
      </view>

      <view class="content-item" v-if="disease.spread">
        <view class="item-header">
          <text class="item-title">传播途径</text>
        </view>
        <text class="item-content">{{ cleanSpread }}</text>
      </view>

      <view class="content-item" v-if="disease.occurrence">
        <view class="item-header">
          <text class="item-title">发生规律</text>
        </view>
        <text class="item-content">{{ cleanOccurrence }}</text>
      </view>

      <view class="content-item" v-if="getArrayField(disease.prevention).length > 0">
        <view class="item-header">
          <text class="item-title">综合防治方案</text>
        </view>
        <view class="list-content">
          <view class="list-item" v-for="(p, index) in toStringList(disease.prevention)" :key="index">
            <text class="list-idx">{{ index + 1 }}</text>
            <text class="list-text">{{ p }}</text>
          </view>
        </view>
      </view>

      <view class="content-item" v-if="getArrayField(disease.medicines).length > 0">
        <view class="item-header">
          <text class="item-title">推荐用药</text>
        </view>
        <view class="list-content">
          <view class="med-item" v-for="(med, index) in getMedicines()" :key="index">
            <view class="med-head">
              <text class="list-idx">{{ index + 1 }}</text>
              <text class="med-name">{{ med.name }}</text>
              <text class="med-tox" v-if="med.tox">{{ med.tox }}</text>
            </view>
            <text class="med-usage" v-if="med.usage">{{ med.usage }}</text>
          </view>
        </view>
      </view>

      <view class="content-item tip-item" v-if="getArrayField(disease.suggestions).length > 0">
        <view class="item-header">
          <text class="item-title">防治建议</text>
        </view>
        <view class="list-content">
          <view class="list-item" v-for="(tip, index) in toStringList(disease.suggestions)" :key="index">
            <text class="list-text">{{ index + 1 }}. {{ tip }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 底部操作栏：收藏 + 识别。
         收藏放这里而不是顶栏，是为了避开小程序右上角的胶囊按钮（会重叠）。 -->
    <view class="bottom-bar">
      <!-- 历史记录没有"收藏"概念，只有百科条目才能收藏 -->
      <view class="collect-btn" :class="{ on: isCollected }" @click="toggleCollect" v-if="!failed && !disease.isHistory">
        <image class="collect-btn-icon" :src="isCollected ? '/static/icons/heart-on.png' : '/static/icons/heart-off.png'" mode="aspectFit" />
        <text class="collect-btn-text">{{ isCollected ? '已收藏' : '收藏' }}</text>
      </view>
      <button class="identify-btn" @click="goToIdentify">{{ failed ? '重新识别' : '立即识别' }}</button>
    </view>
  </view>
</template>

<script>
import { imageUrl, ensureBaseUrl } from '@/utils/config.js'
import NavBar from '@/components/NavBar.vue'
import { api } from '@/utils/api.js'
import { formatMedicines, toStringList } from '@/utils/helpers.js'

export default {
  components: { NavBar },
  data() {
    return {
      disease: {},
      isCollected: false,
      collectId: null
    }
  },

  onLoad(options) {
// 后端地址探测完成后重新渲染，保证图片地址正确
    uni.$on('apiBaseUrlChanged', () => { this.$forceUpdate() })
    ensureBaseUrl()

    // 安全登录校验
        // URL 里可能带着完整数据（老写法），也可能是新写法只带 id。
    // 只要有 id 就回后端取最新数据，避免 URL 过长/特殊字符（如用药里的 %）导致解析失败。
    // 三种进入方式：
    //   hid=xx  从历史记录进来 -> 用历史接口取（历史 id 和百科 id 不是一套编号）
    //   id=xx   从百科/收藏进来 -> 用百科接口取
    //   item=xx 旧写法（兼容）
    const hid = Number(options.hid)
    if (hid) {
      this.loadFromHistory(hid)
      return
    }

    const idParam = Number(options.id || options.disease_id)
    let parsed = idParam ? { id: idParam } : null
    const raw = options.item ? String(options.item) : ''
    if (!parsed && raw) {
      try {
        parsed = JSON.parse(decodeURIComponent(raw))
      } catch (err) {
        // 兼容被二次解码的情况（% 会被解坏）
        try { parsed = JSON.parse(raw) } catch (e2) { parsed = null }
      }
    }

    if (parsed && (parsed.id || parsed.name)) {
      this.disease = parsed
      this.applyRoute()
      // 只有拿到“真正的病害 id”才回后端刷新：
      //   百科传 disease.id；收藏传 disease_id；历史传的是历史记录 id，不能用来取病害详情
      if (parsed.id) this.loadFromBackend(parsed.id)
    } else {
      uni.showToast({ title: '数据加载失败，请返回重进', icon: 'none' })
      console.error('详情页拿不到有效参数，原始值：', raw)
    }
  },

  computed: {
    // 这条记录是「识别失败」而不是识别出了病害
    failed() {
      const d = this.disease || {}
      const n = String(d.name || '')
      if (/未识别到植物|识别失败|无法判断/.test(n)) return true
      // 兜底：连一点可展示的内容都没有，才算失败（避免把「只有建议没症状」的误判）
      const hasText = ['symptom', 'cause', 'spread', 'occurrence'].some((f) => String(d[f] || '').trim().length > 12)
      const hasMeds = this.getArrayField(d.medicines).length > 0
      const hasTips = this.getArrayField(d.suggestions).length > 0
      return !hasText && !hasMeds && !hasTips
    },
    // 重新拍摄的建议：优先用后端给的 suggestions
    failTips() {
      const list = this.getArrayField((this.disease || {}).suggestions)
      if (list.length) return list
      return [
        '对准病斑部位，让叶片占满画面主体',
        '保证光线充足，避免逆光和阴影',
        '对焦清晰，不要拍整棵树或远景',
        '可以正反面各拍一张，或用连拍模式拍 2～3 张'
      ]
    },

    // AI 自动收录的病害，symptom 里可能带【鉴别诊断】【图像证据】等诊断过程文字，
    // 那是给识别用的，不该展示在百科里。这里再清一遍做双保险。
    cleanSymptom() { return this.cleanText(this.disease && this.disease.symptom) },
    cleanCause() { return this.cleanText(this.disease && this.disease.cause) },
    cleanSpread() { return this.cleanText(this.disease && this.disease.spread) },
    cleanOccurrence() { return this.cleanText(this.disease && this.disease.occurrence) },
  },

  methods: {
    // 去掉 AI 诊断过程留下的标记段落
    cleanText(t) {
      return String(t == null ? '' : t)
        .split('【鉴别诊断】')[0]
        .split('【图像证据】')[0]
        .trim()
    },

    goToIdentify() {
      uni.navigateTo({ url: '/pages/recognize/recognize' })
    },

    // 获取完整图片地址
    getFullImage(url) {
      if (!url) return '/static/default-disease.png'
      return imageUrl(url)
    },

    // 安全解析数组字段（后端可能传字符串）
    getArrayField(value) {
      if (!value) return []
      if (Array.isArray(value)) return value
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value)
          return Array.isArray(parsed) ? parsed : []
        } catch {
          return value.split(',').map(s => s.trim()).filter(Boolean)
        }
      }
      return []
    },

    // 检查当前病虫害是否已收藏
    // URL 里直接带 id 时，用 URL 参数（老写法）渲染
    applyRoute() {
      this.checkCollectStatus()
    },

    // 从历史记录加载（历史 id 与百科 id 不同，必须走这个接口）
    async loadFromHistory(hid) {
      try {
        const res = await api.getHistoryDetail(hid)
        const r = (res && res.data) || null
        if (!r) {
          uni.showToast({ title: '记录不存在', icon: 'none' })
          return
        }
        // 转成详情页统一的字段结构
        this.disease = {
          id: r.id,
          name: r.disease_name,
          image: r.image_url || r.image,
          confidence: r.confidence,
          level: r.level || 2,
          level_text: r.level_text || '中度危害',
          type: '',
          category: '',
          host: '',
          period: '',
          symptom: r.symptom || '',
          cause: r.cause || '',
          spread: r.spread || '',
          occurrence: r.occurrence || '',
          medicines: r.medicines || '[]',
          suggestions: r.suggestions || '[]',
          prevention: r.prevention || '[]',
          plantName: r.plant_name || '',
          aiSource: r.ai_source || '',
          time: r.create_time || '',
          isHistory: true
        }
        // 历史记录没有收藏概念
        this.isCollected = false
        this.collectId = null
      } catch (err) {
        console.warn('历史详情加载失败:', err)
        uni.showToast({ title: '加载失败，请返回重试', icon: 'none' })
      }
    },

    // 回后端取最新、最完整的详情（症状/用药/防治都以库为准）
    async loadFromBackend(id) {
      try {
        const res = await api.getDiseaseDetail(id)
        if (res && res.data) {
          this.disease = res.data
          this.checkCollectStatus()
        }
      } catch (err) {
        console.warn('后端详情获取失败，沿用页面已有数据:', err)
      }
    },

    // 判断是否已收藏：后端为准（收藏页读的是后端），本地作为兜底
    async checkCollectStatus() {
      const id = this.disease && this.disease.id
      if (!id) return
      // 游客没有 token，请求收藏列表必然 401 —— 直接用本地记录
      const token = uni.getStorageSync('token')
      if (!token) {
        const list = uni.getStorageSync('collectionList') || []
        this.isCollected = list.some((item) => String(item.id) === String(id) || String(item.disease_id) === String(id))
        return
      }
      try {
        const res = await api.getCollectList()
        const hit = (res.data || []).find((x) => String(x.disease_id) === String(id))
        this.isCollected = !!hit
        this.collectId = hit ? hit.id : null
      } catch (e) {
        const list = uni.getStorageSync('collectionList') || []
        this.isCollected = list.some((item) => String(item.id) === String(id) || String(item.disease_id) === String(id))
      }
    },

    // 切换收藏状态
    getMedicines() {
      return formatMedicines(this.disease && this.disease.medicines)
    },

    toStringList(list) {
      return toStringList(list)
    },

    // 收藏：后端为准（收藏页读的是后端），本地做备份
    async toggleCollect() {
      const d = this.disease || {}
      let collectionList = uni.getStorageSync('collectionList') || []

      if (this.isCollected) {
        // 取消收藏：先从后端删，再清理本地
        if (this.collectId) {
          try { await api.delCollect(this.collectId) } catch (e) { console.error('取消收藏同步失败:', e) }
        } else {
          // 后端没有记录（例如收藏时未登录），只清本地
          const local = uni.getStorageSync('collectionList') || []
          const hit = local.find((x) => String(x.disease_id) === String(d.id))
          if (hit && hit.collectId) { try { await api.delCollect(hit.collectId) } catch (e) {} }
        }
        collectionList = collectionList.filter((item) => String(item.id) !== String(d.id) && String(item.disease_id) !== String(d.id))
        uni.setStorageSync('collectionList', collectionList)
        this.isCollected = false
        this.collectId = null
        uni.showToast({ title: '已取消收藏', icon: 'success' })
        return
      }

      // 添加收藏
      const collectItem = Object.assign({}, d, { collectTime: this.formatTime(new Date()) })
      collectionList.unshift(collectItem)
      uni.setStorageSync('collectionList', collectionList)
      this.isCollected = true
      uni.showToast({ title: '已加入收藏', icon: 'success' })

      // 同步到后端（收藏页读后端；未登录时会失败，仅保留本地）
      try {
        await api.addCollect({ disease_id: d.id, name: d.name || '', type: d.category || d.type || '', image: d.image || '' })
        const res = await api.getCollectList()
        const hit = (res.data || []).find((x) => String(x.disease_id) === String(d.id))
        this.collectId = hit ? hit.id : null
      } catch (e) {
        console.error('收藏同步到后端失败（已保存在本地）:', e)
      }
    },

    formatTime(date) {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      return `${year}-${month}-${day} ${hours}:${minutes}`
    }
  }
}
</script>

<style scoped>

.name-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12rpx;
}
.verify-badge {
  display: inline-flex;
  align-items: center;
  gap: 4rpx;
  padding: 4rpx 14rpx;
  border-radius: 20rpx;
  background: #ECFDF5;
  border: 1px solid #A7F3D0;
  font-size: 21rpx;
  font-weight: 600;
  color: #059669;
  line-height: 1.5;
}
.verify-check {
  font-size: 20rpx;
  font-weight: 700;
}
/* ==================================================================
   病虫害详情 —— 样式（重写版）
   原来两套样式叠加（40 个 !important）互相打架：.header-section 是横排
   flex，图片又被 width:100% !important 撑满，导致图片占满整屏、文字被
   挤没。这里合并成一份，结构改为「大图在上、信息在下」。
   ================================================================== */

.container {
  background-color: var(--bg-page);
  min-height: 100%;
  padding-bottom: 200rpx;   /* 给底部固定按钮留空间 */
}

/* ---------- 顶栏 ---------- */
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 32rpx;
  background: transparent;
}
.navbar-title {
  flex: 1;
  text-align: center;
  font-size: 34rpx;
  font-weight: 700;
  color: var(--t-strong);
}
.navbar-right {
  min-width: 120rpx;
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

/* ---------- 头部：大图在上，信息在下 ---------- */
.header-section {
  margin: 0 32rpx;
  border-radius: var(--r-xl);
  overflow: hidden;
  background: #fff;
  box-shadow: var(--sh-card);
  display: flex;
  flex-direction: column;
}
.disease-image {
  width: 100%;
  height: 400rpx;
  display: block;
  /* 见下方 .image-placeholder 的说明：背景交给各自的类，避免简写覆盖失效 */
}
/* 没有图片时的占位：柔和的底 + 图标，别用高饱和渐变 */
.image-placeholder {
  width: 100%;
  height: 400rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, #F0FDF8, #DCFCE7);
}
.ph-icon { width: 96rpx; height: 96rpx; opacity: .55; margin-bottom: 18rpx; }
.ph-text { font-size: 27rpx; color: #0F766E; font-weight: 600; }
.ph-tip { font-size: 21rpx; color: #94A3B8; margin-top: 8rpx; }
.ph-emoji { font-size: 120rpx; opacity: .7; }

.disease-info { padding: 32rpx; }
.data-source {
  display: block;
  font-size: 20rpx;
  color: #94A3B8;
  margin-top: 10rpx;
  line-height: 1.5;
}
.disease-name {
  display: block;
  font-size: 44rpx;
  font-weight: 800;
  color: var(--t-strong);
  margin-bottom: 20rpx;
}
.disease-tags { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 20rpx; }
.tag {
  padding: 6rpx 20rpx;
  border-radius: 999rpx;
  font-size: 21rpx;
  font-weight: 600;
}
.type-tag { background: #F1F5F9; color: var(--t-sub); }
.level-tag { background: var(--c-accent-soft); color: #B45309; }

.disease-basic { display: flex; flex-direction: column; gap: 12rpx; }
.basic-item { display: flex; align-items: flex-start; font-size: 25rpx; color: var(--t-sub); line-height: 1.6; }

/* ---------- 内容卡片 ---------- */
.content-section {
  padding: 32rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.content-item {
  background: #fff;
  border-radius: var(--r-lg);
  padding: 30rpx 32rpx;
  box-shadow: var(--sh-card);
}
.tip-item {
  background: linear-gradient(135deg, #F8FFFA 0%, #F1F8FF 100%);
  border: 2rpx solid rgba(46, 204, 113, 0.14);
}
.item-header { display: flex; align-items: center; margin-bottom: 18rpx; position: relative; padding-left: 18rpx; }
.item-header::before {
  content: ''; position: absolute; left: 0; top: 50%; transform: translateY(-50%);
  width: 6rpx; height: 26rpx; border-radius: 3rpx; background: var(--c-primary, #10B981);
}
.item-title { font-size: 30rpx; font-weight: 700; color: var(--t-strong); }
.item-content { font-size: 27rpx; color: #334155; line-height: 1.8; }

.list-content { display: flex; flex-direction: column; gap: 16rpx; }
.list-item { display: flex; align-items: flex-start; }
.list-idx {
  flex-shrink: 0;
  width: 36rpx; height: 36rpx;
  border-radius: 50%;
  background: var(--c-primary-soft);
  color: var(--c-primary-deep);
  font-size: 21rpx; font-weight: 700;
  text-align: center; line-height: 36rpx;
  margin-right: 16rpx; margin-top: 4rpx;
}
.list-text { flex: 1; font-size: 27rpx; color: #334155; line-height: 1.75; }
.list-sub { display: block; font-size: 24rpx; color: var(--t-sub); line-height: 1.6; margin-top: 6rpx; }

/* ---------- 底部固定按钮（含全面屏安全区）---------- */
.bottom-bar {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx 32rpx calc(24rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -8rpx 40rpx rgba(0, 0, 0, .06);
}
/* 收藏按钮：描边样式，选中后变实心 */
.collect-btn {
  flex-shrink: 0;
  width: 168rpx;
  height: 92rpx;
  border-radius: 20rpx;
  border: 2rpx solid #E2E8F0;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.collect-btn.on { border-color: #FCA5A5; background: #FEF2F2; }
.collect-btn-icon { width: 34rpx; height: 34rpx; }
.collect-btn-text { font-size: 22rpx; color: var(--t-sub); margin-top: 4rpx; }
.collect-btn.on .collect-btn-text { color: #DC2626; }

.identify-btn {
  flex: 1;
  height: 92rpx;
  background: linear-gradient(135deg, #34D399, #059669);
  color: #fff;
  border: none;
  border-radius: 20rpx;
  font-size: 31rpx;
  font-weight: 700;
  line-height: 92rpx;
  box-shadow: var(--sh-float);
}

/* 用药项：药剂名单独一行，用量另起一行。
   原来是横排 flex（名字 flex:1 + 用量并排），中文会被逐字挤成一列。 */
.med-item {
  display: flex;
  flex-direction: column;
  padding: 22rpx 0;
  border-bottom: 2rpx solid #F1F5F9;
}
.med-item:last-child { border-bottom: none; padding-bottom: 4rpx; }
.med-head { display: flex; align-items: center; margin-bottom: 10rpx; }
.med-name { flex: 1; font-size: 28rpx; font-weight: 600; color: var(--t-main); }
.med-tox {
  flex-shrink: 0; font-size: 20rpx; color: #047857;
  background: var(--c-primary-soft, #D1FAE5); border-radius: 6rpx;
  padding: 2rpx 10rpx; margin-left: 10rpx;
}
.med-usage { display: block; font-size: 26rpx; color: #475569; line-height: 1.75; padding-left: 52rpx; }

/* 识别失败的提示卡片 */
.fail-card {
  background: #fff;
  border-radius: var(--r-lg);
  padding: 36rpx 32rpx;
  box-shadow: var(--sh-card);
  border-left: 8rpx solid #F59E0B;
}
.fail-head { display: flex; align-items: center; margin-bottom: 18rpx; }
.fail-emoji { width: 46rpx; height: 46rpx; margin-right: 14rpx; flex-shrink: 0; }
.fail-title { flex: 1; font-size: 32rpx; font-weight: 700; color: var(--t-strong); line-height: 1.4; }
.fail-desc { display: block; font-size: 27rpx; color: #475569; line-height: 1.8; }
.fail-tips { margin-top: 28rpx; padding-top: 24rpx; border-top: 2rpx solid #F1F5F9; }
.fail-tips-title { display: block; font-size: 28rpx; font-weight: 700; color: var(--t-strong); margin-bottom: 18rpx; }
</style>
