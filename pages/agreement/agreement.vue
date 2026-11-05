<template>
  <view class="page-wrap">
    <NavBar title="用户协议" />
    <scroll-view scroll-y class="doc-scroll">
      <view class="doc">
        <text class="doc-updated">更新日期：{{ updatedAt }}　生效日期：{{ updatedAt }}</text>

        <text class="doc-h">一、关于本协议</text>
        <text class="doc-p">「禾诊」是一款面向农户的病虫害识别与防治参考工具（以下简称"本应用"）。本应用由个人开发者维护，用于学习与农业生产辅助，不提供任何形式的商业担保。</text>
        <text class="doc-p">你注册、登录或使用本应用，即表示已阅读并同意本协议。如不同意，请停止使用。</text>

        <text class="doc-h">二、账号</text>
        <text class="doc-p">1. 你需要自行保管账号和密码，因保管不当造成的损失由你自行承担。</text>
        <text class="doc-p">2. 请勿将账号出借、转让给他人。</text>
        <text class="doc-p">3. 如发现账号异常，请尽快修改密码并联系维护者。</text>

        <text class="doc-h">三、使用规范</text>
        <text class="doc-p">使用本应用时，你承诺不进行以下行为：</text>
        <text class="doc-p">· 上传与本应用用途无关、违法、侵权或含恶意内容的图片与文字；</text>
        <text class="doc-p">· 通过技术手段批量请求、攻击、抓取数据或绕过访问限制；</text>
        <text class="doc-p">· 冒用他人身份，或提交虚假的病虫害信息以污染知识库。</text>

        <text class="doc-h">四、识别结果与用药信息（重要）</text>
        <text class="doc-p">1. 识别结果由人工智能模型结合本地知识库生成，**受图片质量、拍摄角度、光照、病害发展阶段等影响，可能不准确**。</text>
        <text class="doc-p">2. 应用内展示的"已核实"标记，表示该条资料有标注来源并经人工复核，但不构成对该病害所有情况的保证。</text>
        <text class="doc-p">3. 用药建议仅供参考。**实际用药请以农药包装标签、登记证信息为准**，并遵守安全间隔期；因施药造成的药害、残留或人身财产损失，本应用不承担责任。</text>
        <text class="doc-p">4. 遇到大面积暴发或无法判断的情况，请咨询当地农技推广部门或植保专家。</text>

        <text class="doc-h">五、内容与知识产权</text>
        <text class="doc-p">1. 本应用的界面、程序代码归开发者所有。</text>
        <text class="doc-p">2. 你上传的照片归你所有；你提交的纠错信息可用于改进病虫害知识库。</text>
        <text class="doc-p">3. 知识库部分内容整理自公开资料与官方名录，已在条目中标明来源。</text>

        <text class="doc-h">六、服务变更与中断</text>
        <text class="doc-p">本应用为个人维护项目，可能因升级、维护、网络或服务器原因暂停服务。我们会尽力提前说明，但不对因此造成的不便承担赔偿责任。</text>

        <text class="doc-h">七、免责</text>
        <text class="doc-p">在法律允许的范围内，本应用不对因使用或无法使用本应用造成的间接损失承担责任。</text>

        <text class="doc-h">八、协议修改</text>
        <text class="doc-p">协议更新后会在本页公布并更新日期。继续使用即视为接受修改后的协议。</text>

        <text class="doc-h">九、联系方式</text>
        <text class="doc-p">问题、建议或投诉，可发送邮件至 {{ contactEmail }}，或在项目仓库提交 Issue：{{ contactGithub }}</text>

        <view class="doc-end"></view>
      </view>
    </scroll-view>
  </view>
</template>

<script>
import NavBar from '@/components/NavBar.vue'
import { CONTACT_EMAIL, CONTACT_GITHUB, UPDATED_AT } from '@/utils/legal.js'
export default {
  data() {
    return { contactEmail: CONTACT_EMAIL, contactGithub: CONTACT_GITHUB, updatedAt: UPDATED_AT }
  },
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
