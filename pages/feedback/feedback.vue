<template>
	<view class="page-wrap container">
		<NavBar title="意见反馈" />
		<view class="feedback-box">
			<view class="input-item">
				<text class="label">反馈类型</text>
				<picker :range="typeList" :value="typeIndex" @change="changeType">
					<view class="pick-box">{{ typeList[typeIndex] }}</view>
				</picker>
			</view>
			<view class="input-item">
				<text class="label">详细描述</text>
				<textarea 
					class="textarea" 
					v-model="content" 
					placeholder="请输入你的问题、建议或BUG反馈..." 
					:maxlength="500"
					auto-height
				></textarea>
				<text class="word-count">{{ content.length }}/500</text>
			</view>
			<button class="submit-btn" :disabled="submitting" @click="submitFeedback">
				{{ submitting ? '提交中...' : '提交反馈' }}
			</button>
		</view>
	</view>
</template>

<script>
import { api } from '@/utils/api.js'
import { safeBack } from '@/utils/nav.js'
import NavBar from '@/components/NavBar.vue'

export default {
	components: { NavBar },
	data() {
		return {
			typeList: ['功能建议', 'BUG问题', '使用疑问', '其他'],
			typeIndex: 0,
			content: '',
			submitting: false
		}
	},
	
	methods: {
		changeType(e) {
			this.typeIndex = e.detail.value
		},
		async submitFeedback() {
			if (this.submitting) return
			const content = this.content.trim()
			if (!content) {
				return uni.showToast({ title: '请输入反馈内容', icon: 'none' })
			}
			
						this.submitting = true
			uni.showLoading({ title: '提交中...', mask: true })
			
			try {
				const res = await api.submitFeedback({
					type: this.typeList[this.typeIndex],
					content: content
				})

				uni.hideLoading()
				uni.showToast({ title: (res && res.message) || '感谢您的反馈！', icon: 'success' })
				setTimeout(() => {
					this.content = ''
					safeBack()
				}, 800)
			} catch (err) {
				uni.hideLoading()
				console.error('提交反馈失败:', err)
				uni.showToast({ title: err.message || '提交失败，请重试', icon: 'none' })
			} finally {
				this.submitting = false
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
.feedback-box {
	padding: 40rpx;
}
.input-item {
	background: #fff;
	border-radius: 24rpx;
	padding: 30rpx;
	margin-bottom: 30rpx;
	position: relative;
}
.label {
	font-size: 30rpx;
	color: #333;
	margin-bottom: 20rpx;
	display: block;
}
.pick-box {
	padding: 20rpx;
	background: #f5f7fa;
	border-radius: 16rpx;
	font-size: 28rpx;
	color: #666;
}
.textarea {
	min-height: 240rpx;
	background: #f5f7fa;
	border-radius: 16rpx;
	padding: 20rpx;
	font-size: 28rpx;
	width: 100%;
	box-sizing: border-box;
}
.word-count {
	text-align: right;
	font-size: 24rpx;
	color: #999;
	margin-top: 8rpx;
}
.submit-btn {
	background: #0f766e;
	color: #fff;
	border-radius: 20rpx;
	height: 88rpx;
	line-height: 88rpx;
	font-size: 32rpx;
	margin-top: 20rpx;
	border: none;
}
.submit-btn[disabled] {
	background: #a0e0b3;
	color: #e0ffe0;
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