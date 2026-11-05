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

      <text class="agree-note">
        登录即表示同意
        <text class="agree-link" @click.stop="openDoc('agreement')">《用户协议》</text>
        与
        <text class="agree-link" @click.stop="openDoc('privacy')">《隐私政策》</text>
      </text>

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
    </view>

    <text class="copyright">禾诊 · 智能病虫害识别系统 · 2026</text>
  </view>
</template>

<script>
import { api } from '@/utils/api.js'

export default {
  data() {
    return {
      wxLoading: false, 
      username: "", 
      password: "",
      loading: false
    }
  },
  methods: {
    // 微信小程序一键登录
    loginByWechat() {
      if (this.wxLoading) return
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


    // 打开用户协议 / 隐私政策
    openDoc(kind) {
      uni.navigateTo({
        url: kind === 'privacy' ? '/pages/privacy/privacy' : '/pages/agreement/agreement',
        fail: (e) => uni.showToast({ title: '打开失败：' + (e.errMsg || ''), icon: 'none' })
      })
    },

    async login() {
      if (this.loading) return
      
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
