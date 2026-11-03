<template>
	<view class="page-wrap container">
		<NavBar title="使用帮助" />
		<view class="help-content">
          <view class="help-inner">
			<view class="help-item">
				<text class="help-title">1. 病虫害识别使用</text>
				<text class="help-desc">进入首页点击拍照识别，对准农作物病害部位拍摄，即可快速识别病害种类并给出防治方案。</text>
			</view>
			<view class="help-item">
				<text class="help-title">2. 知识百科查阅</text>
				<text class="help-desc">在百科页面可浏览各类农作物常见病虫害资料，点击进入详情查看症状、传播途径与治理方法。</text>
			</view>
			<view class="help-item">
				<text class="help-title">3. 收藏功能</text>
				<text class="help-desc">在病害详情页点击爱心即可收藏，收藏内容统一存放在个人中心我的收藏内，方便随时查看。</text>
			</view>
			<view class="help-item">
				<text class="help-title">4. 识别历史</text>
				<text class="help-desc">所有识别记录自动保存，可在识别历史页面查看过往识别结果。</text>
			</view>
			<view class="help-item">
				<text class="help-title">5. 系统设置</text>
				<text class="help-desc">支持切换深色模式、调整字体大小、清理缓存、开关自动保存等个性化设置。</text>
			</view>
		          </view>
		</view>
	</view>
</template>

<script>
import NavBar from '@/components/NavBar.vue'
export default {
	components: { NavBar }
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
	font-weight: 700;
	color: var(--t-strong, #0F172A);
}
/* 页面本身滚动，不再用 scroll-view 固定高度 */
.help-content {
	height: auto;
}
.help-inner {
	padding: 40rpx;
	box-sizing: border-box;
	width: 100%;
}
.help-item {
	background: #fff;
	border-radius: 24rpx;
	padding: 30rpx;
	margin-bottom: 30rpx;
}
.help-title {
	font-size: 32rpx;
	font-weight: 600;
	color: #333;
	margin-bottom: 16rpx;
}
.help-desc {
	font-size: 28rpx;
	color: #666;
	line-height: 1.6;
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