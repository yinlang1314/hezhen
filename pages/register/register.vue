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
      <text class="brand-title">创建账号</text>
      <text class="brand-sub">加入农业智能防治平台</text>
      <view class="brand-feats">
        <view class="feat"><image class="feat-img" src="/static/icons/line-diagnose.png" mode="aspectFit" /><text class="feat-text">AI 诊断</text></view>
        <view class="feat-dot"></view>
        <view class="feat"><image class="feat-img" src="/static/icons/line-book.png" mode="aspectFit" /><text class="feat-text">病害百科</text></view>
        <view class="feat-dot"></view>
        <view class="feat"><image class="feat-img" src="/static/icons/line-shield.png" mode="aspectFit" /><text class="feat-text">防治方案</text></view>
      </view>
    </view>

    <!-- 注册卡片 -->
    <view class="auth-card">
      <text class="card-title">新用户注册</text>
      <text class="card-sub">填写以下信息即可开始使用</text>

      <view class="field">
        <image class="field-icon" src="/static/icons/line-user.png" mode="aspectFit" />
        <input class="field-input" v-model="username" placeholder="请输入账号（4-20位）" placeholder-class="ph" maxlength="20" />
      </view>
      <text class="field-hint" v-if="username && username.length < 4">账号太短，建议至少 4 位</text>

      <view class="field">
        <image class="field-icon" src="/static/icons/line-lock.png" mode="aspectFit" />
        <input class="field-input" v-model="password" placeholder="请输入密码（至少6位）" placeholder-class="ph" password />
      </view>

      <!-- 密码强度 -->
      <view class="strength" v-if="password">
        <view class="strength-bar" :class="strengthLevel >= 1 ? 'on-' + strengthLevel : ''"></view>
        <view class="strength-bar" :class="strengthLevel >= 2 ? 'on-' + strengthLevel : ''"></view>
        <view class="strength-bar" :class="strengthLevel >= 3 ? 'on-' + strengthLevel : ''"></view>
        <text class="strength-text">{{ strengthText }}</text>
      </view>

      <view class="field">
        <image class="field-icon" src="/static/icons/line-check.png" mode="aspectFit" />
        <input class="field-input" v-model="password2" placeholder="请再次输入密码" placeholder-class="ph" password />
      </view>
      <text class="field-hint" v-if="password2 && password !== password2">两次输入的密码不一致</text>

      <!-- 协议 -->
      <view class="agree-row" @click="agreed = !agreed">
        <view class="agree-box" :class="{ checked: agreed }">{{ agreed ? '✓' : '' }}</view>
        <text class="agree-text">我已阅读并同意
            <text class="agree-link" @click.stop="openDoc('agreement')">《用户协议》</text> 与
            <text class="agree-link" @click.stop="openDoc('privacy')">《隐私政策》</text>
          </text>
      </view>

      <view class="auth-btn" :class="{ disabled: loading }" @click="register">
        <view class="spinner" v-if="loading"></view>
        <text class="auth-btn-text">{{ loading ? '注册中...' : '注 册' }}</text>
      </view>

      <view class="card-foot">
        <text class="foot-text">已有账号？</text>
        <text class="foot-link" @click="goBack">返回登录</text>
      </view>
    </view>

    <text class="copyright">禾诊 · 智能病虫害识别系统 · 2026</text>
  </view>
</template>

<style>
@import '@/styles/auth.css';
</style>

<script>
import { api } from '@/utils/api.js'
import { safeBack } from '@/utils/nav.js'

export default {
  data() {
    return {
      username: "",
      password: "",
      password2: "",
      agreed: false,
      loading: false
    }
  },
  computed: {
    // 密码强度：长度 + 字符种类
    strengthLevel() {
      const p = this.password || ''
      if (p.length < 6) return 1
      let kinds = 0
      if (/[a-z]/.test(p)) kinds++
      if (/[A-Z]/.test(p)) kinds++
      if (/[0-9]/.test(p)) kinds++
      if (/[^A-Za-z0-9]/.test(p)) kinds++
      if (p.length >= 10 && kinds >= 2) return 3
      if (kinds >= 2) return 3
      if (kinds === 1) return 2
      return 1
    },
    strengthText() {
      return ['太短', '偏弱', '一般', '较强'][this.strengthLevel] || '偏弱'
    }
  },
  methods: {
    async register() {
      if (this.loading) return

      const username = this.username.trim()
      const password = this.password.trim()
      const password2 = this.password2.trim()

      if (!username || !password || !password2) {
        return uni.showToast({ title: '请完整填写所有字段', icon: 'none' })
      }
      if (username.length < 4) {
        return uni.showToast({ title: '账号至少 4 位', icon: 'none' })
      }
      if (password.length < 6) {
        return uni.showToast({ title: '密码长度不能少于6位', icon: 'none' })
      }
      if (password !== password2) {
        return uni.showToast({ title: '两次输入的密码不一致', icon: 'none' })
      }
      if (!this.agreed) {
        return uni.showToast({ title: '请先同意用户协议', icon: 'none' })
      }

      this.loading = true
      uni.showLoading({ title: '注册中...', mask: true })

      try {
        await api.register({ username, password })
        uni.hideLoading()
        uni.showToast({ title: '注册成功，请登录', icon: 'success' })
        setTimeout(() => safeBack(), 900)
      } catch (err) {
        uni.hideLoading()
        console.error('注册失败:', err)
        uni.showToast({ title: err.message || '网络异常，请检查连接', icon: 'none' })
      } finally {
        this.loading = false
      }
    },
    goBack() {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        uni.navigateBack()
      } else {
        uni.reLaunch({ url: '/pages/login/login' })
      }
    }
  }
}
</script>
