<template>
  <view class="rt-page">
    <!-- #ifdef H5 -->
    <view class="stage">
      <!-- 取景框 + 扫描线 -->
      <view class="hud">
        <view class="corner tl"></view>
        <view class="corner tr"></view>
        <view class="corner bl"></view>
        <view class="corner br"></view>
        <view class="scan-line" v-if="busy"></view>
      </view>

      <!-- 顶部状态 -->
      <view class="hud-top">
        <view class="chip" :class="chipClass"><text class="dot"></text>{{ statusText }}</view>
        <text class="hud-time" v-if="lastTime">{{ lastTime }}</text>
      </view>

      <!-- 底部结果 -->
      <view class="hud-bottom">
        <view class="result-card" v-if="result">
          <view class="rc-head">
            <text class="rc-name">{{ result.name }}</text>
            <view class="rc-right">
              <view class="rc-score" :class="{ low: (result.confidence || 0) < 60 }">
                <text class="rc-num">{{ result.confidence }}</text>
                <text class="rc-pct">%</text>
              </view>
              <!-- 关掉结果卡：卡片会挡住画面，用户随时可以收起来 -->
              <view class="rc-close" @click.stop="dismissResult" hover-class="rc-close-hover">
                <text class="rc-close-x">×</text>
              </view>
            </view>
          </view>
          <view class="rc-tags">
            <text class="rc-tag lv" v-if="result.levelText">{{ result.levelText }}</text>
            <text class="rc-tag" v-if="result.plantName">{{ result.plantName }}</text>
            <text class="rc-tag" v-if="result.category">{{ result.category }}</text>
            <text class="rc-tag" v-if="result.host && result.host !== result.plantName">寄主 {{ result.host }}</text>
            <text class="rc-tag ghost" v-if="result.matched">知识库匹配</text>
          </view>
          <text class="rc-advice" v-if="advice && !result.symptom">{{ advice }}</text>

          <view class="rc-body" v-if="result.symptom || (result.medicines && result.medicines.length) || (result.suggestions && result.suggestions.length)">
            <view class="rc-row" v-if="result.symptom">
              <text class="rc-k">症状</text>
              <text class="rc-v">{{ result.symptom }}</text>
            </view>
            <view class="rc-row" v-if="result.medicines && result.medicines.length">
              <text class="rc-k">用药</text>
              <view class="rc-v-box">
                <view class="med" v-for="(m, i) in result.medicines" :key="i">
                  <text class="med-name">{{ m.name }}</text>
                  <text class="med-use">{{ m.usage }}</text>
                </view>
              </view>
            </view>
            <view class="rc-row" v-if="result.suggestions && result.suggestions.length">
              <text class="rc-k">防治</text>
              <view class="rc-v-box">
                <text class="rc-li" v-for="(s, i) in result.suggestions" :key="i">· {{ s }}</text>
              </view>
            </view>
          </view>
          <text class="rc-nolocal" v-else>本地知识库暂无「{{ result.name }}」的完整方案，可到百科查看相近病害</text>

          <view class="rc-more" v-if="result.diseaseId" @click.stop="goDetail">
            <text class="rc-more-text">查看完整详情</text>
            <text class="rc-more-arrow">›</text>
          </view>
        </view>
        <view class="result-card empty" v-else>
          <text class="rc-empty">{{ running ? '对准作物，系统会自动扫描识别' : hint }}</text>
        </view>

        <view class="history" v-if="logs.length">
          <text class="his-title">最近识别</text>
          <view class="his-row" v-for="(l, i) in logs" :key="i">
            <text class="his-time">{{ l.time }}</text>
            <text class="his-name">{{ l.name }}</text>
            <text class="his-conf">{{ l.confidence }}%</text>
          </view>
        </view>

        <view class="rt-actions">
          <view class="rt-btn primary" @click="toggle">{{ running ? '停止监测' : '开始监测' }}</view>
          <view class="rt-btn" :class="{ off: !running || busy }" @click="scanNow">立即识别</view>
          <view class="rt-btn" @click="back">返回</view>
        </view>
        <text class="rt-hint">{{ hint }}</text>
        <text class="rt-ver">{{ ver }} · 点击 {{ clickCount }} 次 · 状态 {{ status }}</text>
      </view>
    </view>
    <!-- #endif -->


  </view>
</template>

<script>
import { api } from '@/utils/api.js'

export default {
  data() {
    return {
      running: false,
      busy: false,
      status: 'idle',        // idle | scanning | ok | error
      result: null,
      advice: '',
      logs: [],
      lastTime: '',
      clickCount: 0,
      testSrcs: [],       // ?src=图片URL1,URL2 → 用图片代替摄像头
      testIdx: 0,
      ver: 'v4',
      intervalMs: 2500,      // 自动扫描间隔（快速通道约 0.8 秒出结果）
      hint: '自动扫描：每 2.5 秒检查一次，画面有明显变化才重新识别'
    }
  },
  computed: {
    statusText() {
      return {
        starting: '正在打开摄像头…',
        idle: this.running ? '监测中 · 等待画面' : '待机 · 点击开始监测',
        scanning: '识别中…',
        ok: '已识别',
        error: '未就绪 · 可重试'
      }[this.status] || ''
    },
    chipClass() {
      return { idle: this.status === 'idle', starting: this.status === 'starting', scanning: this.status === 'scanning', ok: this.status === 'ok', err: this.status === 'error' }
    }
  },
  onLoad(options) {
    // 测试源：?src=http://.../a.jpg,http://.../b.jpg
    if (options && options.src) {
      try { this.testSrcs = decodeURIComponent(options.src).split(',').filter(Boolean) } catch (e) { this.testSrcs = String(options.src).split(',') }
    }
    // #ifdef H5
    window.addEventListener('error', (e) => {
      this.hint = '脚本报错：' + (e.message || '未知') + '（F12 看详情）'
      this.status = 'error'
    })
    window.addEventListener('unhandledrejection', (e) => {
      const r = e.reason || {}
      this.hint = '异步报错：' + (r.message || String(r)) + '（F12 看详情）'
      this.status = 'error'
    })
    // #endif
    if (options && options.demo === '1') {
      this.applyResult({
        name: '柑橘溃疡病', confidence: 88, levelText: '重度危害',
        plantName: '柑橘', type: '细菌性病害', matched: true,
        suggestions: ['加强果园巡查，及时清除病叶病枝并集中烧毁']
      })
    }
  },
  onUnload() { this.stop() },
  methods: {
    goDetail() {
      const id = this.result && this.result.diseaseId
      if (!id) return
      this.stop()   // 先释放摄像头，否则返回时会占着
      uni.navigateTo({
        url: '/pages/encyclopedia-detail/encyclopedia-detail?id=' + encodeURIComponent(String(id)),
        fail: () => uni.showToast({ title: '打开详情失败', icon: 'none' })
      })
    },

    back() {
      this.stop()
      uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/recognize/recognize' }) })
    },

    toggle() {
      this.clickCount++
      if (this.running) this.stop()
      else this.start()
    },

    start() {
      // #ifdef H5
      if (this.running) return
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        uni.showToast({ title: '当前浏览器不支持摄像头', icon: 'none' })
        return
      }
      this.status = 'starting'
      this.hint = '正在打开摄像头，请在弹出的提示里点「允许」'
      const stage = document.querySelector('.rt-page .stage')
      if (!stage) {
        this.status = 'error'
        this.hint = '页面还没准备好，刷新一下再试'
        return
      }

      // ---------- 测试源模式：用图片代替摄像头，验证识别与叠加显示 ----------
      if (this.testSrcs.length) {
        this.status = 'starting'
        this.hint = '正在加载测试图片…'
        const imgs = []
        let loaded = 0
        this.testSrcs.forEach((src, i) => {
          const im = new Image()
          im.crossOrigin = 'anonymous'
          im.onload = () => {
            imgs[i] = im
            if (++loaded === this.testSrcs.length) {
              this._testImgs = imgs
              // 把图片当成"摄像头画面"显示出来，方便肉眼确认
              if (stage) {
                const view = document.createElement('img')
                view.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;z-index:1;background:#0B1220'
                view.src = imgs[0].src
                stage.insertBefore(view, stage.firstChild)
                this._testView = view
              }
              this.running = true
              this.status = 'idle'
              this.hint = '测试源模式：用 ' + imgs.length + ' 张图片代替摄像头，流程和真实摄像头一致'
              this.ticker = setInterval(() => this.autoScan(), this.intervalMs)
              this.autoScan(true)
            }
          }
          im.onerror = () => {
            this.status = 'error'
            this.hint = '测试图片加载失败：' + src + '（检查地址或跨域）'
          }
          im.src = src
        })
        return
      }

      const video = document.createElement('video')
      video.setAttribute('playsinline', '')
      video.muted = true
      video.autoplay = true
      video.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;z-index:1;background:#0B1220'
      stage.insertBefore(video, stage.firstChild)
      this._video = video

      // 8 秒还没拿到摄像头就认定卡住了，否则界面会一直"没反应"
      const guard = setTimeout(() => {
        if (!this.running) {
          this.status = 'error'
          this.hint = '摄像头没有响应（可能被其他程序占用），关掉微信/QQ 的视频后再试'
          this.stop()
        }
      }, 8000)
      this._guard = guard

      navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
        audio: false
      }).then((stream) => {
        if (this._guard) { clearTimeout(this._guard); this._guard = null }
        this._stream = stream
        video.srcObject = stream
        video.play().catch(() => {})
        this.running = true
        this.status = 'idle'
        this.ticker = setInterval(() => this.autoScan(), this.intervalMs)
        // 启动后先扫一次
        setTimeout(() => this.autoScan(true), 900)
        // 3 秒后画面还是空的 → 多半是摄像头被别的程序占用
        setTimeout(() => {
          if (this.running && !this.testSrcs.length && this._video && !this._video.videoWidth) {
            this.status = 'error'
            this.hint = '画面没有出来：摄像头可能被其他程序占用（微信/QQ/录屏软件），关掉后点「开始监测」重试'
          }
        }, 3000)

        // 摄像头被拔掉或被系统收回时，别让界面僵在原地
        stream.getVideoTracks().forEach((track) => {
          track.onended = () => {
            this.status = 'error'
            this.hint = '摄像头已断开，点「开始监测」重新连接'
            this.stop()
            this.status = 'error'
            this.hint = '摄像头已断开，点「开始监测」重新连接'
          }
        })
      }).catch((err) => {
        if (this._guard) { clearTimeout(this._guard); this._guard = null }
        const name = String((err && err.name) || '')
        let tip = '无法打开摄像头'
        if (name === 'NotAllowedError') tip = '摄像头权限被拒绝，请在地址栏允许'
        else if (name === 'NotFoundError') tip = '没有检测到摄像头'
        else if (name === 'NotReadableError') tip = '摄像头被其他程序占用'
        uni.showToast({ title: tip, icon: 'none' })
        this.stop()
        this.status = 'error'
        this.hint = tip + '（点「开始监测」可重试）'
      })
      // #endif
    },

    stop() {
      // #ifdef H5
      if (this._guard) { clearTimeout(this._guard); this._guard = null }
      if (this.ticker) { clearInterval(this.ticker); this.ticker = null }
      if (this._stream) {
        this._stream.getTracks().forEach((t) => t.stop())
        this._stream = null
      }
      if (this._video && this._video.parentNode) this._video.parentNode.removeChild(this._video)
      this._video = null
      this._testImgs = null
      if (this._testView && this._testView.parentNode) this._testView.parentNode.removeChild(this._testView)
      this._testView = null
      // #endif
      this.running = false
      this.busy = false
      this.status = 'idle'
    },

    // 自动扫描：画面变化足够大才识别，避免无谓消耗
    autoScan(force) {
      // #ifdef H5
      if (!this.running || this.busy) return
      if (this._cooldownUntil && Date.now() < this._cooldownUntil) return   // 被限流后先歇会儿
      this.grabFrame().then((shot) => {
        if (!shot) return
        const diff = this.frameDiff(shot.sig)
        this._lastSig = shot.sig
        const changed = force || diff > 4
        const stale = !this.result || (Date.now() - (this._lastScanAt || 0) > 6000)
        if (!changed && !stale) {
          if (this.status === 'idle') this.hint = '画面没变化，等待中…（把作物挪一下或换个角度）'
          return
        }
        this.sendFrame(shot.blob)
      })
      // #endif
    },

    scanNow() {
      // #ifdef H5
      if (!this.running || this.busy) return
      this.grabFrame().then((shot) => { if (shot) this.sendFrame(shot.blob) })
      // #endif
    },

    // 抓一帧：返回 { blob, sig }
    grabFrame() {
      // #ifdef H5
      return new Promise((resolve) => {
        const video = this._video
        const imgs = this._testImgs
        const canvas = document.createElement('canvas')
        const ctx0 = canvas.getContext('2d')
        if (imgs && imgs.length) {
          // 测试源：每轮换一张图，模拟"画面变化"
          const img = imgs[this.testIdx % imgs.length]
          this.testIdx++
          if (this._testView) this._testView.src = img.src
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          ctx0.drawImage(img, 0, 0)
        } else {
          if (!video || !video.videoWidth) { resolve(null); return }
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          ctx0.drawImage(video, 0, 0, canvas.width, canvas.height)
        }
        const ctx = ctx0

        // 缩略签名（16x12 灰度）用于判断画面是否变化
        const small = document.createElement('canvas')
        small.width = 16
        small.height = 12
        const sctx = small.getContext('2d')
        sctx.drawImage(canvas, 0, 0, 16, 12)
        const data = sctx.getImageData(0, 0, 16, 12).data
        const sig = []
        for (let i = 0; i < data.length; i += 4) {
          sig.push((data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000)
        }

        canvas.toBlob((blob) => resolve(blob ? { blob, sig } : null), 'image/jpeg', 0.9)
      })
      // #endif
    },

    frameDiff(sig) {
      const prev = this._lastSig
      if (!prev || prev.length !== sig.length) return 999
      let sum = 0
      for (let i = 0; i < sig.length; i++) sum += Math.abs(sig[i] - prev[i])
      return sum / sig.length
    },

    sendFrame(blob) {
      // #ifdef H5
      if (!blob || this.busy) return
      this.busy = true
      this.status = 'scanning'
      const url = URL.createObjectURL(blob)
      const started = Date.now()
      api.recognizeRealtime(url).then((res) => {
        this.applyResult(res && res.data)
      }).catch((err) => {
        const msg = (err && err.message) || '识别失败'
        if (/频繁|429/.test(msg)) {
          // 被限流：退避 8 秒，别把用户晾在"报错"里
          this._cooldownUntil = Date.now() + 8000
          this.status = 'idle'
          this.hint = '请求太快，自动歇 8 秒再继续…'
        } else {
          this.status = 'error'
          this.hint = msg + '（会自动重试）'
        }
      }).finally(() => {
        URL.revokeObjectURL(url)
        this.busy = false
        this._lastScanAt = Date.now()
        if (this.status === 'scanning') this.status = 'idle'
      })
      // #endif
    },

    // 关闭结果卡（不影响继续扫描）
    dismissResult() {
      this.result = null
      this.advice = ''
      this.status = 'idle'
      this.hint = '已收起结果，画面有变化会继续自动识别'
    },

    applyResult(d) {
      if (!d) return
      const nm = String(d.name || '').trim()
      // 老后端可能返回 name="无"、置信度 0 这种空结果，前端再兜一层
      const emptyName = /^(无|未知|未知病害|无病害|健康|)$/.test(nm)
      const noPlant = d.noPlant || emptyName || /未识别到植物|识别失败/.test(nm)
      if (noPlant) {
        this.status = 'idle'
        this.hint = d.note || '画面里没看到植物，请把叶片/果实对准取景框'
        return
      }
      this.result = d
      this.status = 'ok'
      this.lastTime = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      const sug = Array.isArray(d.suggestions) ? d.suggestions[0] : ''
      this.advice = String(sug || d.symptom || '').slice(0, 60)
      this.hint = '自动扫描：每 2.5 秒检查一次，画面变化才重新识别'
      this.logs.unshift({
        time: this.lastTime,
        name: d.name || '未知',
        confidence: d.confidence || 0
      })
      if (this.logs.length > 3) this.logs.pop()
    }
  }
}
</script>

<style scoped>
.rt-page { min-height: 100vh; background: #0B1220; }
.stage { position: fixed; left: 0; top: 0; right: 0; bottom: 0; overflow: hidden; background: #0B1220; }

/* 取景框 */
.hud {
  position: absolute; left: 50%; top: 10%; transform: translateX(-50%);
  width: min(88vw, 960px); height: 56vh; z-index: 3; pointer-events: none;
}
.corner { position: absolute; width: 56rpx; height: 56rpx; border: 4rpx solid rgba(52, 211, 153, .9); }
.corner.tl { left: 0; top: 0; border-right: none; border-bottom: none; border-top-left-radius: 12rpx; }
.corner.tr { right: 0; top: 0; border-left: none; border-bottom: none; border-top-right-radius: 12rpx; }
.corner.bl { left: 0; bottom: 0; border-right: none; border-top: none; border-bottom-left-radius: 12rpx; }
.corner.br { right: 0; bottom: 0; border-left: none; border-top: none; border-bottom-right-radius: 12rpx; }

/* 扫描线 */
.scan-line {
  position: absolute; left: 0; right: 0; height: 4rpx;
  background: linear-gradient(90deg, transparent, rgba(52, 211, 153, .95), transparent);
  box-shadow: 0 0 24rpx rgba(52, 211, 153, .8);
  animation: scan 2.4s linear infinite;
}
@keyframes scan {
  0% { top: 0; opacity: .2; }
  50% { opacity: 1; }
  100% { top: 100%; opacity: .2; }
}

/* 顶部状态 */
.hud-top {
  position: absolute; left: 50%; transform: translateX(-50%); top: 32rpx;
  width: min(94vw, 900px); z-index: 4;
  display: flex; align-items: center; justify-content: space-between;
}
.chip {
  display: flex; align-items: center; gap: 10rpx; padding: 10rpx 20rpx; border-radius: 999rpx;
  background: rgba(15, 23, 42, .62); color: #E2E8F0; font-size: 24rpx;
  border: 1rpx solid rgba(148, 163, 184, .35); backdrop-filter: blur(8rpx);
}
.chip .dot { width: 12rpx; height: 12rpx; border-radius: 50%; background: #64748B; }
.chip.ok .dot { background: #34D399; box-shadow: 0 0 12rpx #34D399; }
.chip.scanning .dot { background: #FBBF24; }
.chip.err .dot { background: #F87171; }
.hud-time { font-size: 22rpx; color: rgba(226, 232, 240, .75); }

/* 底部信息 */
.hud-bottom {
  position: absolute; left: 50%; transform: translateX(-50%); bottom: 32rpx;
  width: min(94vw, 900px); z-index: 4;
}
.result-card {
  background: rgba(15, 23, 42, .82); border: 1rpx solid rgba(52, 211, 153, .35);
  border-radius: 24rpx; padding: 26rpx 28rpx; backdrop-filter: blur(10rpx);
  box-shadow: 0 12rpx 40rpx rgba(0, 0, 0, .45);
}
.result-card.empty { border-color: rgba(148, 163, 184, .25); }
.rc-empty { font-size: 26rpx; color: rgba(226, 232, 240, .7); }
.rc-head { display: flex; align-items: center; justify-content: space-between; }
.rc-right { display: flex; align-items: center; gap: 16rpx; }
/* 关闭按钮：结果卡挡画面时随手收起 */
.rc-close {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: rgba(15, 23, 42, .55);
  border: 1rpx solid rgba(148, 163, 184, .35);
  display: flex;
  align-items: center;
  justify-content: center;
}
.rc-close-hover { background: rgba(15, 23, 42, .8); }
.rc-close-x {
  font-size: 36rpx;
  line-height: 1;
  color: #E2E8F0;
  margin-top: -4rpx;
}
.rc-name { font-size: 40rpx; font-weight: 800; color: #F8FAFC; }
.rc-score { display: flex; align-items: baseline; padding: 6rpx 18rpx; border-radius: 999rpx; background: rgba(16, 185, 129, .18); }
.rc-score.low { background: rgba(245, 158, 11, .18); }
.rc-num { font-size: 34rpx; font-weight: 800; color: #34D399; }
.rc-score.low .rc-num { color: #FBBF24; }
.rc-pct { font-size: 20rpx; color: #34D399; margin-left: 2rpx; }
.rc-score.low .rc-pct { color: #FBBF24; }
.rc-tags { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 14rpx; }
.rc-tag { font-size: 22rpx; color: #CBD5E1; background: rgba(148, 163, 184, .18); padding: 4rpx 14rpx; border-radius: 8rpx; }
.rc-tag.lv { color: #FDE68A; background: rgba(245, 158, 11, .18); }
.rc-tag.ghost { color: #6EE7B7; background: rgba(16, 185, 129, .14); }
.rc-advice { display: block; margin-top: 16rpx; font-size: 24rpx; color: #94A3B8; line-height: 1.6; }

/* 明细：症状 / 用药 / 防治 */
.rc-body {
  margin-top: 16rpx; padding-top: 16rpx;
  border-top: 1rpx solid rgba(148, 163, 184, 0.18);
  max-height: 34vh; overflow-y: auto;
}
.rc-row { display: flex; align-items: flex-start; margin-bottom: 14rpx; }
.rc-row:last-child { margin-bottom: 0; }
.rc-k {
  flex-shrink: 0; width: 68rpx; font-size: 22rpx; color: #6EE7B7;
  background: rgba(16, 185, 129, 0.14); border-radius: 8rpx;
  text-align: center; padding: 4rpx 0; margin-right: 16rpx;
}
.rc-v { flex: 1; font-size: 23rpx; color: #CBD5E1; line-height: 1.65; }
.rc-v-box { flex: 1; display: flex; flex-direction: column; }
.med { display: flex; flex-wrap: wrap; align-items: baseline; margin-bottom: 8rpx; }
.med-name { font-size: 24rpx; color: #F1F5F9; font-weight: 600; margin-right: 10rpx; }
.med-use { font-size: 21rpx; color: #94A3B8; }
.rc-li { display: block; font-size: 23rpx; color: #CBD5E1; line-height: 1.65; margin-bottom: 6rpx; }
.rc-nolocal { display: block; margin-top: 14rpx; font-size: 22rpx; color: #94A3B8; line-height: 1.6; }
.rc-more {
  display: flex; align-items: center; justify-content: center; gap: 6rpx;
  margin-top: 18rpx; padding-top: 16rpx;
  border-top: 1rpx solid rgba(148, 163, 184, 0.18);
}
.rc-more:active { opacity: .7; }
.rc-more-text { font-size: 24rpx; color: #34D399; font-weight: 600; }
.rc-more-arrow { font-size: 28rpx; color: #34D399; }

/* 历史 */
.history { margin-top: 16rpx; padding: 18rpx 22rpx; border-radius: 18rpx; background: rgba(15, 23, 42, .6); }
.his-title { font-size: 22rpx; color: #64748B; }
.his-row { display: flex; align-items: center; gap: 16rpx; margin-top: 8rpx; }
.his-time { font-size: 21rpx; color: #64748B; width: 120rpx; }
.his-name { flex: 1; font-size: 24rpx; color: #E2E8F0; }
.his-conf { font-size: 22rpx; color: #34D399; }

/* 按钮 */
.rt-actions { display: flex; gap: 16rpx; margin-top: 20rpx; }
.rt-btn {
  flex: 1; height: 84rpx; border-radius: 18rpx; display: flex; align-items: center; justify-content: center;
  font-size: 26rpx; font-weight: 700; color: #E2E8F0; background: rgba(148, 163, 184, .18);
  border: 1rpx solid rgba(148, 163, 184, .28);
}
.rt-btn.primary { background: linear-gradient(135deg, #34D399, #059669); color: #fff; border: none; }
.rt-btn.off { opacity: .45; }
.rt-hint { display: block; margin-top: 14rpx; text-align: center; font-size: 21rpx; color: #64748B; }
.rt-ver { display: block; margin-top: 6rpx; text-align: center; font-size: 19rpx; color: #334155; }

</style>
