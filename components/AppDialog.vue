<template>
  <!-- 通用弹窗：登录提示 / 删除确认 共用 -->
  <view class="dlg-mask" v-if="visible" @click="cancel" @touchmove.stop.prevent="noop">
    <view class="dlg-card" @click.stop>
      <view class="dlg-icon-wrap" :class="{ danger }">
        <image class="dlg-icon" :src="iconSrc" mode="aspectFit" />
      </view>
      <text class="dlg-title">{{ title }}</text>
      <text class="dlg-desc">{{ content }}</text>
      <view class="dlg-actions">
        <view class="dlg-btn ghost" @click="cancel">{{ cancelText }}</view>
        <view class="dlg-btn primary" :class="{ danger }" @click="confirm">{{ confirmText }}</view>
      </view>
    </view>
  </view>
</template>

<script>
const ICONS = {
  lock: '/static/icons/line-lock.png',
  delete: '/static/icons/line-trash.png',
  warning: '/static/icons/line-shield.png'
}

export default {
  name: 'AppDialog',
  props: {
    visible: { type: Boolean, default: false },
    title: { type: String, default: '提示' },
    content: { type: String, default: '' },
    confirmText: { type: String, default: '确定' },
    cancelText: { type: String, default: '取消' },
    icon: { type: String, default: 'lock' },
    danger: { type: Boolean, default: false }
  },
  emits: ['confirm', 'cancel'],
  computed: {
    iconSrc() {
      return ICONS[this.icon] || ICONS.lock
    }
  },
  methods: {
    noop() {},
    confirm() { this.$emit('confirm') },
    cancel() { this.$emit('cancel') }
  }
}
</script>

<style scoped>
.dlg-mask {
  position: fixed;
  left: 0; right: 0; top: 0; bottom: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  padding: 0 64rpx;
}
.dlg-card {
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
.dlg-icon-wrap {
  width: 128rpx;
  height: 128rpx;
  border-radius: 36rpx;
  background: #f0fdfa;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 28rpx;
}
.dlg-icon-wrap.danger { background: #FEF2F2; }
.dlg-icon { width: 64rpx; height: 64rpx; }
.dlg-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #0F172A;
  margin-bottom: 16rpx;
}
.dlg-desc {
  font-size: 26rpx;
  color: #64748B;
  line-height: 1.6;
  text-align: center;
  margin-bottom: 44rpx;
}
.dlg-actions { display: flex; gap: 20rpx; width: 100%; }
.dlg-btn {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  border-radius: 44rpx;
  font-size: 28rpx;
  font-weight: 600;
}
.dlg-btn.ghost { background: #F1F5F9; color: #475569; }
.dlg-btn.ghost:active { background: #E2E8F0; }
.dlg-btn.primary {
  background: linear-gradient(135deg, #14b8a6, #0f766e);
  color: #FFFFFF;
  box-shadow: 0 12rpx 28rpx rgba(15, 118, 110, 0.28);
}
.dlg-btn.primary.danger {
  background: linear-gradient(135deg, #F87171, #b91c1c);
  box-shadow: 0 12rpx 28rpx rgba(220, 38, 38, 0.26);
}
.dlg-btn.primary:active { transform: translateY(2rpx); }
</style>
