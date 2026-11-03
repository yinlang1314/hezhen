<script>
import { getWinInfo } from '@/utils/wininfo.js'
export default {
  onLaunch() {
    console.log('✅ 系统启动成功')

    // 获取系统信息（适配导航栏高度）
    const info = getWinInfo()
    this.globalData.statusBarHeight = (info && info.statusBarHeight) || 0
    this.globalData.navBarHeight = this.globalData.statusBarHeight + 44

    // 游客模式：启动时不再强制跳登录页，用户可以先用起来
  },

  globalData: {
    statusBarHeight: 0,
    navBarHeight: 0
  }
}
</script>

<style>
/* ==================================================================
   全局设计系统 —— 所有页面共用
   颜色：湖绿主色 + 深绿标题 + 薄荷浅底 + 金色强调
   图标：全部使用 emoji / CSS 绘制，不依赖图片文件（项目 static 目录缺图）
   ================================================================== */
page {
  --c-primary: #10B981;
  --c-primary-dark: #059669;
  --c-primary-deep: #065F46;
  --c-primary-soft: #D1FAE5;
  --c-primary-mist: #ECFDF5;
  --c-accent: #F59E0B;
  --c-accent-soft: #FEF3C7;
  --c-danger: #EF4444;
  --c-danger-soft: #FEE2E2;
  --c-info: #3B82F6;
  --c-info-soft: #DBEAFE;

  --t-strong: #0F172A;
  --t-main: #1E293B;
  --t-sub: #64748B;
  --t-faint: #94A3B8;
  --t-invert: #FFFFFF;

  --bg-page: #F4F8F6;
  --bg-card: #FFFFFF;
  --bg-soft: #F8FAFC;

  --line: #E8EDF2;

  --r-sm: 12rpx;
  --r-md: 20rpx;
  --r-lg: 28rpx;
  --r-xl: 40rpx;

  --sh-card: 0 6rpx 28rpx rgba(15, 23, 42, 0.06);
  --sh-float: 0 12rpx 40rpx rgba(16, 185, 129, 0.18);
  --sh-nav: 0 -6rpx 30rpx rgba(15, 23, 42, 0.08);
}

page,
view {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

page {
  background-color: var(--bg-page);
  color: var(--t-main);
  font-family: PingFang SC, -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* ---------- 通用容器 ---------- */
.page-wrap {
  min-height: 100%;
  padding-bottom: 160rpx; /* 给悬浮导航留出空间 */
}

/* ---------- 通用卡片 ---------- */
.card {
  background: var(--bg-card);
  border-radius: var(--r-lg);
  box-shadow: var(--sh-card);
}

/* ---------- 通用区块标题 ---------- */
.sec-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 32rpx;
  margin-bottom: 32rpx;
}
.sec-title {
  font-size: 36rpx;
  font-weight: 700;
  color: var(--t-strong);
  letter-spacing: 1rpx;
}
.sec-sub {
  font-size: 24rpx;
  color: var(--t-faint);
}

/* ---------- 通用返回按钮（原来用缺失的 back.png）---------- */
.nav-back {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 2rpx 12rpx rgba(15, 23, 42, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32rpx;
  color: var(--t-main);
  line-height: 1;
}
.nav-back:active { transform: scale(0.94); }

/* ---------- 通用标签 ---------- */
.chip {
  display: inline-flex;
  align-items: center;
  padding: 6rpx 18rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;
  line-height: 1.4;
}
.chip-green { background: var(--c-primary-soft); color: var(--c-primary-deep); }
.chip-amber { background: var(--c-accent-soft); color: #B45309; }
.chip-red   { background: var(--c-danger-soft); color: #B91C1C; }
.chip-blue  { background: var(--c-info-soft); color: #1D4ED8; }
.chip-grey  { background: #F1F5F9; color: var(--t-sub); }

/* ---------- 通用按钮 ---------- */
.btn-main {
  height: 92rpx;
  border-radius: var(--r-md);
  background: linear-gradient(135deg, #34D399, var(--c-primary-dark));
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  box-shadow: var(--sh-float);
}
.btn-main:active { opacity: 0.92; transform: translateY(1rpx); }

/* ---------- 空状态 ---------- */
.empty-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 40rpx;
}
.empty-emoji { font-size: 96rpx; margin-bottom: 24rpx; opacity: 0.55; }
.empty-text { font-size: 28rpx; color: var(--t-faint); margin-bottom: 8rpx; }
.empty-hint { font-size: 24rpx; color: #CBD5E1; }

/* ==================================================================
   宽屏（电脑浏览器）：内容收成一列居中，别让 rpx 无限拉伸
   ================================================================== */
@media screen and (min-width: 750px) {
  page { background: #E6EFEA; }
  .page-wrap,
  .chat-page {
    max-width: 750px;
    margin: 0 auto;
    min-height: 100vh;
    background: var(--bg-page);
    box-shadow: 0 0 80rpx rgba(15, 23, 42, 0.08);
  }
}
</style>
