<template>
  <view class="auth-page">
    <!-- 背景装饰 -->
    <view class="bg-blob b1"></view>
    <view class="bg-blob b2"></view>
    <view class="bg-blob b3"></view>

    <!-- 品牌区 -->
    <view class="brand">
      <view class="brand-logo">
        <image class="brand-img" src="/static/icons/brand-logo.png" mode="aspectFit" />
      </view>
      <text class="brand-title">禾诊</text>
      <text class="brand-sub">禾诊 · 智能病虫害识别系统</text>
      <view class="brand-feats">
        <view class="feat">
          <image class="feat-img" src="/static/icons/line-diagnose.png" mode="aspectFit" />
          <text class="feat-text">AI 诊断</text>
        </view>
        <view class="feat-dot"></view>
        <view class="feat">
          <image class="feat-img" src="/static/icons/line-book.png" mode="aspectFit" />
          <text class="feat-text">病害百科</text>
        </view>
        <view class="feat-dot"></view>
        <view class="feat">
          <image class="feat-img" src="/static/icons/line-shield.png" mode="aspectFit" />
          <text class="feat-text">防治方案</text>
        </view>
      </view>
    </view>

    <!-- 登录卡片 -->
    <view class="auth-card">
      <text class="card-title">欢迎回来</text>
      <text class="card-sub">登录后即可开始识别</text>

      <view class="field">
        <image class="field-icon" src="/static/icons/line-user.png" mode="aspectFit" />
        <input class="field-input" v-model="username" placeholder="请输入账号" placeholder-class="ph" />
      </view>
      <view class="field">
        <image class="field-icon" src="/static/icons/line-lock.png" mode="aspectFit" />
        <input class="field-input" v-model="password" placeholder="请输入密码" placeholder-class="ph" password />
      </view>

      <view class="auth-btn" :class="{ disabled: loading }" @click="login">
        <view class="spinner" v-if="loading"></view>
        <text class="auth-btn-text">{{ loading ? '登录中...' : '登 录' }}</text>
      </view>

      <view class="agree-row" @click="agreed = !agreed">
        <view class="agree-box" :class="{ checked: agreed }">{{ agreed ? '✓' : '' }}</view>
        <text class="agree-text">我已阅读并同意
          <text class="agree-link" @click.stop="openDoc('agreement')">《用户协议》</text>
          与
          <text class="agree-link" @click.stop="openDoc('privacy')">《隐私政策》</text>
        </text>
      </view>

      <!-- #ifdef MP-WEIXIN -->
      <view class="wx-btn" @click="loginByWechat">
        <text class="wx-icon">微</text>
        <text class="wx-text">{{ wxLoading ? '登录中…' : '微信一键登录' }}</text>
      </view>
      <text class="wx-tip">首次使用会自动创建账号，无需记忆密码</text>
      <!-- #endif -->

      <view class="card-foot">
        <text class="foot-text">还没有账号？</text>
        <text class="foot-link" @click="goRegister">立即注册</text>
      </view>

      <!-- 后端地址：换电脑/换网络连不上时，不用登录也能改 -->
      <view class="srv-link" @click="showServer = !showServer">
        服务器：{{ serverShort }} · {{ showServer ? '收起' : '修改' }}
      </view>
      <view class="srv-form" v-if="showServer">
        <input class="srv-input" v-model="serverInput" placeholder="例如 http://192.168.1.5:3000" />
        <view class="srv-row">
          <view class="srv-btn ghost" @click="resetServer">恢复默认</view>
          <view class="srv-btn" @click="saveServer">{{ savingServer ? '测试中…' : '保存并测试' }}</view>
        </view>
        <text class="srv-tip">填后端电脑的局域网地址（带 :3000）。电脑 IP 变了就要改这里。</text>
      </view>
    </view>

    <text class="copyright">禾诊 · 智能病虫害识别系统 · 2026</text>
  </view>
</template>

<script>
import { api } from '@/utils/api.js'
import { currentBackendUrl, setBackendUrl } from '@/utils/config.js'

export default {
  data() {
    return {
      wxLoading: false,
      username: "",
      password: "",
      loading: false,
      agreed: false,
      showServer: false,
      serverInput: "",
      serverUrl: "",
      savingServer: false
    }
  },
  computed: {
    // 底部只显示主机+端口，太长会换行
    serverShort() {
      return this.readableServer(this.serverUrl).replace(/^https?:\/\//, '')
    }
  },
  onLoad() {
    this.serverUrl = this.readableServer(currentBackendUrl())
    this.serverInput = this.serverUrl
  },
  methods: {
    // H5 里页面跑在 5173/5178，后端在 3000；别把前端端口当后端地址显示
    readableServer(raw) {
      let u = String(raw || '')
      // #ifdef H5
      u = u.replace(/:(5173|5178|80)(\/?)$/, ':3000')
      // #endif
      return u
    },

    // 微信小程序一键登录
    loginByWechat() {
      if (this.wxLoading) return
      if (!this.agreed) {
        return uni.showToast({ title: '请先阅读并同意用户协议和隐私政策', icon: 'none' })
      }
      this.wxLoading = true
      uni.login({
        provider: 'weixin',
        success: async (r) => {
          if (!r.code) {
            this.wxLoading = false
            return uni.showToast({ title: '微信未返回登录凭证', icon: 'none' })
          }
          try {
            const res = await api.wxLogin(r.code)
            if (res.code !== 200) throw new Error(res.message || '登录失败')
            const { token, userInfo, isNew } = res.data || {}
            uni.setStorageSync('token', token)
            if (userInfo) uni.setStorageSync('userInfo', userInfo)
            uni.showToast({ title: isNew ? '注册成功' : '登录成功', icon: 'success' })
            setTimeout(() => uni.reLaunch({ url: '/pages/index/index' }), 800)
          } catch (e) {
            uni.showToast({ title: (e && e.message) || '微信登录失败', icon: 'none' })
          } finally {
            this.wxLoading = false
          }
        },
        fail: () => {
          this.wxLoading = false
          uni.showToast({ title: '微信登录未授权', icon: 'none' })
        }
      })
    },


    // 保存后端地址：先测试 /api/health，再写入 storage
    async saveServer() {
      if (this.savingServer) return
      const url = String(this.serverInput || '').trim().replace(/\/+$/, '')
      if (url && !/^https?:\/\/[^/]+/i.test(url)) {
        return uni.showToast({ title: '地址要以 http:// 或 https:// 开头', icon: 'none' })
      }
      this.savingServer = true
      try {
        const finalUrl = setBackendUrl(url)
        this.serverUrl = finalUrl
        this.serverInput = finalUrl
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
        uni.showToast({
          title: ok ? '已保存，连接正常' : '已保存，但连不上后端',
          icon: ok ? 'success' : 'none'
        })
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

    // 打开用户协议 / 隐私政策
    openDoc(kind) {
      uni.navigateTo({
        url: kind === 'privacy' ? '/pages/privacy/privacy' : '/pages/agreement/agreement',
        fail: (e) => uni.showToast({ title: '打开失败：' + (e.errMsg || ''), icon: 'none' })
      })
    },

    async login() {
      if (this.loading) return
      if (!this.agreed) {
        return uni.showToast({ title: '请先阅读并同意用户协议和隐私政策', icon: 'none' })
      }
      
      const username = this.username.trim()
      const password = this.password.trim()
      
      if (!username || !password) {
        return uni.showToast({ title: '账号密码不能为空', icon: 'none' })
      }

      this.loading = true
      uni.showLoading({ title: '登录中...', mask: true })
      
      try {
        const res = await api.login({ username, password })

        uni.hideLoading()
        const { token, userInfo } = res.data
        uni.setStorageSync('token', token)
        if (userInfo) {
          uni.setStorageSync('userInfo', userInfo)
        }
        
        uni.showToast({ title: '登录成功', icon: 'success' })
        setTimeout(() => {
          uni.reLaunch({ url: '/pages/index/index' })
        }, 800)
      } catch (err) {
        uni.hideLoading()
        console.error('登录失败:', err)
        uni.showToast({ title: err.message || '网络异常，请检查连接', icon: 'none' })
      } finally {
        this.loading = false
      }
    },
    goRegister() {
      uni.navigateTo({ url: '/pages/register/register' })
    }
  }
}
</script>
<style>
@import '@/styles/auth.css';
</style>
