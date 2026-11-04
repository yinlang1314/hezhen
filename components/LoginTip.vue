<template>
  <!-- 需要登录的统一弹窗（替代 uni.showModal 的原生白框） -->
  <view class="lt-mask" v-if="visible" @click="cancel" @touchmove.stop.prevent="noop">
    <view class="lt-card" @click.stop>
      <view class="lt-icon-wrap">
        <image class="lt-icon" src="/static/icons/line-lock.png" mode="aspectFit" />
      </view>
      <text class="lt-title">{{ title }}</text>
      <text class="lt-desc">{{ content }}</text>
      <view class="lt-actions">
        <view class="lt-btn ghost" @click="cancel">{{ cancelText }}</view>
        <view class="lt-btn primary" @click="confirm">{{ confirmText }}</view>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  name: 'LoginTip',
  props: {
    visible: { type: Boolean, default: false },
    title: { type: String, default: '需要登录' },
    content: { type: String, default: '登录后即可查看你的识别记录和收藏。' },
    confirmText: { type: String, default: '去登录' },
    cancelText: { type: String, default: '暂时不看' }
  },
  emits: ['confirm', 'cancel'],
  methods: {
    noop() {},
    confirm() { this.$emit('confirm') },
    cancel() { this.$emit('cancel') }
  }
}
</script>

<style scoped>
.lt-mask {
  position: fixed;
  left: 0; right: 0; top: 0; bottom: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  padding: 0 64rpx;
}
.lt-card {
  width: 100%;
  max-width: 560rpx;
  background: #FFFFFF;
  border-radius: 32rpx;
  padding: 56rpx 44rpx 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 24rpx 80rpx rgba(15, 23, 42, 0.24);
}
.lt-icon-wrap {
  width: 128rpx;
  height: 128rpx;
  border-radius: 36rpx;
  background: #ECFDF5;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 28rpx;
}
.lt-icon { width: 64rpx; height: 64rpx; }
.lt-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #0F172A;
  margin-bottom: 16rpx;
}
.lt-desc {
  font-size: 26rpx;
  color: #64748B;
  line-height: 1.6;
  text-align: center;
  margin-bottom: 44rpx;
}
.lt-actions {
  display: flex;
  gap: 20rpx;
  width: 100%;
}
.lt-btn {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  border-radius: 44rpx;
  font-size: 28rpx;
  font-weight: 600;
}
.lt-btn.ghost {
  background: #F1F5F9;
  color: #475569;
}
.lt-btn.ghost:active { background: #E2E8F0; }
.lt-btn.primary {
  background: linear-gradient(135deg, #34D399, #059669);
  color: #FFFFFF;
  box-shadow: 0 12rpx 28rpx rgba(5, 150, 105, 0.28);
}
.lt-btn.primary:active { transform: translateY(2rpx); box-shadow: 0 6rpx 14rpx rgba(5, 150, 105, 0.24); }
</style>
