<template>
  <view class="page-wrap container">
    <NavBar title="编辑资料">
      <template #right>
        <text class="save-btn" @click="saveProfile">保存</text>
      </template>
    </NavBar>

    <view class="profile-box">
      <!-- 头像 -->
      <view class="profile-item" @click="chooseAvatar">
        <text class="label">头像</text>
        <view class="avatar-box">
          <image class="avatar" :src="avatarUrl" mode="aspectFill"></image>
          <text class="hint">点击更换</text>
        </view>
      </view>

      <!-- 昵称 -->
      <view class="profile-item">
        <text class="label">昵称</text>
        <input class="input" v-model="nickname" placeholder="请输入昵称" maxlength="20" />
      </view>

      <!-- 性别 -->
      <view class="profile-item">
        <text class="label">性别</text>
        <picker :range="genderList" :value="genderIndex" @change="onGenderChange">
          <view class="picker-box">{{ genderList[genderIndex] }}</view>
        </picker>
      </view>

      <!-- 简介 -->
      <view class="profile-item">
        <text class="label">个人简介</text>
        <textarea class="textarea" v-model="desc" placeholder="介绍一下自己吧..." maxlength="100" auto-height></textarea>
      </view>
    </view>
  </view>
</template>

<script>
import { api } from '@/utils/api.js'
import { safeBack } from '@/utils/nav.js'
import { imageUrl } from '@/utils/config.js'
import NavBar from '@/components/NavBar.vue'

export default {
  components: { NavBar },
  data() {
    return {
      avatarUrl: '/static/default-avatar.png',
      nickname: '',
      genderList: ['男', '女', '保密'],
      genderIndex: 0,
      desc: '',
      saving: false,
      uploading: false
    }
  },

  onShow() {
// 安全的登录校验
        // 先用本地缓存立即渲染，再从后端拉最新资料覆盖
    const info = uni.getStorageSync('userProfile') || {}
    if (info.avatarUrl) this.avatarUrl = info.avatarUrl
    if (info.nickname) this.nickname = info.nickname
    if (info.genderIndex !== undefined) this.genderIndex = info.genderIndex
    if (info.desc) this.desc = info.desc
    this.loadFromBackend()
  },

  methods: {
    // 从后端读取资料（昵称/头像已存在数据库里，换设备也能看到）
    async loadFromBackend() {
      try {
        const res = await api.getUserInfo()
        const d = (res && res.data) || {}
        if (d.nickname) this.nickname = d.nickname
        if (d.avatar) this.avatarUrl = imageUrl(d.avatar)
      } catch (e) {
        console.warn('读取后端资料失败，沿用本地缓存:', e)
      }
    },

    // 选头像并上传到后端，拿到可持久保存的地址
    chooseAvatar() {
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        success: async (res) => {
          const tempPath = res.tempFilePaths[0]
          this.avatarUrl = tempPath            // 先本地预览，上传成功后再换成服务器地址
          this.uploading = true
          uni.showLoading({ title: '上传中...', mask: true })
          try {
            const up = await api.uploadImage(tempPath)
            const url = up && up.data && up.data.url
            if (url) {
              this.avatarUrl = imageUrl(url)
              uni.hideLoading()
              uni.showToast({ title: '头像已上传', icon: 'success' })
            } else {
              throw new Error('上传返回异常')
            }
          } catch (e) {
            uni.hideLoading()
            uni.showToast({ title: '上传失败，仅本地预览', icon: 'none' })
            console.error('头像上传失败:', e)
          } finally {
            this.uploading = false
          }
        }
      })
    },

    onGenderChange(e) {
      this.genderIndex = e.detail.value
    },

    async saveProfile() {
      if (this.saving) return
      const nickname = this.nickname.trim()
      if (!nickname) {
        return uni.showToast({ title: '昵称不能为空', icon: 'none' })
      }

      this.saving = true
      const profile = {
        avatarUrl: this.avatarUrl,
        nickname,
        genderIndex: this.genderIndex,
        desc: this.desc.trim()
      }
      // 本地缓存（离线也能看到）
      uni.setStorageSync('userProfile', profile)

      try {
        // 头像若还是本地临时路径，就不要写到后端（后端只接受服务器地址）
        const avatarForServer = /^https?:|^\/uploads\//.test(this.avatarUrl) ? this.avatarUrl.replace(/^https?:\/\/[^/]+/, '') : ''
        await api.updateProfile({ nickname, avatar: avatarForServer })

        // 同步更新本地缓存的用户信息，个人中心立即生效
        const cached = uni.getStorageSync('userInfo') || {}
        uni.setStorageSync('userInfo', Object.assign({}, cached, { nickname, avatar: avatarForServer }))

        uni.showToast({ title: '保存成功', icon: 'success' })
        setTimeout(() => {
          this.saving = false
          safeBack()
        }, 800)
      } catch (e) {
        this.saving = false
        console.error('保存资料失败:', e)
        uni.showToast({ title: e.message || '保存失败', icon: 'none' })
      }
    }
  }
}
</script>

<style scoped>
.container {
  background-color: #F8FAFC;
  min-height: 100%;
}
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
}
.back-icon { font-size: 44rpx; margin-right: 24rpx; color: #333; }
.navbar-title {
  font-size: 36rpx;
  font-weight: 600;
  color: #333;
}
.navbar-right {
  font-size: 32rpx;
  color: #2ECC71;
  font-weight: 500;
}
.save-btn {
  font-size: 30rpx;
  color: #059669;
  font-weight: 700;
  padding: 8rpx 4rpx;
}
.profile-box {
  padding: 40rpx;
}
.profile-item {
  background: #fff;
  border-radius: 24rpx;
  padding: 30rpx;
  margin-bottom: 30rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.label {
  font-size: 30rpx;
  color: #333;
  flex-shrink: 0;
}
.avatar-box {
  display: flex;
  align-items: center;
}
.avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  margin-right: 20rpx;
  background-color: #E8F8EF;
}
.hint {
  font-size: 26rpx;
  color: #999;
}
.input {
  font-size: 30rpx;
  color: #666;
  text-align: right;
  flex: 1;
}
.picker-box {
  padding: 16rpx 24rpx;
  background: #f5f7fa;
  border-radius: 16rpx;
  font-size: 28rpx;
  color: #666;
}
.textarea {
  width: 100%;
  min-height: 160rpx;
  background: #f5f7fa;
  border-radius: 16rpx;
  padding: 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
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