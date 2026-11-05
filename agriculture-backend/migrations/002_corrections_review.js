// 002 · 用户纠错记录加"复核"字段
//
// 起因：原来后台只能删除纠错记录，没有"通过/驳回"的流程，
// 用户纠正的内容没人把关就进了知识库（或永远躺着没人看）。
// 状态机：pending（待复核）→ approved / rejected
//
// 注意：MySQL 的 TEXT 列不允许 DEFAULT，所以 status 用 VARCHAR(16)。
module.exports = {
  id: '002',
  name: '纠错记录增加复核状态',
  async up({ dialect, ensureColumn }) {
    const shortText = dialect === 'mysql' ? 'VARCHAR(16)' : 'TEXT'
    await ensureColumn('corrections', 'status', shortText + " DEFAULT 'pending'")
    await ensureColumn('corrections', 'reviewer', dialect === 'mysql' ? 'VARCHAR(64)' : 'TEXT')
    await ensureColumn('corrections', 'reviewed_at', dialect === 'mysql' ? 'VARCHAR(40)' : 'TEXT')
    await ensureColumn('corrections', 'note', 'TEXT')
    await ensureColumn('corrections', 'disease_id', 'INTEGER')
  }
}
