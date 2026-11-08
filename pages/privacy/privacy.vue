<template>
  <view class="legal-page">
    <NavBar title="隐私政策" />
    <scroll-view scroll-y class="legal-scroll">
      <view class="legal-body">

        <view class="legal-hero">
          <text class="legal-title">隐私政策</text>
          <text class="legal-sub">说明我们收集哪些信息、如何使用与保护，以及你享有的权利。</text>
          <view class="legal-meta">
            <text class="legal-chip">更新 {{ updatedAt }}</text>
            <text class="legal-chip">生效 {{ updatedAt }}</text>
          </view>
        </view>

        <view class="legal-sec" v-for="(sec, i) in sections" :key="sec.title">
          <view class="legal-sec-head">
            <text class="legal-no">{{ i + 1 < 10 ? '0' + (i + 1) : (i + 1) }}</text>
            <text class="legal-h">{{ sec.title }}</text>
          </view>
          <block v-for="(p, j) in sec.paras" :key="j">
            <view v-if="p.type === 'tip'" class="legal-tip">
              <text class="legal-p">{{ p.text }}</text>
            </view>
            <text v-else class="legal-p" :class="{ em: p.type === 'em' }">{{ p.text }}</text>
          </block>
        </view>

        <view class="legal-contact">
          <text class="legal-contact-h">隐私问题联系</text>
          <text class="legal-contact-p">可发送邮件至 {{ contactEmail }}</text>
          <text class="legal-contact-p">或在项目仓库提交 Issue：{{ contactGithub }}</text>
        </view>

        <text class="legal-foot">禾诊 · 智能病虫害识别系统 · 2026</text>
      </view>
    </scroll-view>
  </view>
</template>

<script>
import NavBar from '@/components/NavBar.vue'
import { CONTACT_EMAIL, CONTACT_GITHUB, UPDATED_AT } from '@/utils/legal.js'

export default {
  components: { NavBar },
  data() {
    return {
      contactEmail: CONTACT_EMAIL,
      contactGithub: CONTACT_GITHUB,
      updatedAt: UPDATED_AT,
      sections: [
        {
          title: '我们收集哪些信息',
          paras: [
            { text: '1. 账号信息：用户名、密码（加密存储，我们看不到明文）。' },
            { text: '2. 资料信息：你自愿填写的昵称、头像。' },
            { text: '3. 业务信息：你上传的作物照片、识别记录、收藏、纠错、意见反馈。' },
            { text: '4. 日志信息：登录时间、IP 地址、访问记录（用于安全排查，保留 30 天）。' },
            { text: '5. 微信登录信息：如果你在小程序里使用「微信一键登录」，我们会获取微信提供的用户标识（openid），仅用于识别你的账号；不会获取你的微信昵称、头像、好友或手机号。' },
            { text: '6. 我们不收集：通讯录、短信、通话记录、精确定位、设备唯一标识（IMEI 等）。' }
          ]
        },
        {
          title: '相机与相册',
          paras: [
            { text: '拍照识别、实时监测需要访问相机；从相册选择需要访问相册。照片仅用于你当前发起的识别，以及在你登录时保存到识别历史。你可以随时在系统设置里关闭权限，不影响其他功能的使用。' }
          ]
        },
        {
          title: '信息如何被使用',
          paras: [
            { text: '· 完成病虫害识别与防治建议；' },
            { text: '· 保存你的识别历史与收藏；' },
            { text: '· 处理你的纠错与反馈，改进知识库；' },
            { text: '· 安全检查（例如异常登录提醒、防止刷接口）。' }
          ]
        },
        {
          title: '第三方服务',
          paras: [
            { text: '为完成识别与问答，部分数据会发送给以下第三方：' },
            { text: '· DeepSeek（图片识别与文字问答）：发送你上传的图片或问题文本；' },
            { text: '· 百度植物识别（辅助识别作物种类）：发送你上传的图片；' },
            { text: '· Open-Meteo（天气预报）：仅按地区获取天气，不涉及个人信息；' },
            { text: '· GitHub（安装包下载）：下载行为由 GitHub 处理，适用其隐私政策。' },
            { type: 'em', text: '我们不会向任何第三方出售你的个人信息。' }
          ]
        },
        {
          title: '存储与安全',
          paras: [
            { text: '1. 数据存储在本应用部署的服务器（通常为个人电脑或局域网服务器）。' },
            { text: '2. 密码使用 bcrypt 加密；接口需登录凭证；上传目录有访问控制。' },
            { text: '3. 若部署在局域网，请注意同一网络下的他人可能访问服务器地址。' }
          ]
        },
        {
          title: '保留期限',
          paras: [
            { text: '识别历史与收藏保留到你主动删除；登录日志保留 30 天；没有被任何记录引用的上传图片会被定期清理。' }
          ]
        },
        {
          title: '你的权利',
          paras: [
            { text: '你可以随时：查看与修改个人资料、删除识别记录、取消收藏、清空历史。如需注销账号或导出数据，请联系维护者。' }
          ]
        },
        {
          title: '未成年人',
          paras: [
            { text: '本应用面向农业从业者，建议 14 周岁以上使用；未成年人在监护人指导下使用。' }
          ]
        },
        {
          title: '政策更新',
          paras: [
            { text: '本政策更新后会在本页公布并更新日期。' }
          ]
        }
      ]
    }
  }
}
</script>

<style scoped>
@import '@/styles/legal.css';
</style>
