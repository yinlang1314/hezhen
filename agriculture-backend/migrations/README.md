# 数据库迁移

**规则：以后所有表结构改动都写在这里，不要再改 `config/db.js` 的 initTables()。**

`initTables()` 只是"第一版基线"，负责把空库建起来；之后的加字段、加表、加索引，
一律新增一个迁移文件。这样换电脑、换数据库（MySQL/SQLite）时结构能复现。

## 新增一个迁移

```js
// migrations/002_add_something.js
module.exports = {
  id: '002',                    // 三位数字，按顺序执行
  name: '给 histories 加地块字段',
  async up({ run, all, ensureColumn, ensureIndex }) {
    await ensureColumn('histories', 'plot_id', 'INTEGER')
    await ensureIndex('histories', 'idx_histories_plot', ['plot_id'])
  }
}
```

`up()` 拿到的工具：

| 工具 | 作用 |
|---|---|
| `run(sql, params)` | 执行写语句 |
| `all(sql, params)` | 查询 |
| `dialect` | `'mysql'` 或 `'sqlite'`，需要写方言分支时用 |
| `ensureColumn(table, column, typeSql)` | 列不存在才加（MySQL/SQLite 通用）|
| `ensureIndex(table, name, columns)` | 索引不存在才建（MySQL 没有 IF NOT EXISTS）|

## 什么时候执行

后端启动时自动跑（`initDB()` 里调用），执行过的记录在 `schema_version` 表。

手动查看/执行：

```bash
npm run migrate        # 看哪些还没跑
npm run migrate:up     # 手动跑
```

## 注意

- 迁移**只往前不回滚**；写错了就再加一个 003 修正，不要改已执行的文件（别的电脑已经跑过了）
- 迁移里不要写数据初始化（默认用户、示例数据放在 `initDefaultUsers()` 这类函数里）
