<template>
  <view class="page-wrap container">
    <NavBar title="系统设置" />

    <!-- 账号安全 -->
    <view class="group-title">账号安全</view>
    <view class="setting-list">
      <view class="setting-item" @click="openPwd">
        <text class="setting-label">修改密码</text>
        <text class="setting-value" v-if="!pwdChanged">建议修改</text>
        <text class="setting-arrow">›</text>
      </view>
    </view>
    <view class="pwd-form" v-if="showPwd">
      <input class="pwd-input" v-model="oldPwd" placeholder="当前密码" password />
      <input class="pwd-input" v-model="newPwd" placeholder="新密码（至少6位）" password />
      <input class="pwd-input" v-model="newPwd2" placeholder="确认新密码" password />
      <view class="pwd-actions">
        <view class="pwd-btn cancel" @click="showPwd = false">取消</view>
        <view class="pwd-btn ok" @click="submitPwd">{{ savingPwd ? '提交中...' : '确认修改' }}</view>
      </view>
      <text class="pwd-tip">修改后请用新密码登录。如果这个账号是管理员，同一个密码也能登录管理后台。</text>
    </view>

    <view class="group-title">关于</view>
    <view class="setting-list">
      <view class="setting-item" @click="openDoc('agreement')">
        <text class="setting-label">用户协议</text>
        <text class="setting-arrow">›</text>
      </view>

      <view class="setting-item" @click="openDoc('privacy')">
        <text class="setting-label">隐私政策</text>
        <text class="setting-arrow">›</text>
      </view>

      <view class="setting-item" @click="checkUpdate">
        <text class="setting-label">{{ checking ? '正在检查…' : '检查更新' }}</text>
        <text class="setting-value">v{{ appVersion || '—' }}</text>
        <text class="setting-arrow">›</text>
      </view>
    </view>

    <view class="group-title">服务器连接</view>
    <view class="setting-list">
      <view class="setting-item" @click="toggleServer">
        <text class="setting-label">后端地址</text>
        <text class="setting-value">{{ serverUrl || '默认（编译时地址）' }}</text>
        <text class="setting-arrow">›</text>
      </view>
    </view>
    <view class="pwd-form" v-if="showServer">
      <input class="pwd-input" v-model="serverInput" placeholder="例如 http://192.168.1.5:3000" />
      <view class="pwd-actions">
        <view class="pwd-btn cancel" @click="resetServer">恢复默认</view>
        <view class="pwd-btn ok" @click="saveServer">{{ savingServer ? '测试中...' : '保存并测试' }}</view>
      </view>
      <text class="pwd-tip">填后端所在电脑/服务器的地址（带端口）。保存后立即生效，识别、百科、登录都会走新地址。留空保存＝恢复默认。</text>
    </view>

    <view class="group-title">通用</view>
    <view class="setting-list">
      <view class="setting-item" @click="clearCache">
        <text class="setting-label">清除缓存</text>
        <text class="setting-value">{{ cacheSize }}</text>
      </view>

      <view class="setting-item">
        <text class="setting-label">自动保存识别记录</text>
        <switch :checked="autoSave" @change="toggleAutoSave" color="#2ECC71"></switch>
      </view>

      <view class="setting-item" @click="goToProfileEdit">
        <text class="setting-label">编辑个人资料</text>
        <text class="setting-arrow">›</text>
      </view>

      <view class="setting-item" @click="checkUpdate">
        <text class="setting-label">检查更新</text>
        <text class="setting-arrow">›</text>
      </view>

      <view class="setting-item" @click="about">
        <text class="setting-label">关于我们</text>
        <text class="setting-arrow">›</text>
      </view>
    </view>
  </view>
</template>

<script>
import { api } from '@/utils/api.js'
import { currentBackendUrl, setBackendUrl } from '@/utils/config.js'
import NavBar from '@/components/NavBar.vue'

export default {
  components: { NavBar },
  data() {
    return {
      checking: false,
      appVersion: '',
      autoSave: true,
      cacheSize: '计算中...',
      showPwd: false,
      oldPwd: '',
      newPwd: '',
      newPwd2: '',
      savingPwd: false,
      pwdChanged: true,
      showServer: false,
      serverUrl: '',
      serverInput: '',
      savingServer: false
    }
  },
  onLoad() {
    try { this.appVersion = uni.getSystemInfoSync().appVersion || '' } catch (e) {}
    
// 读取本地设置
    this.autoSave = uni.getStorageSync('autoSave') !== false
    this.getCacheSize()
    const info = uni.getStorageSync('userInfo') || {}
    this.pwdChanged = info.pwdChanged !== false
    this.serverUrl = currentBackendUrl() || ''
    this.serverInput = this.serverUrl
  },
  onShow() {
    // 使用 token 进行安全校验
      },
  methods: {
    // 打开用户协议 / 隐私政策
    openDoc(kind) {
      uni.navigateTo({
        url: kind === 'privacy' ? '/pages/privacy/privacy' : '/pages/agreement/agreement',
        fail: (e) => uni.showToast({ title: '打开失败：' + (e.errMsg || ''), icon: 'none' })
      })
    },

    // 检查更新：比对后端版本号和本地版本号
    async checkUpdate() {
      if (this.checking) return
      this.checking = true
      try {
        const res = await api.getVersion()
        const latest = (res && res.data && res.data.android) || {}
        const sys = uni.getSystemInfoSync()
        const localCode = Number(sys.appVersionCode || 0)
        const latestCode = Number(latest.versionCode || 0)

        // #ifndef APP-PLUS
        uni.showModal({
          title: '当前版本',
          content: '网页版 / 小程序随服务器更新，无需单独安装。最新 Android 版本：' + (latest.versionName || '—'),
          showCancel: false
        })
        return
        // #endif

        if (latestCode && latestCode > localCode) {
          uni.showModal({
            title: '发现新版本 ' + (latest.versionName || ''),
            content: (latest.notes || '') + '\n\n是否下载安装？',
            confirmText: '去下载',
            success: (r) => {
              if (r.confirm && latest.url) {
                // 用系统浏览器打开下载页
                plus.runtime.openURL(latest.url)
              }
            }
          })
        } else {
          uni.showToast({ title: '已是最新版本', icon: 'success' })
        }
      } catch (e) {
        uni.showToast({ title: '检查失败，请确认后端已启动', icon: 'none' })
      } finally {
        this.checking = false
      }
    },

    openPwd() {
      this.showPwd = !this.showPwd
      this.oldPwd = ''
      this.newPwd = ''
      this.newPwd2 = ''
    },

    // 修改密码：由后端校验当前密码并加密存储
    async submitPwd() {
      if (this.savingPwd) return
      if (!this.oldPwd || !this.newPwd) return uni.showToast({ title: '请填写完整', icon: 'none' })
      if (this.newPwd.length < 6) return uni.showToast({ title: '新密码不能少于6位', icon: 'none' })
      if (this.newPwd !== this.newPwd2) return uni.showToast({ title: '两次输入的新密码不一致', icon: 'none' })
      if (this.newPwd === this.oldPwd) return uni.showToast({ title: '新密码不能与旧密码相同', icon: 'none' })

      this.savingPwd = true
      try {
        await api.changePassword({ oldPassword: this.oldPwd, newPassword: this.newPwd })
        this.showPwd = false
        this.pwdChanged = true
        const info = uni.getStorageSync('userInfo') || {}
        uni.setStorageSync('userInfo', Object.assign({}, info, { pwdChanged: true }))
        uni.showToast({ title: '密码已修改', icon: 'success' })
      } catch (e) {
        uni.showToast({ title: e.message || '修改失败', icon: 'none' })
      } finally {
        this.savingPwd = false
      }
    },

    // ---------- 服务器地址 ----------
    toggleServer() {
      this.showServer = !this.showServer
      this.serverInput = this.serverUrl
    },

    normalizeServer(v) {
      let s = String(v || '').trim()
      if (!s) return ''
      if (!/^https?:\/\//i.test(s)) s = 'http://' + s
      return s.replace(/\/+$/, '')
    },

    async saveServer() {
      if (this.savingServer) return
      const url = this.normalizeServer(this.serverInput)
      if (url && !/^https?:\/\/[^/:]+(:\d+)?$/i.test(url) && !/^https?:\/\/[^/]+\.[^/]+/i.test(url)) {
        return uni.showToast({ title: '地址格式不对', icon: 'none' })
      }
      this.savingServer = true
      try {
        const finalUrl = setBackendUrl(url)
        this.serverUrl = finalUrl
        // 测试连通性
        const ok = await new Promise((resolve) => {
          uni.request({
            url: finalUrl + '/api/health',
            method: 'GET',
            timeout: 6000,
            success: (res) => resolve(res.statusCode === 200),
            fail: () => resolve(false)
          })
        })
        this.showServer = false
        uni.showToast({ title: ok ? '已保存，连接正常' : '已保存，但连不上后端', icon: ok ? 'success' : 'none' })
      } catch (e) {
        uni.showToast({ title: e.message || '保存失败', icon: 'none' })
      } finally {
        this.savingServer = false
      }
    },

    resetServer() {
      const def = setBackendUrl('')
      this.serverUrl = def
      this.serverInput = def
      this.showServer = false
      uni.showToast({ title: '已恢复默认地址', icon: 'none' })
    },

    // 获取缓存大小（近似）
    getCacheSize() {
      try {
        const res = uni.getStorageInfoSync()
        const size = res.currentSize
        if (size < 1024) {
          this.cacheSize = size + ' KB'
        } else {
          this.cacheSize = (size / 1024).toFixed(2) + ' MB'
        }
      } catch (err) {
        this.cacheSize = '未知'
      }
    },

    clearCache() {
      uni.showModal({
        title: '确认清除',
        content: '确定要清除所有缓存数据吗？（登录状态会丢失）',
        success: (res) => {
          if (res.confirm) {
            // 保留 token，清除其他所有缓存
            const token = uni.getStorageSync('token')
            uni.clearStorageSync()
            if (token) {
              uni.setStorageSync('token', token)
            }
            // 重新获取缓存大小
            this.getCacheSize()
            uni.showToast({ title: '缓存已清除', icon: 'success' })
          }
        }
      })
    },

    toggleAutoSave(e) {
      this.autoSave = e.detail.value
      uni.setStorageSync('autoSave', this.autoSave)
      uni.showToast({ title: '设置已保存', icon: 'success', duration: 1000 })
    },

    // 跳转到编辑资料页
    goToProfileEdit() {
      uni.navigateTo({ url: '/pages/profile-edit/profile-edit' })
    },

    // 检查更新（逻辑可扩展为真实版本检测）
    checkUpdate() {
      uni.showToast({ title: '当前已是最新版本', icon: 'none' })
    },

    // 关于我们（可跳转到新页面）
    about() {
      uni.showModal({
        title: '关于',
        content: '禾诊 智能病虫害识别系统 v1.0\n基于深度学习的农业病虫害识别',
        showCancel: false
      })
    }
  }
}
</script>

<style>
.group-title {
  font-size: 24rpx; color: #94A3B8; font-weight: 600;
  padding: 28rpx 40rpx 12rpx; letter-spacing: 1rpx;
}
.pwd-form {
  margin: 0 32rpx 8rpx; padding: 28rpx 30rpx;
  background: #fff; border-radius: var(--r-lg); box-shadow: var(--sh-card);
}
.pwd-input {
  height: 88rpx; background: #F8FAFC; border: 2rpx solid #EEF2F6;
  border-radius: 16rpx; padding: 0 22rpx; font-size: 27rpx; margin-bottom: 16rpx;
}
.pwd-actions { display: flex; justify-content: flex-end; gap: 16rpx; margin-top: 8rpx; }
.pwd-btn { padding: 16rpx 38rpx; border-radius: 16rpx; font-size: 26rpx; font-weight: 600; }
.pwd-btn.cancel { background: #F1F5F9; color: #64748B; }
.pwd-btn.ok { background: linear-gradient(135deg, #34D399, #059669); color: #fff; }
.pwd-tip { display: block; margin-top: 16rpx; font-size: 21rpx; color: #94A3B8; line-height: 1.6; }
 scoped>
.container {
  background-color: #F8FAFC;
  min-height: 100%;
}

.navbar {
  display: flex;
  align-items: center;
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
}

.setting-list {
  padding: 48rpx;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32rpx;
  background-color: #FFFFFF;
  border-radius: 24rpx;
  margin-bottom: 24rpx;
  transition: background-color 0.2s;
}

.setting-item:active {
  background-color: #F5F5F5;
}

.setting-label {
  font-size: 32rpx;
  color: #333333;
}

.setting-value {
  font-size: 28rpx;
  color: #666666;
}

.setting-arrow {
  font-size: 40rpx;
  color: #CCCCCC;
}

.picker-text {
  font-size: 28rpx;
  color: #666666;
  padding: 16rpx 24rpx;
  background-color: #F8FAFC;
  border-radius: 16rpx;
}

/* ==================== UI 重设计覆盖样式 ==================== */
.navbar {
  display: flex !important; align-items: center !important; justify-content: space-between !important;
  padding: 24rpx 32rpx !important;
  background: transparent !important; box-shadow: none !important;
  position: static !important;
}
.navbar-title { font-size: 34rpx !important; font-weight: 700 !important; color: var(--t-strong) !important; flex: 1; text-align: center; }
.navbar-left { display: flex; align-items: center; }
.navbar-right { min-width: 120rpx; display: flex; justify-content: flex-end; align-items: center; }
.card {
  border-radius: var(--r-lg) !important;
  background: #fff !important;
  box-shadow: var(--sh-card) !important;
  border: none !important;
}
.tag {
  border-radius: 999rpx !important;
  padding: 5rpx 16rpx !important;
  font-size: 21rpx !important;
  font-weight: 600 !important;
}
</style>