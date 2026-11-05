// 005 · 审核台用字段
//
// 后台有了"逐条审核"页面后，需要记录：
//   review_state: '' = 未处理 / 'revise' = 标记待改 / 'skip' = 跳过
//   review_note : 审核人写的问题说明
module.exports = {
  id: '005',
  name: '病害审核状态字段',
  async up({ dialect, ensureColumn }) {
    const short = dialect === 'mysql' ? 'VARCHAR(16)' : 'TEXT'
    await ensureColumn('diseases', 'review_state', short)
    await ensureColumn('diseases', 'review_note', 'TEXT')
  }
}
