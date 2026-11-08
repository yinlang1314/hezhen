<template>
  <view class="ua" :style="{ width: size + 'rpx', height: size + 'rpx' }">
    <image
      v-if="ok && src"
      class="ua-img"
      :src="src"
      mode="aspectFill"
      @error="broken = true"
    ></image>
    <text v-else class="ua-txt" :style="{ fontSize: textSize + 'rpx' }">{{ initial }}</text>
  </view>
</template>

<script>
export default {
  name: 'UserAvatar',
  props: {
    // 服务器头像地址（可带 ?token=），没有就显示首字
    src: { type: String, default: '' },
    // 用来取首字的显示名（昵称优先，其次账号）
    name: { type: String, default: '' },
    size: { type: Number, default: 108 }
  },
  data() {
    return { broken: false }
  },
  computed: {
    ok() {
      return !this.broken
    },
    initial() {
      const n = String(this.name || '').trim()
      if (!n) return '禾'
      // Array.from 处理 emoji / 生僻字，避免取到半个代理对
      return Array.from(n)[0].toUpperCase()
    },
    textSize() {
      return Math.round(this.size * 0.42)
    }
  },
  watch: {
    // 换了头像地址要重新尝试加载
    src() {
      this.broken = false
    }
  }
}
</script>

<style scoped>
.ua {
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0F766E, #14B8A6);
  flex-shrink: 0;
}
.ua-img {
  width: 100%;
  height: 100%;
  display: block;
  background: #0F766E;
}
.ua-txt {
  color: #fff;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0;
}
</style>
