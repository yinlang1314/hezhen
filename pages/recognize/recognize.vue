<template>
  <view class="page-wrap">
    <!-- 顶部栏 -->
    <NavBar title="智能识别" />

    <!-- ========== 上传区 ========== -->
    <!-- 兜底显示：只要"没在识别"且"没有结果"，就显示上传区。
         以前是 v-if="!imageSrc"，一旦 imageSrc 有值但流程中断
         （例如游客次数用完被拦下），三个区块都不满足条件 -> 整页空白。 -->
    <!-- #ifdef H5 -->
    <view class="realtime-entry" @click="goRealtime">
      <image class="realtime-icon" src="/static/icons/tab-recognize-on.png" mode="aspectFit" />
      <view class="realtime-texts">
        <text class="realtime-title">实时监测</text>
        <text class="realtime-sub">摄像头对准作物，自动识别、结果直接叠在画面上</text>
      </view>
      <text class="realtime-arrow">›</text>
    </view>
    <!-- #endif -->

    <view class="upload-zone" v-if="!isRecognizing && !result">
      <view class="drop-card">
        <view class="drop-glow"></view>
        <image class="drop-img" src="/static/icons/ui-hero.png" mode="aspectFit" />
        <text class="drop-title">上传病虫害照片</text>
        <text class="drop-desc">拍摄清晰的叶片、果实或茎干，AI 将自动识别病虫害并给出防治方案</text>
      </view>

      <!-- 模式切换：连拍更准 -->
      <view class="mode-row">
        <view class="mode-item" :class="{ on: batchMode }" @click="setMode(true)">
          <view class="mode-head">
            <image class="mode-icon" src="/static/icons/ui-burst.png" mode="aspectFit" />
            <text class="mode-title">连拍识别</text>
          </view>
          <text class="mode-sub">拍 2~3 张，AI 综合判断更准</text>
        </view>
        <view class="mode-item" :class="{ on: !batchMode }" @click="setMode(false)">
          <view class="mode-head">
            <image class="mode-icon" src="/static/icons/ui-single.png" mode="aspectFit" />
            <text class="mode-title">单张识别</text>
          </view>
          <text class="mode-sub">快，但准确率略低</text>
        </view>
      </view>

      <!-- 已拍的照片 -->
      <view class="thumbs" v-if="batchImages.length">
        <view class="thumb-item" v-for="(img, i) in batchImages" :key="i">
          <!-- 缩略图只做预览，点击不触发识别（避免误触；识别请点下方「开始识别」） -->
            <image class="thumb-img" :src="img" mode="aspectFill"></image>
          <view class="thumb-del" @click.stop="removeBatchImage(i)">✕</view>
          <text class="thumb-no">{{ i + 1 }}</text>
        </view>
        <view class="thumb-add" v-if="batchImages.length < batchMax" @click="takePhoto">
          <text class="thumb-add-icon">＋</text>
        </view>
      </view>


      <view class="action-row">
        <view class="action-btn primary" @click="takePhoto">
          <image class="action-icon" src="/static/icons/ui-camera.png" mode="aspectFit" />
          <text class="action-text">{{ batchImages.length ? '再拍一张（' + batchImages.length + '/' + batchMax + '）' : '拍照识别' }}</text>
        </view>
        <view class="action-btn ghost" @click="chooseFromAlbum">
          <image class="action-icon" src="/static/icons/ui-album.png" mode="aspectFit" />
          <text class="action-text">从相册选择</text>
        </view>
      </view>

      <!-- 拍了 2 张以上就可以识别了 -->
      <view class="batch-go" v-if="batchImages.length >= 1" @click="startBatch">
          <text class="batch-go-text">
            开始识别（已拍 {{ batchImages.length }} 张{{ batchImages.length < batchMax ? '，还可再拍 ' + (batchMax - batchImages.length) + ' 张' : '' }}）
          </text>
        </view>

      <!-- 游客剩余次数提示 -->
      <view class="guest-tip" v-if="guestLeft >= 0">
        <text class="guest-tip-text">{{ guestLeft > 0 ? '未登录免费识别，还剩 ' + guestLeft + ' 次' : '免费次数已用完，登录后不限次数' }}</text>
        <text class="guest-tip-btn" @click="goLogin">去登录</text>
      </view>

      <view class="tips-card">
        <view class="tips-head">
          <image class="tips-icon" src="/static/icons/ui-bulb.png" mode="aspectFit" />
          <text class="tips-title">拍摄小贴士</text>
        </view>
        <view class="tip-line" v-for="(t, i) in tipList" :key="i">
          <text class="tip-index">{{ i + 1 }}</text>
          <text class="tip-text">{{ t }}</text>
        </view>
      </view>
    </view>

    <!-- ========== 识别中 ========== -->
    <view class="preview-zone" v-if="imageSrc && isRecognizing">
      <view class="preview-frame">
        <image class="preview-img" :src="imageSrc" mode="aspectFill"></image>
        <view class="scan-mask"><view class="scan-line"></view></view>
      </view>
      <view class="loading-card">
        <view class="spinner"></view>
        <view class="loading-text">
          <text class="loading-title">{{ batchPhase || 'AI 正在诊断...' }}</text>
          <text class="loading-sub">{{ batchMode && batchImages.length >= 2 ? '正在逐张分析 ' + batchImages.length + ' 张照片并合并结论，约 20～90 秒' : '百度植物识别 + DeepSeek 分析中，通常需要 5～40 秒' }}</text>
        </view>
      </view>
    </view>

    <!-- ========== 结果区 ========== -->
    <view class="result-zone" v-if="imageSrc && !isRecognizing && result">
      <!-- 单张时显示大图；连拍时显示照片条 -->
      <view class="preview-frame small" v-if="!(result.images && result.images.length > 1)">
        <image class="preview-img" :src="imageSrc" mode="aspectFill"></image>
      </view>
      <view class="photo-strip" v-else>
        <view class="strip-item" v-for="(img, i) in stripImages" :key="i">
          <image class="strip-img" :src="img" mode="aspectFill"></image>
          <text class="strip-no">第{{ i + 1 }}张</text>
        </view>
      </view>

      <view class="verdict-card" :class="{ warn: isUncertain }">
        <view class="verdict-top">
          <view class="verdict-main">
            <text class="verdict-name">{{ result.name }}</text>
            <text class="verdict-plant" v-if="result.plantName">识别植物 · {{ result.plantName }}</text>
          </view>
          <view class="score-ring" v-if="!failed">
            <text class="score-num">{{ result.confidence }}</text>
            <text class="score-unit">%</text>
          </view>
        </view>

        <view class="chip-row">
          <text class="chip chip-green" v-if="result.type">{{ result.type }}</text>
          <text class="chip" :class="'chip-level-' + (result.level || 2)">{{ result.levelText }}</text>
          <text class="chip" :class="result.mode === 'local' ? 'chip-amber' : 'chip-blue'">
            {{ result.mode === 'local' ? '演示数据' : 'AI 识别' }}
          </text>
          <text class="chip" :class="result.hasDisagreement ? 'chip-amber' : 'chip-green'" v-if="result.batch">
            {{ result.agreeCount }}/{{ result.photoCount }} 张一致
          </text>
        </view>

        <view class="verdict-note" v-if="result.apiSource">{{ result.apiSource }}</view>
        <view class="verdict-warn" v-if="isUncertain && !result.batch">
          单张照片无法完全确诊，请对照下方【图像证据】与相似病害自行核对。
        </view>
        <!-- 识别失败：把后端给的原因显示出来，否则用户只看到「连拍识别失败」不知道怎么办 -->
        <view class="verdict-fail" v-if="failed">
          <text class="fail-title">{{ result.name }}</text>
          <text class="fail-reason">{{ failReason }}</text>
          <text class="fail-tip">建议：对准病斑部位、让叶片占满画面、避免逆光和模糊。</text>
        </view>
        <view class="verdict-warn danger" v-if="result.hasDisagreement">
          各张照片的结论不完全一致，请看下方【逐张分析】自行核对，或补拍更清晰的照片。
        </view>
        <view class="verdict-warn danger" v-if="result.noPlant">这张图片里没有可识别的植物，请重新拍摄。</view>
        <view class="verdict-ok" v-if="result.learned">已自动收录进本地知识库</view>
      </view>

      <!-- 连拍：逐张结论 -->
      <view class="info-card" v-if="result.batch && result.photoNotes && result.photoNotes.length">
        <view class="info-head"><text class="info-title">逐张分析（{{ result.photoCount }} 张）</text></view>
        <view class="photo-note" v-for="(n, i) in result.photoNotes" :key="i">
          <text class="photo-note-idx">{{ i + 1 }}</text>
          <text class="photo-note-text">{{ n }}</text>
        </view>
      </view>

      <!-- 连拍：不同结论 -->
      <view class="info-card amber" v-if="result.batch && result.disagreements && result.disagreements.length">
        <view class="info-head"><text class="info-title">其他照片给出的不同结论</text></view>
        <view class="photo-note" v-for="(d, i) in result.disagreements" :key="i">
          <text class="photo-note-idx">!</text>
          <text class="photo-note-text">{{ d.name }}（{{ d.confidence }}%）· {{ d.note }}</text>
        </view>
      </view>

      <view class="info-card" v-if="result.evidence">
        <view class="info-head"><text class="info-title">图像证据</text></view>
        <text class="info-text">{{ result.evidence }}</text>
      </view>

      <view class="info-card soft" v-if="result.note && result.mode !== 'local'">
        <text class="info-text small">{{ result.note }}</text>
      </view>

      <view class="info-card amber" v-if="result.differentials && result.differentials.length">
        <view class="info-head"><text class="info-title">需鉴别的相似病害</text></view>
        <view class="diff-row" v-for="(d, i) in result.differentials" :key="i">
          <text class="diff-name">{{ d.name }}</text>
          <text class="diff-why">{{ d.why }}</text>
        </view>
      </view>

      <view class="detail-list">
        <view class="detail-block" v-if="result.symptom">
          <view class="info-head"><text class="info-title">危害症状</text></view>
          <text class="info-text">{{ result.symptom }}</text>
        </view>
        <view class="detail-block" v-if="result.occurrence">
          <view class="info-head"><text class="info-title">发生规律</text></view>
          <text class="info-text">{{ result.occurrence }}</text>
        </view>
        <view class="detail-block" v-if="result.spread">
          <view class="info-head"><text class="info-title">传播途径</text></view>
          <text class="info-text">{{ result.spread }}</text>
        </view>
      </view>

      <view class="detail-list" v-if="result.medicines && result.medicines.length">
        <view class="info-head"><text class="info-title">推荐用药</text></view>
        <view class="med-card" v-for="(m, i) in result.medicines" :key="i">
          <view class="med-idx">{{ i + 1 }}</view>
          <view class="med-body">
            <text class="med-name">{{ m.name }}</text>
            <text class="med-usage" v-if="m.usage">{{ m.usage }}</text>
          </view>
        </view>
      </view>

      <view class="detail-list" v-if="result.suggestions && result.suggestions.length">
        <view class="info-head"><text class="info-title">防治建议</text></view>
        <view class="bullet" v-for="(s, i) in result.suggestions" :key="i">
          <text class="bullet-dot">•</text><text class="bullet-text">{{ s }}</text>
        </view>
      </view>

      <view class="detail-list" v-if="result.prevention && result.prevention.length">
        <view class="info-head"><text class="info-title">预防措施</text></view>
        <view class="bullet" v-for="(s, i) in result.prevention" :key="i">
          <text class="bullet-dot">•</text><text class="bullet-text">{{ s }}</text>
        </view>
      </view>

      <view class="correct-card">
        <view class="correct-head" @click="openCorrect">
          <image class="correct-icon" src="/static/icons/tab-profile-on.png" mode="aspectFit" />
          <view class="correct-texts">
            <text class="correct-title">诊断不准确？</text>
            <text class="correct-sub">提交正确病害名，系统会学习并生成防治方案</text>
          </view>
          <text class="correct-arrow">›</text>
        </view>
        <view class="correct-form" v-if="correcting">
          <input class="correct-input" v-model="correctName" placeholder="例如：芍药炭疽病" />
          <view class="correct-actions">
            <view class="correct-btn cancel" @click="correcting = false">取消</view>
            <view class="correct-btn ok" @click="submitCorrect">{{ submittingCorrect ? '提交中...' : '提交纠正' }}</view>
          </view>
        </view>
        <view class="corrected-tip" v-if="result.corrected">✅ 已人工纠正为「{{ result.name }}」</view>
      </view>

      <view class="bottom-actions">
        <view class="btn-ghost" @click="resetUpload">重新识别</view>
        <view class="btn-solid" @click="saveRecord">保存记录</view>
      </view>
    </view>

    <TabBar current="recognize" />
    
    <!-- #ifdef H5 -->
    <!-- 电脑端没有「系统相机」，这里用浏览器摄像头抓帧 -->
    <view class="cam-mask" v-if="showCamera">
      <view class="cam-box">
        <view class="cam-stage" id="cam-stage"></view>
        <view class="cam-tip" v-if="camError">
          <text class="cam-err">{{ camError }}</text>
          <text class="cam-err-sub">也可以点「从相册选择」上传已有的照片</text>
        </view>
        <view class="cam-actions">
          <view class="cam-btn ghost" @click="closeCamera">取消</view>
          <view class="cam-btn primary" :class="{ disabled: camError }" @click="captureFrame">拍摄</view>
        </view>
      </view>
    </view>
    <!-- #endif -->

  </view>
</template>

<script>
import TabBar from '@/components/TabBar.vue'
import NavBar from '@/components/NavBar.vue'
import { api } from '@/utils/api.js'
import { canRecognize, consumeOnce, limitHint, promptLogin, isLoggedIn, remainingCount } from '@/utils/guest.js'
import { imageUrl } from '@/utils/config.js'

export default {
  components: { TabBar, NavBar },
  data() {
    return {
      imageSrc: '',
      // ---- 连拍模式 ----
      batchMode: true,        // 默认连拍（多拍几张更准）
      batchMax: 3,            // 最多 3 张
      batchImages: [],        // 已选照片（本地临时路径）
      batchPhase: '',         // 连拍进度提示
      resultPreviews: [],     // 刚识别完的本地照片（服务器地址要登录才能看，先用本地图占位）
      guestLeft: -1,          // 未登录时的剩余次数（-1 = 已登录不限）
      tipList: [
        '对焦在病斑部位，保证图片清晰不模糊',
        '避免逆光、反光，或在昏暗环境下拍摄',
        '病斑尽量占画面主体，不要拍整棵树',
        '可同时拍叶片正反面，识别更准确'
      ],
      isRecognizing: false,
      result: null,
      correcting: false,
      correctName: '',
      // H5 摄像头（电脑端拍照）
      showCamera: false,
      camError: '',
      _camStream: null,
      submittingCorrect: false
    }
  },

  computed: {
    // 照片条要显示的地址：优先用本地照片（一定显示得出来），
    // 本地没有时（比如从历史记录进来）才用服务器地址并拼上 token
    stripImages() {
      const d = this.result || {}
      const server = Array.isArray(d.images) ? d.images : []
      const local = this.resultPreviews || []
      return server.map((u, i) => local[i] || imageUrl(u))
    },
    // 识别整体失败（连拍全部没识别到植物 / AI 报错）
    // 后端此时返回 name='连拍识别失败' 或 '未识别到植物'，真正原因放在 note 里
    failed() {
      const d = this.result
      if (!d) return false
      const name = String(d.name || '')
      if (/识别失败|未识别到植物|无法判断/.test(name)) return true
      if (!name) return true
      return false
    },
    // 失败原因：优先用后端给的 note
    failReason() {
      const d = this.result || {}
      return d.note || d.message || '可能原因：照片不够清晰、主体太小，或拍摄对象不是植物。'
    },
    isUncertain() {
      return !!(this.result && this.result.differentials && this.result.differentials.length)
    }
  },
  onShow() {
    this.refreshGuestLeft()
  },

  methods: {

    // 打开实时监测页（仅浏览器）
    goRealtime() {
      uni.navigateTo({
        url: '/pages/realtime/realtime',
        fail: (e) => {
          console.error('打开实时监测失败', e)
          uni.showToast({ title: '页面不存在，请刷新重试', icon: 'none' })
        }
      })
    },

    // 刷新剩余次数显示
    refreshGuestLeft() {
      this.guestLeft = isLoggedIn() ? -1 : remainingCount()
    },

    goLogin() {
      uni.navigateTo({ url: '/pages/login/login?from=recognize' })
    },

    // 相机一次只能拍一张。拍一张就直接识别，想更准可以再点「+ 加拍一张」凑到 3 张
    takePhoto() {
      // #ifdef H5
      // 手机浏览器有系统相机，直接走 chooseImage；电脑没有，改用 getUserMedia
      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
      if (!isMobile && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        this.openCamera()
        return
      }
      // #endif
      uni.chooseImage({
        count: 1,
        sourceType: ['camera'],
        sizeType: ['compressed'],
        success: (res) => {
          const p = res.tempFilePaths[0]
          if (!this.batchMode) {
            this.imageSrc = p
            this.startRecognize()
            return
          }
          this.batchImages.push(p)
          this.afterAddBatch()
        },
        fail: (err) => {
          console.error('拍照失败', err)
          uni.showToast({ title: '拍照失败，请重试', icon: 'none' })
        }
      })
    },

    // ---------- H5 摄像头 ----------
    async openCamera() {
      this.showCamera = true
      this.camError = ''
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        })
        this._camStream = stream
        this.$nextTick(() => {
          const stage = document.getElementById('cam-stage')
          if (!stage) return
          stage.innerHTML = ''
          const video = document.createElement('video')
          video.autoplay = true
          video.playsInline = true
          video.muted = true
          video.style.width = '100%'
          video.style.height = '100%'
          video.style.objectFit = 'cover'
          video.srcObject = stream
          stage.appendChild(video)
          video.play().catch(() => {})
        })
      } catch (e) {
        const name = (e && e.name) || ''
        if (name === 'NotAllowedError') this.camError = '摄像头权限被拒绝，请在浏览器地址栏允许访问摄像头'
        else if (name === 'NotFoundError' || name === 'OverconstrainedError') this.camError = '没有检测到摄像头设备'
        else if (location.protocol === 'http:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
          this.camError = '浏览器只在 localhost 或 https 下允许调用摄像头（当前是局域网 http）'
        } else this.camError = '摄像头打开失败：' + ((e && e.message) || name)
      }
    },

    closeCamera() {
      this.showCamera = false
      if (this._camStream) {
        this._camStream.getTracks().forEach((t) => t.stop())
        this._camStream = null
      }
      const stage = document.getElementById('cam-stage')
      if (stage) stage.innerHTML = ''
    },

    captureFrame() {
      if (this.camError) return
      const stage = document.getElementById('cam-stage')
      const video = stage && stage.querySelector('video')
      if (!video || !video.videoWidth) {
        uni.showToast({ title: '画面还没准备好，等一下再拍', icon: 'none' })
        return
      }
      // 最长边压到 1280，控制上传体积
      const maxSide = 1280
      const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight))
      const w = Math.round(video.videoWidth * scale)
      const h = Math.round(video.videoHeight * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(video, 0, 0, w, h)
      canvas.toBlob((blob) => {
        if (!blob) { uni.showToast({ title: '抓帧失败，请重试', icon: 'none' }); return }
        const url = URL.createObjectURL(blob)
        this.closeCamera()
        if (!this.batchMode) {
          this.imageSrc = url
          this.startRecognize()
          return
        }
        this.batchImages.push(url)
        this.afterAddBatch()
      }, 'image/jpeg', 0.9)
    },


    // 上传前压缩：手机拍的原图动辄 3~5MB，压缩后通常 200~400KB，
    // 网络差时上传成功率高很多，AI 识别准确率不受影响（本来就会缩到 1280）
    compressPath(path) {
      // #ifndef H5
      return new Promise((resolve) => {
        uni.compressImage({
          src: path,
          quality: 80,
          success: (r) => resolve(r.tempFilePath || path),
          fail: () => resolve(path)     // 压缩失败就用原图，不阻断流程
        })
      })
      // #endif

      // #ifdef H5
      return new Promise((resolve) => {
        if (typeof path !== 'string' || path.indexOf('blob:') === 0 || path.indexOf('data:') === 0 && path.length < 200000) {
          resolve(path)
          return
        }
        const img = new Image()
        img.onload = () => {
          try {
            const maxSide = 1280
            const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
            const w = Math.round(img.width * scale)
            const h = Math.round(img.height * scale)
            const cv = document.createElement('canvas')
            cv.width = w
            cv.height = h
            cv.getContext('2d').drawImage(img, 0, 0, w, h)
            cv.toBlob((blob) => {
              resolve(blob ? URL.createObjectURL(blob) : path)
            }, 'image/jpeg', 0.85)
          } catch (e) { resolve(path) }
        }
        img.onerror = () => resolve(path)
        img.src = path
      })
      // #endif
    },

    chooseFromAlbum() {
      // 连拍模式下相册可一次多选（最多选到 batchMax 张）
      const maxPick = this.batchMode ? (this.batchMax - this.batchImages.length) : 1
      uni.chooseImage({
        count: maxPick > 0 ? maxPick : 1,
        sourceType: ['album'],
        sizeType: ['compressed'],
        success: async (res) => {
          const raw = res.tempFilePaths || []
          // 先压缩再走识别流程（大图上传慢、弱网易失败）
          const paths = []
          for (const rp of raw) paths.push(await this.compressPath(rp))
          if (!this.batchMode) {
            this.imageSrc = paths[0]
            this.startRecognize()
            return
          }
          paths.forEach((p) => { if (this.batchImages.length < this.batchMax) this.batchImages.push(p) })
          this.afterAddBatch()
        },
        fail: (err) => {
          console.error('选图失败', err)
          uni.showToast({ title: '选择图片失败，请重试', icon: 'none' })
        }
      })
    },

    // 每次加图后：直接进入识别（拍满 3 张或只拍 1 张都一样）
    afterAddBatch() {
      const n = this.batchImages.length
      // 拍满 3 张才自动开始；否则留在拍照状态，让用户继续拍。
      // （之前写成一拍就识别，导致连拍模式根本连不起来）
      if (n >= this.batchMax) return this.startBatch()
      uni.showToast({ title: '已拍 ' + n + ' 张，可继续拍或点「开始识别」', icon: 'none', duration: 1500 })
    },

    // 删掉某一张
    removeBatchImage(i) {
      this.batchImages.splice(i, 1)
      if (!this.batchImages.length) this.imageSrc = ''
    },

    // 提前开始识别（没拍满也能识别）
    startBatch() {
      if (this.batchImages.length < 1) return uni.showToast({ title: '请先拍照', icon: 'none' })
      this.imageSrc = this.batchImages[0]
      this.startRecognize()
    },

    setMode(batch) {
      this.batchMode = !!batch
      this.batchImages = []
      this.imageSrc = ''
      this.result = null
      this.resultPreviews = []
    },

    async startRecognize() {
      // 未登录时限制免费次数（识别要消耗付费 AI 额度）
      if (!canRecognize()) {
        await promptLogin('recognize')
        // 关键：被拦下时清掉拍照流程的中间状态。
        // 否则 imageSrc 还留着，页面卡在「有图但没在识别也没结果」的中间态，
        // 虽然上传区现在有兜底会显示出来，但缩略图残留会让人以为还能点。
        this.isRecognizing = false
        this.result = null
        this.batchPhase = ''
        this.imageSrc = ''
        this.batchImages = []
        this.refreshGuestLeft()
        return
      }

      this.isRecognizing = true
      this.result = null
      this.batchPhase = ''

      try {
        let res
        if (this.batchMode && this.batchImages.length >= 2) {
          // 连拍：多张一起提交，后端逐张识别后合并结论
          this.batchPhase = '正在上传 ' + this.batchImages.length + ' 张照片...'
          res = await api.recognizeBatch(this.batchImages)
        } else {
          res = await api.recognize(this.imageSrc)
        }
        this.isRecognizing = false
        this.batchPhase = ''
        this.result = res.data
        // 保存本次照片的本地路径：/uploads 只有登录用户能访问，
        // 直接用服务器地址会出现「空白缩略图」
        this.resultPreviews = this.batchImages.slice()
        // 游客模式：成功识别一次就扣一次额度
        consumeOnce()
        this.refreshGuestLeft()
        this.saveToHistory()
      } catch (err) {
        this.isRecognizing = false
        this.batchPhase = ''
        console.error('识别失败:', err)
        uni.showToast({ title: err.message || '识别失败，请重试', icon: 'none' })
      }
    },

    async saveToHistory() {
      if (!this.result) return

      // 同时保存到本地存储（快速展示）和后端
      const id = Date.now()
      const now = new Date()
      const time = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`

      const record = {
        id,
        image: this.result.image || this.imageSrc,
        name: this.result.name,
        type: this.result.type,
        confidence: this.result.confidence,
        level: this.result.level,
        levelText: this.result.levelText,
        plantName: this.result.plantName || '',
        apiSource: this.result.apiSource || '',
        mode: this.result.mode || 'real',
        learned: this.result.learned || false,
        evidence: this.result.evidence || '',
        differentials: this.result.differentials || [],
        note: this.result.note || '',
        time,
        symptom: this.result.symptom,
        spread: this.result.spread,
        occurrence: this.result.occurrence,
        medicines: this.result.medicines,
        suggestions: this.result.suggestions,
        prevention: this.result.prevention
      }

      // 本地存储
      let historyList = uni.getStorageSync('historyList') || []
      historyList.unshift(record)
      if (historyList.length > 50) historyList = historyList.slice(0, 50)
      uni.setStorageSync('historyList', historyList)

      // 后端识别时已经写过历史记录（savedHistory=true），这里不再重复上报
      if (this.result && this.result.savedHistory) {
        record.historyId = this.result.historyId || null
        console.log('✅ 历史记录已由识别接口保存，id=' + record.historyId)
        return
      }

      // 兜底：识别接口没能保存（例如数据库异常）时，这里补一次
      try {
        await api.addHistory({
          diseaseName: this.result.name,
          imageUrl: this.result.image || '',
          confidence: this.result.confidence,
          level: this.result.level,
          levelText: this.result.levelText,
          symptom: this.result.symptom,
          spread: this.result.spread,
          occurrence: this.result.occurrence,
          medicines: this.result.medicines,
          suggestions: this.result.suggestions,
          prevention: this.result.prevention
        })
        console.log('✅ 历史记录已同步到后端')
      } catch (err) {
        console.error('历史记录同步失败（已保存到本地）:', err)
      }
    },

    openCorrect() {
      this.correctName = ''
      this.correcting = true
    },

    // 提交纠错：告诉后端 AI 判错了，正确的是什么
    async submitCorrect() {
      const name = String(this.correctName || '').trim()
      if (!name) return uni.showToast({ title: '请填写正确的病害名称', icon: 'none' })
      if (this.submittingCorrect) return
      this.submittingCorrect = true
      try {
        const res = await api.correctDiagnosis({
          historyId: this.result && this.result.historyId ? this.result.historyId : null,
          aiName: this.result ? this.result.name : '',
          correctName: name,
          plantName: this.result ? (this.result.plantName || '') : ''
        })
        // 页面同步显示纠正后的结果
        this.result.name = name
        this.result.corrected = true
        this.correcting = false

        // 本地缓存里的这条记录也一起改掉
        const list = uni.getStorageSync('historyList') || []
        if (list.length && this.result.historyId) {
          const idx = list.findIndex((x) => x.historyId === this.result.historyId)
          if (idx >= 0) { list[idx].name = name; list[idx].corrected = true; uni.setStorageSync('historyList', list) }
        }
        const dd = res.data || {}
        uni.showToast({
          title: dd.planGenerated ? '已纠正，并已生成防治方案入库' : (dd.learnedToLibrary ? '已纠正并收录知识库' : '已纠正'),
          icon: 'success'
        })
      } catch (e) {
        uni.showToast({ title: e.message || '提交失败', icon: 'none' })
      } finally {
        this.submittingCorrect = false
      }
    },

    resetUpload() {
      this.imageSrc = ''
      this.isRecognizing = false
      this.result = null
      this.batchImages = []
      this.resultPreviews = []
      this.batchPhase = ''
    },

    saveRecord() {
      uni.showToast({
        title: '记录已保存',
        icon: 'success',
        duration: 2000
      })
    }
  }
}
</script>
<style scoped>

/* ===== H5 摄像头弹窗 ===== */
.cam-mask {
  position: fixed;
  left: 0; right: 0; top: 0; bottom: 0;
  background: rgba(2, 6, 23, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  padding: 40rpx;
}
.cam-box {
  width: 100%;
  max-width: 720rpx;
  background: #0F172A;
  border-radius: 28rpx;
  overflow: hidden;
  border: 1rpx solid rgba(148, 163, 184, .25);
}
.cam-stage {
  width: 100%;
  height: 460rpx;
  background: #020617;
}
.cam-tip {
  padding: 24rpx 28rpx 0;
}
.cam-err {
  display: block;
  font-size: 25rpx;
  color: #FCA5A5;
  line-height: 1.6;
}
.cam-err-sub {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: #94A3B8;
}
.cam-actions {
  display: flex;
  gap: 20rpx;
  padding: 28rpx;
}
.cam-btn {
  flex: 1;
  height: 84rpx;
  line-height: 84rpx;
  text-align: center;
  border-radius: 42rpx;
  font-size: 28rpx;
  font-weight: 600;
}
.cam-btn.ghost { background: rgba(148, 163, 184, .18); color: #E2E8F0; }
.cam-btn.primary { background: linear-gradient(135deg, #34D399, #059669); color: #fff; }
.cam-btn.disabled { opacity: .4; }
.top-bar { display: flex; align-items: center; justify-content: space-between; padding: 24rpx 32rpx; }
.top-title { font-size: 34rpx; font-weight: 700; color: var(--t-strong); }
.top-placeholder { width: 64rpx; }

.upload-zone { padding: 0 32rpx; }
.drop-card {
  position: relative; background: #fff; border-radius: var(--r-xl);
  padding: 80rpx 48rpx 64rpx; text-align: center; overflow: hidden;
  box-shadow: var(--sh-card); border: 3rpx dashed #BBF7D0;
}
.drop-glow {
  position: absolute; left: 50%; top: -120rpx; transform: translateX(-50%);
  width: 420rpx; height: 420rpx; border-radius: 50%;
  background: radial-gradient(circle, rgba(16,185,129,0.14), transparent 70%);
}
.drop-title { display: block; font-size: 36rpx; font-weight: 700; color: var(--t-strong); }
.drop-desc { display: block; font-size: 25rpx; color: var(--t-sub); line-height: 1.7; margin-top: 16rpx; padding: 0 20rpx; }

.action-row { display: flex; gap: 20rpx; margin-top: 36rpx; }
.action-btn { flex: 1; height: 108rpx; border-radius: var(--r-lg); display: flex; flex-direction: column; align-items: center; justify-content: center; }
.action-btn.primary { background: linear-gradient(135deg, #34D399, #059669); box-shadow: var(--sh-float); }
.action-btn.primary .action-text { color: #fff; }
.action-btn.ghost { background: #fff; box-shadow: var(--sh-card); border: 2rpx solid var(--line); }
.action-text { font-size: 26rpx; font-weight: 600; margin-top: 8rpx; color: var(--t-main); }
.action-btn:active { transform: scale(0.97); }

.tips-card { margin-top: 40rpx; background: #fff; border-radius: var(--r-lg); padding: 36rpx 32rpx; box-shadow: var(--sh-card); }
.tips-head { display: flex; align-items: center; margin-bottom: 22rpx; }
.tips-title { font-size: 28rpx; font-weight: 700; color: var(--t-strong); }
.tip-line { display: flex; align-items: flex-start; margin-bottom: 18rpx; }
.tip-line:last-child { margin-bottom: 0; }
.tip-index {
  width: 36rpx; height: 36rpx; border-radius: 50%;
  background: var(--c-primary-soft); color: var(--c-primary-deep);
  font-size: 22rpx; font-weight: 700; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; margin-right: 16rpx;
}
.tip-text { flex: 1; font-size: 25rpx; color: var(--t-sub); line-height: 1.6; }

.preview-zone { padding: 0 32rpx; }
.preview-frame {
  position: relative; width: 100%; height: 520rpx; border-radius: var(--r-xl);
  overflow: hidden; box-shadow: var(--sh-card); background: #000;
}
.preview-frame.small { height: 400rpx; margin-bottom: 28rpx; }
.preview-img { width: 100%; height: 100%; }
.scan-mask {
  position: absolute; left: 0; right: 0; top: 0; bottom: 0;
  background: rgba(6, 95, 70, 0.28); display: flex; align-items: center; justify-content: center;
}
.scan-line {
  width: 88%; height: 6rpx; border-radius: 6rpx;
  background: linear-gradient(90deg, transparent, #6EE7B7, transparent);
  box-shadow: 0 0 30rpx 8rpx rgba(110, 231, 183, 0.8);
  animation: scanmove 2s ease-in-out infinite;
}
@keyframes scanmove { 0% { transform: translateY(-200rpx); } 50% { transform: translateY(200rpx); } 100% { transform: translateY(-200rpx); } }
.loading-card { display: flex; align-items: center; margin-top: 28rpx; padding: 32rpx; background: #fff; border-radius: var(--r-lg); box-shadow: var(--sh-card); }
.spinner { width: 56rpx; height: 56rpx; border-radius: 50%; border: 6rpx solid #D1FAE5; border-top-color: var(--c-primary); animation: spin 0.9s linear infinite; flex-shrink: 0; }
@keyframes spin { to { transform: rotate(360deg); } }
.loading-text { margin-left: 24rpx; display: flex; flex-direction: column; }
.loading-title { font-size: 30rpx; font-weight: 700; color: var(--t-strong); }
.loading-sub { font-size: 23rpx; color: var(--t-faint); margin-top: 8rpx; }

.result-zone { padding: 0 32rpx; }
.verdict-card { background: #fff; border-radius: var(--r-xl); padding: 36rpx 34rpx; box-shadow: var(--sh-card); border-left: 10rpx solid var(--c-primary); }
.verdict-card.warn { border-left-color: var(--c-accent); }
.verdict-top { display: flex; align-items: flex-start; justify-content: space-between; }
.verdict-main { flex: 1; display: flex; flex-direction: column; }
.verdict-name { font-size: 46rpx; font-weight: 800; color: var(--t-strong); line-height: 1.25; }
.verdict-plant { font-size: 24rpx; color: var(--c-primary-dark); margin-top: 10rpx; }
.score-ring {
  width: 116rpx; height: 116rpx; border-radius: 50%;
  background: linear-gradient(135deg, #ECFDF5, #D1FAE5);
  display: flex; align-items: baseline; justify-content: center;
  flex-shrink: 0; margin-left: 20rpx; padding-top: 34rpx;
}
.score-num { font-size: 42rpx; font-weight: 800; color: var(--c-primary-deep); }
.score-unit { font-size: 22rpx; color: var(--c-primary-dark); margin-left: 2rpx; }
.chip-row { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 24rpx; }
.chip-level-1 { background: #DCFCE7; color: #15803D; }
.chip-level-2 { background: #FEF3C7; color: #B45309; }
.chip-level-3 { background: #FEE2E2; color: #B91C1C; }
.verdict-note { font-size: 23rpx; color: var(--t-faint); margin-top: 20rpx; line-height: 1.6; }
.verdict-warn { margin-top: 20rpx; padding: 18rpx 22rpx; background: #FFFBEB; border-radius: var(--r-sm); font-size: 23rpx; color: #92400E; line-height: 1.6; }
.verdict-warn.danger { background: var(--c-danger-soft); color: #B91C1C; }
.verdict-ok { margin-top: 16rpx; padding: 14rpx 20rpx; background: var(--c-info-soft); border-radius: var(--r-sm); font-size: 22rpx; color: #1D4ED8; }

.info-card { margin-top: 24rpx; padding: 30rpx 32rpx; background: #fff; border-radius: var(--r-lg); box-shadow: var(--sh-card); }
.info-card.soft { background: #F8FAFC; box-shadow: none; }
.info-card.amber { background: #FFFBEB; border: 2rpx solid #FDE68A; box-shadow: none; }
.info-head { display: flex; align-items: center; margin-bottom: 16rpx; }
.info-title { font-size: 28rpx; font-weight: 700; color: var(--t-strong); }
.info-text { display: block; font-size: 26rpx; color: #475569; line-height: 1.75; }
.info-text.small { font-size: 23rpx; color: var(--t-faint); }
.diff-row { padding: 16rpx 0; border-bottom: 2rpx solid rgba(245, 158, 11, 0.18); }
.diff-row:last-child { border-bottom: none; padding-bottom: 0; }
.diff-name { display: block; font-size: 27rpx; font-weight: 700; color: #B45309; }
.diff-why { display: block; font-size: 23rpx; color: #78716C; line-height: 1.6; margin-top: 6rpx; }

.detail-list { margin-top: 24rpx; padding: 30rpx 32rpx; background: #fff; border-radius: var(--r-lg); box-shadow: var(--sh-card); }
.detail-block { margin-bottom: 28rpx; }
.detail-block:last-child { margin-bottom: 0; }
.med-card { display: flex; align-items: flex-start; padding: 22rpx; margin-bottom: 16rpx; background: #F8FAFC; border-radius: var(--r-md); }
.med-card:last-child { margin-bottom: 0; }
.med-idx {
  width: 44rpx; height: 44rpx; border-radius: 14rpx;
  background: var(--c-primary-soft); color: var(--c-primary-deep);
  font-size: 24rpx; font-weight: 700; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; margin-right: 20rpx;
}
.med-body { flex: 1; display: flex; flex-direction: column; }
.med-name { font-size: 28rpx; font-weight: 700; color: var(--t-strong); }
.med-usage { font-size: 23rpx; color: var(--t-sub); line-height: 1.65; margin-top: 8rpx; }
.bullet { display: flex; align-items: flex-start; margin-bottom: 16rpx; }
.bullet:last-child { margin-bottom: 0; }
.bullet-dot { color: var(--c-primary); font-size: 30rpx; margin-right: 14rpx; line-height: 1.4; }
.bullet-text { flex: 1; font-size: 26rpx; color: #475569; line-height: 1.7; }

.correct-card { margin-top: 24rpx; padding: 28rpx 32rpx; background: #fff; border-radius: var(--r-lg); box-shadow: var(--sh-card); border: 2rpx dashed #CBD5E1; }
.correct-head { display: flex; align-items: center; }
.correct-emoji { font-size: 40rpx; margin-right: 18rpx; }
.correct-texts { flex: 1; display: flex; flex-direction: column; }
.correct-title { font-size: 28rpx; font-weight: 700; color: var(--t-strong); }
.correct-sub { font-size: 22rpx; color: var(--t-faint); margin-top: 6rpx; }
.correct-arrow { font-size: 44rpx; color: #CBD5E1; }
.correct-form { margin-top: 24rpx; }
.correct-input { height: 88rpx; background: #F8FAFC; border: 2rpx solid var(--line); border-radius: var(--r-md); padding: 0 24rpx; font-size: 27rpx; }
.correct-actions { display: flex; justify-content: flex-end; gap: 16rpx; margin-top: 20rpx; }
.correct-btn { padding: 16rpx 40rpx; border-radius: var(--r-md); font-size: 26rpx; font-weight: 600; }
.correct-btn.cancel { background: #F1F5F9; color: var(--t-sub); }
.correct-btn.ok { background: linear-gradient(135deg, #34D399, #059669); color: #fff; }
.corrected-tip { display: block; margin-top: 18rpx; font-size: 25rpx; color: #15803D; font-weight: 600; }

.bottom-actions { display: flex; gap: 20rpx; margin-top: 32rpx; }
.btn-ghost, .btn-solid { flex: 1; height: 96rpx; border-radius: var(--r-lg); display: flex; align-items: center; justify-content: center; font-size: 29rpx; font-weight: 700; }
.btn-ghost { background: #fff; color: var(--t-main); box-shadow: var(--sh-card); }
.btn-solid { background: linear-gradient(135deg, #34D399, #059669); color: #fff; box-shadow: var(--sh-float); }
.btn-ghost:active, .btn-solid:active { transform: scale(0.98); }

/* ============ 连拍模式 ============ */
.mode-row { display: flex; gap: 20rpx; margin-bottom: 36rpx; }
.mode-item { flex: 1; padding: 30rpx 22rpx; border-radius: 20rpx; background: #FFFFFF; border: 4rpx solid #E2E8F0; display: flex; flex-direction: column; }
.mode-item.on { border-color: #10B981; background: #ECFDF5; }
.mode-title { font-size: 28rpx; font-weight: 700; color: #0F172A; }
.mode-sub { font-size: 22rpx; color: #94A3B8; margin-top: 6rpx; }
.mode-item.on .mode-sub { color: #059669; }

.thumbs { display: flex; flex-wrap: wrap; gap: 16rpx; margin-bottom: 24rpx; }
.thumb-item { position: relative; width: 150rpx; height: 150rpx; }
.thumb-img { width: 100%; height: 100%; border-radius: 16rpx; }
.thumb-del { position: absolute; top: -10rpx; right: -10rpx; width: 40rpx; height: 40rpx; border-radius: 50%; background: #EF4444; color: #fff; font-size: 24rpx; text-align: center; line-height: 40rpx; }
.thumb-no { position: absolute; bottom: 6rpx; left: 6rpx; padding: 2rpx 12rpx; border-radius: 99rpx; background: rgba(15,23,42,0.6); color: #fff; font-size: 20rpx; }
.thumb-add { width: 150rpx; height: 150rpx; border-radius: 16rpx; border: 4rpx dashed #CBD5E1; display: flex; align-items: center; justify-content: center; }
.thumb-add-icon { font-size: 48rpx; color: #94A3B8; }
.batch-go { margin-top: 24rpx; height: 96rpx; border-radius: 20rpx; background: linear-gradient(135deg, #34D399, #059669); display: flex; align-items: center; justify-content: center; box-shadow: 0 12rpx 32rpx rgba(16,185,129,0.25); }
.batch-go-text { color: #fff; font-size: 32rpx; font-weight: 700; }

.photo-strip { display: flex; gap: 16rpx; overflow-x: auto; padding: 8rpx 0 16rpx; }
.strip-item { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; }
.strip-img { width: 200rpx; height: 200rpx; border-radius: 20rpx; }
.strip-no { font-size: 22rpx; color: #94A3B8; margin-top: 8rpx; }

.photo-note { display: flex; align-items: flex-start; margin-bottom: 16rpx; }
.photo-note:last-child { margin-bottom: 0; }
.photo-note-idx { width: 40rpx; height: 40rpx; border-radius: 50%; background: #D1FAE5; color: #065F46; font-size: 22rpx; font-weight: 700; text-align: center; line-height: 40rpx; flex-shrink: 0; margin-right: 16rpx; }
.photo-note-text { flex: 1; font-size: 26rpx; color: #334155; line-height: 1.7; }


/* 游客剩余次数提示 */
.guest-tip { display: flex; align-items: center; justify-content: space-between; padding: 28rpx 32rpx; margin-bottom: 32rpx; border-radius: 20rpx; background: #ECFDF5; border: 2rpx solid #A7F3D0; }
.guest-tip-text { flex: 1; font-size: 26rpx; color: #065F46; }
.guest-tip-btn { font-size: 26rpx; font-weight: 700; color: #059669; padding-left: 20rpx; }


/* 识别失败提示：把原因讲清楚，而不是只给一句「识别失败」 */
.verdict-fail {
  margin-top: 20rpx;
  padding: 24rpx 26rpx;
  border-radius: 18rpx;
  background: #FEF2F2;
  border-left: 8rpx solid #EF4444;
}
.fail-title { display: block; font-size: 28rpx; font-weight: 700; color: #B91C1C; margin-bottom: 10rpx; }
.fail-reason { display: block; font-size: 26rpx; color: #7F1D1D; line-height: 1.7; }
.fail-tip { display: block; font-size: 24rpx; color: #991B1B; opacity: .8; line-height: 1.6; margin-top: 12rpx; }

  /* ===== 图标（替换 emoji）===== */
  .drop-img { width: 124rpx; height: 124rpx; margin-bottom: 26rpx; position: relative; }
  .mode-head { display: flex; align-items: center; gap: 10rpx; margin-bottom: 8rpx; }
  .mode-icon { width: 32rpx; height: 32rpx; flex-shrink: 0; }
  .action-icon { width: 38rpx; height: 38rpx; }
  .tips-icon { width: 34rpx; height: 34rpx; margin-right: 12rpx; flex-shrink: 0; }
  .correct-icon { width: 30rpx; height: 30rpx; }

  /* 结果区小标题：色条代替 emoji */
  .info-head { position: relative; padding-left: 18rpx; }
  .info-head::before {
    content: ''; position: absolute; left: 0; top: 50%; transform: translateY(-50%);
    width: 6rpx; height: 26rpx; border-radius: 3rpx; background: var(--c-primary, #10B981);
  }


  /* 实时监测入口 */
  .realtime-entry {
    display: flex; align-items: center; gap: 18rpx;
    margin: 0 0 20rpx; padding: 24rpx 26rpx; border-radius: var(--r-lg, 28rpx);
    background: linear-gradient(135deg, #065F46, #059669);
    box-shadow: 0 10rpx 28rpx rgba(5, 150, 105, .28);
  }
  .realtime-entry:active { transform: scale(.99); }
  .realtime-icon { width: 44rpx; height: 44rpx; flex-shrink: 0; filter: brightness(0) invert(1); }
  .realtime-texts { flex: 1; display: flex; flex-direction: column; }
  .realtime-title { font-size: 29rpx; font-weight: 700; color: #fff; }
  .realtime-sub { font-size: 22rpx; color: rgba(255, 255, 255, .82); margin-top: 6rpx; }
  .realtime-arrow { font-size: 40rpx; color: rgba(255, 255, 255, .7); }
</style>
