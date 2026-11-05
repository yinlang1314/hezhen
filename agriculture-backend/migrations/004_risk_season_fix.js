// 004 · 修正风险规则的季节窗口
//
// 003 里小麦锈病没写月份，结果 11 月在江西也被判成中风险——
// 小麦条锈病是春季流行（3-5 月），没有季节限制会误报。
// 番茄晚疫病原文写的是"4-6 月和 9-1 月"，也要落到规则里。
module.exports = {
  id: '004',
  name: '修正风险规则季节窗口',
  async up({ run }) {
    await run("UPDATE risk_rules SET months = '3,4,5' WHERE disease_name = '小麦锈病'")
    await run("UPDATE risk_rules SET months = '6,7,8,9' WHERE disease_name = '苹果轮纹病'")
    await run("UPDATE risk_rules SET months = '4,5,6,9,10,11,12,1' WHERE disease_name = '番茄晚疫病'")
  }
}
