// 001 · 补常用索引
//
// 起因：列表接口按 user_id 过滤 + 按时间倒序，数据一多就全表扫。
// 这些索引 MySQL 8 和 SQLite 都支持，只是 MySQL 没有 CREATE INDEX IF NOT EXISTS，
// 所以统一走 ensureIndex()（先查 information_schema / PRAGMA 再建）。
module.exports = {
  id: '001',
  name: '补常用查询索引',
  async up({ ensureIndex }) {
    await ensureIndex('histories', 'idx_histories_user_time', ['user_id', 'create_time'])
    await ensureIndex('collections', 'idx_collections_user', ['user_id'])
    await ensureIndex('diseases', 'idx_diseases_name', ['name'])
    await ensureIndex('warnings', 'idx_warnings_create_time', ['create_time'])
  }
}
