// 006 · diseases.verified 默认值改为 0
//
// 背景：建表时默认值写成了 1，导致所有"没显式写 verified"的插入（比如用户纠错自动收录）
// 直接上线，绕过审核。代码里已经补了显式 0，这里再把默认值改掉，双保险。
//
// SQLite 改列默认值要重建表，代价大；SQLite 上靠代码显式传 0 保证。
module.exports = {
  id: '006',
  name: 'diseases.verified 默认值改为 0',
  async up({ run, dialect }) {
    if (dialect === 'mysql') {
      await run('ALTER TABLE diseases ALTER COLUMN verified SET DEFAULT 0')
    }
  }
}
