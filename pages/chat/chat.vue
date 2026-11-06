<template>
  <view class="chat-page">
    <!-- 顶栏 -->
    <NavBar title="AI 农技顾问" :subtitle="headSub">
      <template #right>
        <text v-if="messages.length" class="clear-text" @click="clearChat">清空</text>
      </template>
    </NavBar>

    <!-- 隐私说明：让用户放心 —— 后端确实不保存对话 -->
    <view class="privacy-note">
      <image class="privacy-icon" src="/static/icons/line-chat.png" mode="aspectFit" />
      <text class="privacy-text">对话仅用于本次回答，服务端不会保存记录</text>
    </view>

    <!-- 消息区 -->
    <scroll-view scroll-y class="msg-scroll" :scroll-top="scrollTop" :scroll-with-animation="true">
          <view class="scroll-inner">
      <!-- 欢迎语 + 快捷问题 -->
      <view class="welcome" v-if="!messages.length">
        <view class="welcome-avatar"><image class="ava-mark" src="/static/icons/brand-mark.png" mode="aspectFit" /></view>
        <text class="welcome-title">你好，我是农技顾问</text>
        <text class="welcome-desc">作物病虫害、栽培管理、施肥灌溉都可以问我。拍照识别不准时，也可以直接描述症状问我。</text>

        <view class="chips">
          <view class="chip-item" v-for="(q, i) in quickQuestions" :key="i" @click="askQuick(q)">
            <text class="chip-text">{{ q }}</text>
          </view>
        </view>
      </view>

      <!-- 对话 -->
      <view class="msg-list" v-else>
        <view class="msg" v-for="(m, i) in messages" :key="i" :class="m.role">
          <view class="msg-avatar" v-if="m.role === 'assistant'"><image class="ava-mark" src="/static/icons/brand-mark.png" mode="aspectFit" /></view>
          <view class="bubble" :class="m.role">
            <text class="bubble-text">{{ m.content }}</text>
          </view>
        </view>

        <!-- 正在输入 -->
        <view class="msg assistant" v-if="loading">
          <view class="msg-avatar"><image class="ava-mark" src="/static/icons/brand-mark.png" mode="aspectFit" /></view>
          <view class="bubble assistant">
            <view class="typing"><text class="dot"></text><text class="dot"></text><text class="dot"></text></view>
          </view>
        </view>
      </view>

      <view class="msg-bottom"></view>
              </view>
</scroll-view>

    <!-- 输入区 -->
    <view class="input-bar">
      <input
        class="chat-input"
        v-model="draft"
        placeholder="描述你的问题，例如：水稻叶子发黄怎么办"
        confirm-type="send"
        :disabled="loading"
        @confirm="send"
      />
      <view class="send-btn" :class="{ disabled: !canSend }" @click="send">
        <text class="send-text">发送</text>
      </view>
    </view>
  </view>
</template>

<script>
import { api } from '@/utils/api.js'
import NavBar from '@/components/NavBar.vue'
import { canAsk, consumeAsk, chatRemaining, promptLoginChat, isLoggedIn } from '@/utils/guest.js'

export default {
  components: { NavBar },
  data() {
    return {
      messages: [],        // [{ role: 'user'|'assistant', content }]
      draft: '',
      loading: false,
      scrollTop: 0,
      chatLeft: -1,
      quickQuestions: [
        '水稻叶子发黄是什么原因？',
        '番茄叶片有褐色斑点怎么治？',
        '柑橘溃疡病用什么药？',
        '土壤板结怎么改良？'
      ]
    }
  },

  computed: {
    canSend() {
      return !this.loading && String(this.draft || '').trim().length > 0
    },
    headSub() {
      if (isLoggedIn()) return '不限次数提问'
      const left = this.chatLeft
      if (left < 0) return 'AI 农业问答'
      return left > 0 ? ('未登录还可提问 ' + left + ' 次') : '免费次数已用完'
    }
  },

  onLoad() {
    this.refreshLeft()
  },

  methods: {
    refreshLeft() {
      this.chatLeft = isLoggedIn() ? -1 : chatRemaining()
    },

    clearChat() {
      uni.showModal({
        title: '清空对话',
        content: '确定清空当前对话记录吗？',
        success: (r) => { if (r.confirm) { this.messages = []; this.scrollToBottom() } }
      })
    },

    askQuick(q) {
      this.draft = q
      this.send()
    },

    scrollToBottom() {
      // 用一个很大的值让 scroll-view 滚到底
      this.$nextTick(() => { this.scrollTop = 999999 + Math.random() })
    },

    async send() {
      const question = String(this.draft || '').trim()
      if (!question || this.loading) return

      // 未登录限制免费提问次数
      if (!canAsk()) {
        await promptLoginChat()
        return
      }

      // 历史对话（不含本次）
      const history = this.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content }))

      this.messages.push({ role: 'user', content: question })
      this.draft = ''
      this.loading = true
      this.scrollToBottom()

      try {
        const res = await api.askAI(question, history)
        const answer = (res && res.data && res.data.answer) || ''
        this.messages.push({ role: 'assistant', content: answer || '抱歉，我没能给出回答，请换个说法再问。' })
        consumeAsk()
        this.refreshLeft()
      } catch (e) {
        const msg = (e && e.message) || '提问失败，请稍后再试'
        this.messages.push({ role: 'assistant', content: '⚠️ ' + msg })
      } finally {
        this.loading = false
        this.scrollToBottom()
      }
    }
  }
}
</script>

<style scoped>
.chat-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-page);
}

/* 顶栏 */
.chat-head {
  display: flex;
  align-items: center;
  padding: 20rpx 24rpx;
  background: #fff;
  box-shadow: 0 2rpx 16rpx rgba(15, 23, 42, .05);
}
.head-center { flex: 1; display: flex; flex-direction: column; align-items: center; }
.head-title { font-size: 32rpx; font-weight: 700; color: var(--t-strong); }
.head-sub { font-size: 22rpx; color: var(--t-faint); margin-top: 4rpx; }
.head-right { min-width: 72rpx; display: flex; justify-content: flex-end; }
.clear-text { font-size: 26rpx; color: var(--t-sub); }

/* 消息区：padding 不能加在 scroll-view 上。
   小程序的 scroll-view 会把 padding 加在外层滚动容器，
   内层内容区仍满宽 -> 内容整体偏右。所以放到 .scroll-inner 上。 */
.msg-scroll { flex: 1; height: 0; }
.scroll-inner {
  padding: 0 28rpx;
  box-sizing: border-box;
  width: 100%;
}
.msg-bottom { height: 32rpx; }

.welcome { padding: 60rpx 20rpx; display: flex; flex-direction: column; align-items: center; }
.welcome-avatar {
  width: 132rpx; height: 132rpx; border-radius: 50%;
  background: linear-gradient(135deg, #14b8a6, #0f766e);
  display: flex; align-items: center; justify-content: center;
  font-size: 64rpx; margin-bottom: 28rpx;
  box-shadow: 0 14rpx 36rpx rgba(15, 118, 110, .3);
}
.welcome-title { font-size: 36rpx; font-weight: 700; color: var(--t-strong); margin-bottom: 14rpx; }
.welcome-desc { font-size: 26rpx; color: var(--t-sub); line-height: 1.75; text-align: center; padding: 0 20rpx; }
.chips { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 44rpx; justify-content: center; }
.chip-item {
  padding: 18rpx 28rpx; border-radius: 999rpx; background: #fff;
  border: 2rpx solid #E2E8F0; box-shadow: var(--sh-card);
}
.chip-text { font-size: 26rpx; color: var(--t-main); }

.msg-list { padding-top: 28rpx; }
.msg { display: flex; margin-bottom: 28rpx; align-items: flex-start; }
.msg.user { flex-direction: row-reverse; }
.msg-avatar {
  width: 64rpx; height: 64rpx; border-radius: 50%; flex-shrink: 0;
  background: linear-gradient(135deg, #14b8a6, #0f766e);
  display: flex; align-items: center; justify-content: center; font-size: 32rpx;
}
.bubble {
  max-width: 78%;
  padding: 24rpx 28rpx;
  border-radius: 24rpx;
  margin: 0 18rpx;
}
.bubble.assistant { background: #fff; box-shadow: var(--sh-card); border-top-left-radius: 6rpx; }
.bubble.user { background: linear-gradient(135deg, #14b8a6, #0f766e); border-top-right-radius: 6rpx; }
.bubble-text { font-size: 28rpx; line-height: 1.75; }
.bubble.assistant .bubble-text { color: var(--t-main); }
.bubble.user .bubble-text { color: #fff; }

/* 正在输入动画 */
.typing { display: flex; align-items: center; gap: 10rpx; padding: 4rpx 0; }
.dot { width: 14rpx; height: 14rpx; border-radius: 50%; background: #CBD5E1; animation: blink 1.2s infinite; }
.dot:nth-child(2) { animation-delay: .2s; }
.dot:nth-child(3) { animation-delay: .4s; }
@keyframes blink { 0%, 60%, 100% { opacity: .3; } 30% { opacity: 1; } }

/* 输入区 */
.input-bar {
  display: flex; align-items: center; gap: 18rpx;
  padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -4rpx 24rpx rgba(15, 23, 42, .06);
}
.chat-input {
  flex: 1; height: 84rpx; padding: 0 28rpx;
  border-radius: 999rpx; background: #F1F5F9;
  font-size: 28rpx; color: var(--t-main);
}
.send-btn {
  padding: 0 36rpx; height: 84rpx; border-radius: 999rpx;
  background: linear-gradient(135deg, #14b8a6, #0f766e);
  display: flex; align-items: center; justify-content: center;
}
.send-btn.disabled { opacity: .45; }
.send-text { font-size: 28rpx; font-weight: 700; color: #fff; }

/* 隐私说明 */
.privacy-note {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14rpx 32rpx;
  background: #F8FAFC;
}
.privacy-icon { width: 24rpx; height: 24rpx; margin-right: 8rpx; }
.privacy-text { font-size: 22rpx; color: var(--t-faint); }


  /* 品牌麦穗（替代 emoji） */
  .ava-mark { width: 62%; height: 62%; display: block; }
</style>
