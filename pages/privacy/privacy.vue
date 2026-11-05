<template>
  <view class="page-wrap">
    <NavBar title="隐私政策" />
    <scroll-view scroll-y class="doc-scroll">
      <view class="doc">
        <text class="doc-updated">更新日期：2026-11-05　生效日期：2026-11-05</text>
        <text class="doc-h">一、我们收集哪些信息</text>
        <text class="doc-p">1. 账号信息：用户名、密码（加密存储，我们看不到明文）。</text>
        <text class="doc-p">2. 资料信息：你自愿填写的昵称、头像。</text>
        <text class="doc-p">3. 业务信息：你上传的作物照片、识别记录、收藏、纠错、意见反馈。</text>
        <text class="doc-p">4. 日志信息：登录时间、IP 地址、访问记录（用于安全排查，保留 30 天）。</text>
        <text class="doc-p">5. 我们不收集：通讯录、短信、通话记录、精确定位、设备唯一标识（IMEI 等）。</text>

        <text class="doc-h">二、相机与相册</text>
        <text class="doc-p">拍照识别、实时监测需要访问相机；从相册选择需要访问相册。照片仅用于你当前发起的识别，以及在你登录时保存到识别历史。你可以随时在系统设置里关闭权限，不影响其他功能的使用。</text>

        <text class="doc-h">三、信息如何被使用</text>
        <text class="doc-p">· 完成病虫害识别与防治建议；</text>
        <text class="doc-p">· 保存你的识别历史与收藏；</text>
        <text class="doc-p">· 处理你的纠错与反馈，改进知识库；</text>
        <text class="doc-p">· 安全检查（例如异常登录提醒、防止刷接口）。</text>

        <text class="doc-h">四、第三方服务</text>
        <text class="doc-p">为完成识别与问答，部分数据会发送给以下第三方：</text>
        <text class="doc-p">· DeepSeek（图片识别与文字问答）：发送你上传的图片或问题文本；</text>
        <text class="doc-p">· 百度植物识别（辅助识别作物种类）：发送你上传的图片；</text>
        <text class="doc-p">· Open-Meteo（天气预报）：仅按地区获取天气，不涉及个人信息；</text>
        <text class="doc-p">· GitHub（安装包下载）：下载行为由 GitHub 处理，适用其隐私政策。</text>
        <text class="doc-p">我们不会向任何第三方出售你的个人信息。</text>

        <text class="doc-h">五、存储与安全</text>
        <text class="doc-p">1. 数据存储在本应用部署的服务器（通常为个人电脑或局域网服务器）。</text>
        <text class="doc-p">2. 密码使用 bcrypt 加密；接口需登录凭证；上传目录有访问控制。</text>
        <text class="doc-p">3. 若部署在局域网，请注意同一网络下的他人可能访问服务器地址。</text>

        <text class="doc-h">六、保留期限</text>
        <text class="doc-p">识别历史与收藏保留到你主动删除；登录日志保留 30 天；没有被任何记录引用的上传图片会被定期清理。</text>

        <text class="doc-h">七、你的权利</text>
        <text class="doc-p">你可以随时：查看与修改个人资料、删除识别记录、取消收藏、清空历史。如需注销账号或导出数据，请联系维护者。</text>

        <text class="doc-h">八、未成年人</text>
        <text class="doc-p">本应用面向农业从业者，建议 14 周岁以上使用；未成年人在监护人指导下使用。</text>

        <text class="doc-h">九、政策更新</text>
        <text class="doc-p">本政策更新后会在本页公布并更新日期。</text>

        <text class="doc-h">十、联系方式</text>
        <text class="doc-p">隐私相关问题：可通过项目仓库 Issues 提交（GitHub: yinlang1314/hezhen）。</text>

        <view class="doc-end"></view>

      </view>
    </scroll-view>
  </view>
</template>

<script>
import NavBar from '@/components/NavBar.vue'
export default {
  components: { NavBar }
}
</script>

<style scoped>
.page-wrap { display: flex; flex-direction: column; height: 100vh; background: #F8FAFC; }
.doc-scroll { flex: 1; }
.doc { padding: 32rpx 36rpx 80rpx; }
.doc-updated { display: block; font-size: 22rpx; color: #94A3B8; margin-bottom: 28rpx; }
.doc-h {
  display: block;
  margin: 36rpx 0 14rpx;
  font-size: 30rpx;
  font-weight: 700;
  color: #0F172A;
}
.doc-p {
  display: block;
  margin-bottom: 12rpx;
  font-size: 26rpx;
  line-height: 1.8;
  color: #334155;
}
.doc-end { height: 80rpx; }
</style>
