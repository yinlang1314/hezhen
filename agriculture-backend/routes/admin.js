const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { dbRun, dbGet, dbAll } = require('../config/db');
const guard = require('../middleware/loginGuard');

// 登录校验
const checkAuth = (req, res, next) => {
  if (req.session && req.session.isAdmin) next();
  else res.redirect('/admin/login');
};

// 给所有后台页面注入公共变量（当前页高亮、管理员名）
const view = (req, pageTitle, current, extra) => Object.assign({
  pageTitle,
  current,
  adminName: req.session ? req.session.adminName : 'admin',
  adminId: req.session ? req.session.adminId : null   // 用于判断“是否在操作自己的账号”
}, extra || {});

const PAGE_SIZE = 15;

// ==================== 登录 / 退出 ====================

router.get('/login', (req, res) => {
  if (req.session && req.session.isAdmin) return res.redirect('/admin');
  // notice：正常提示（例如改完密码被退出）；errorMessage：出错提示
  res.render('admin/login', {
    errorMessage: req.query.error ? decodeURIComponent(req.query.error) : null,
    notice: req.query.notice ? decodeURIComponent(req.query.notice) : null
  });
});

// 登录验证：只认数据库里标记为管理员的账号（无硬编码后门）
router.post('/login', async (req, res) => {
  const username = String(req.body.username || '').slice(0, 40);
  const password = String(req.body.password || '');
  const ip = guard.clientIp(req);

  // 失败一律返回同一句提示，不告诉对方“账号存在但密码错”这类信息
  const fail = async (reason, userId) => {
    await guard.logAttempt({ username, userId, ip, success: false, reason, source: 'admin' });
    return res.render('admin/login', { errorMessage: '账号或密码错误，或该账号没有管理员权限' });
  };

  try {
    // 1) 先看是否处于锁定状态
    const lock = await guard.checkLock(username, ip);
    if (lock.locked) {
      console.warn('🔒 后台登录被锁定: ' + username + ' @' + ip + ' 来源=' + lock.scope + ' 剩余' + lock.remain + '秒');
      return res.render('admin/login', {
        errorMessage: '尝试次数过多，该' + lock.scope + '已被临时锁定，请 ' + Math.ceil(lock.remain / 60) + ' 分钟后再试'
      });
    }

    const user = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return await fail('账号不存在');

    // 2) 密码校验（先做，避免用 is_admin 差异被枚举账号）
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return await fail('密码错误', user.id);

    // 3) 再判断是否有管理员权限
    if (!user.is_admin) return await fail('非管理员账号', user.id);

    // 4) 登录成功：重置会话 ID，防止会话固定攻击
    req.session.regenerate((err) => {
      if (err) console.error('会话重建失败:', err);
      req.session.isAdmin = true;
      req.session.adminName = user.username;
      req.session.adminId = user.id;
      guard.logAttempt({ username, userId: user.id, ip, success: true, reason: '登录成功', source: 'admin' });
      console.log('🔓 后台登录成功: ' + username + ' @' + ip);
      res.redirect('/admin');
    });
  } catch (e) {
    console.error('后台登录失败:', e);
    return await fail('系统异常');
  }
});

// 修改自己的密码（后台右上角入口）
router.get('/password', checkAuth, (req, res) => {
  res.render('admin/password', view(req, '修改密码', 'password', { flash: { success: req.query.success, error: req.query.error } }));
});

router.post('/password', checkAuth, async (req, res) => {
  try {
    const oldPwd = String(req.body.old_password || '');
    const newPwd = String(req.body.new_password || '');
    const newPwd2 = String(req.body.new_password2 || '');

    if (newPwd.length < 8) return res.redirect('/admin/password?error=' + encodeURIComponent('新密码至少 8 位'));
    if (newPwd === oldPwd) return res.redirect('/admin/password?error=' + encodeURIComponent('新密码不能与旧密码相同'));
    if (newPwd !== newPwd2) return res.redirect('/admin/password?error=' + encodeURIComponent('两次输入的新密码不一致'));
    if (/^(123456|admin|password|111111|000000)$/i.test(newPwd)) {
      return res.redirect('/admin/password?error=' + encodeURIComponent('该密码太常见，容易被猜到，请换一个'));
    }

    const user = await dbGet('SELECT id, password FROM users WHERE id = ?', [req.session.adminId]);
    if (!user) return res.redirect('/admin/login');

    const ok = await bcrypt.compare(oldPwd, user.password);
    if (!ok) return res.redirect('/admin/password?error=' + encodeURIComponent('当前密码不正确'));

    const hashed = await bcrypt.hash(newPwd, 10);
    await dbRun("UPDATE users SET password = ?, pwd_changed_at = datetime('now') WHERE id = ?", [hashed, user.id]);
    console.log('🔑 管理员 ' + req.session.adminName + ' 修改了密码');
    res.redirect('/admin/password?success=' + encodeURIComponent('密码已修改，下次请用新密码登录'));
  } catch (e) {
    console.error('修改密码失败:', e);
    res.redirect('/admin/password?error=' + encodeURIComponent('修改失败'));
  }
});

// 登录日志（查看谁在尝试猜密码）
router.get('/security', checkAuth, async (req, res) => {
  try {
    const logs = await dbAll('SELECT * FROM login_logs ORDER BY id DESC LIMIT 200');
    const failStats = await dbAll(`
      SELECT username, ip, COUNT(*) AS fails, MAX(create_time) AS last_time
      FROM login_logs WHERE success = 0
      GROUP BY username, ip ORDER BY fails DESC LIMIT 20
    `);
    const summary = {
      total: (await dbGet('SELECT COUNT(*) c FROM login_logs'))?.c || 0,
      failed: (await dbGet('SELECT COUNT(*) c FROM login_logs WHERE success = 0'))?.c || 0,
      todayFailed: (await dbGet("SELECT COUNT(*) c FROM login_logs WHERE success = 0 AND create_time >= datetime('now','-1 day')"))?.c || 0
    };
    res.render('admin/security', view(req, '安全与日志', 'security', {
      logs, failStats, summary, flash: { success: req.query.success, error: req.query.error }
    }));
  } catch (e) {
    console.error('读取登录日志失败:', e);
    res.render('admin/security', view(req, '安全与日志', 'security', { logs: [], failStats: [], summary: { total: 0, failed: 0, todayFailed: 0 }, flash: { error: String(e.message) } }));
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// 注册接口（仅已登录的管理员可调用）
router.post('/register', checkAuth, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ code: 400, msg: '请填写完整' });
    if (String(username).length < 4) return res.json({ code: 400, msg: '账号至少4位' });
    if (String(password).length < 6) return res.json({ code: 400, msg: '密码至少6位' });

    const existing = await dbGet('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) return res.json({ code: 400, msg: '用户名已存在' });

    const hashed = await bcrypt.hash(password, 10);
    await dbRun('INSERT INTO users (username, password, is_admin) VALUES (?, ?, 1)', [username, hashed]);
    res.json({ code: 200, msg: '管理员创建成功' });
  } catch (error) {
    console.error('创建管理员失败:', error);
    res.json({ code: 500, msg: '创建失败' });
  }
});

// ==================== 数据概览 ====================

router.get('/', checkAuth, async (req, res) => {
  try {
    const [users, diseases, histories, collections, corrections] = await Promise.all([
      dbGet('SELECT COUNT(*) c FROM users'),
      dbGet('SELECT COUNT(*) c FROM diseases'),
      dbGet('SELECT COUNT(*) c FROM histories'),
      dbGet('SELECT COUNT(*) c FROM collections'),
      dbGet('SELECT COUNT(*) c FROM corrections')
    ]);

    // 最近 7 天识别趋势
    const rows = await dbAll(`
      SELECT date(create_time) AS day, COUNT(*) AS cnt FROM histories
      WHERE create_time >= datetime('now', '-6 days') GROUP BY day
    `);
    const map = {};
    rows.forEach((r) => { map[r.day] = r.cnt; });
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      trend.push({ day: key.slice(5), count: map[key] || 0 });
    }
    const maxTrend = Math.max(1, ...trend.map((t) => t.count));

    // 识别最多的病害
    const hot = await dbAll(`
      SELECT disease_name AS name, COUNT(*) AS count FROM histories
      WHERE disease_name IS NOT NULL AND disease_name <> ''
      GROUP BY disease_name ORDER BY count DESC LIMIT 8
    `);

    const recent = await dbAll(`
      SELECT h.id, h.disease_name, h.confidence, h.create_time, h.image_url,
             u.username, h.user_id
      FROM histories h LEFT JOIN users u ON u.id = h.user_id
      ORDER BY h.create_time DESC, h.id DESC LIMIT 8
    `);

    const newestUsers = await dbAll('SELECT id, username, is_admin, create_time FROM users ORDER BY id DESC LIMIT 5');

    // 系统状态（后台能直接看到 AI 配置与数据库情况）
    const health = {
      database: '正常',
      ai: {
        deepseek: !!process.env.DEEPSEEK_API_KEY,
        baidu: !!(process.env.BAIDU_API_KEY && process.env.BAIDU_SECRET_KEY)
      },
      port: process.env.PORT || 3000,
      nodeVersion: process.version
    };

    res.render('admin/dashboard', view(req, '数据概览', 'dashboard', {
      stats: {
        userCount: (users && users.c) || 0,
        diseaseCount: (diseases && diseases.c) || 0,
        historyCount: (histories && histories.c) || 0,
        collectionCount: (collections && collections.c) || 0,
        correctionCount: (corrections && corrections.c) || 0
      },
      trend, maxTrend, hot, recent, newestUsers, health
    }));
  } catch (e) {
    console.error('后台首页失败:', e);
    res.render('admin/dashboard', view(req, '数据概览', 'dashboard', {
      stats: { userCount: 0, diseaseCount: 0, historyCount: 0, collectionCount: 0, correctionCount: 0 },
      trend: [], maxTrend: 1, hot: [], recent: [], newestUsers: [],
      health: { database: '异常: ' + e.message, ai: {}, port: '', nodeVersion: '' }
    }));
  }
});

// ==================== 用户管理 ====================

router.get('/users', checkAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const keyword = String(req.query.q || '').trim();
    const where = keyword ? 'WHERE username LIKE ?' : '';
    const params = keyword ? ['%' + keyword + '%'] : [];

    const total = (await dbGet('SELECT COUNT(*) c FROM users ' + where, params))?.c || 0;
    const users = await dbAll(`
      SELECT u.id, u.username, u.nickname, u.avatar, u.is_admin, u.create_time,
             (SELECT COUNT(*) FROM histories h WHERE h.user_id = u.id) AS history_count,
             (SELECT COUNT(*) FROM collections c WHERE c.user_id = u.id) AS collection_count
      FROM users u ${where ? 'WHERE u.username LIKE ?' : ''}
      ORDER BY u.id DESC LIMIT ? OFFSET ?
    `, [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE]);

    res.render('admin/users', view(req, '用户管理', 'users', {
      users,
      keyword,
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      total,
      flash: { success: req.query.success, error: req.query.error }
    }));
  } catch (e) {
    console.error('用户列表失败:', e);
    res.render('admin/users', view(req, '用户管理', 'users', { users: [], keyword: '', page: 1, totalPages: 1, total: 0, flash: { error: '读取失败: ' + e.message } }));
  }
});

// 用户详情：资料 + 识别记录 + 收藏
router.get('/users/:id', checkAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const user = await dbGet('SELECT id, username, nickname, avatar, is_admin, create_time FROM users WHERE id = ?', [id]);
    if (!user) return res.redirect('/admin/users?error=用户不存在');

    const histories = await dbAll('SELECT id, disease_name, confidence, level_text, create_time, corrected FROM histories WHERE user_id = ? ORDER BY create_time DESC LIMIT 50', [id]);
    const collections = await dbAll('SELECT id, name, type, create_time FROM collections WHERE user_id = ? ORDER BY create_time DESC LIMIT 50', [id]);
    const corrections = await dbAll('SELECT * FROM corrections WHERE user_id = ? ORDER BY id DESC LIMIT 20', [id]);

    res.render('admin/user_detail', view(req, '用户详情 · ' + user.username, 'users', {
      user, histories, collections, corrections,
      flash: { success: req.query.success, error: req.query.error }
    }));
  } catch (e) {
    console.error('用户详情失败:', e);
    res.redirect('/admin/users?error=读取失败');
  }
});

// 修改用户资料（昵称 / 管理员权限）
router.post('/users/:id/edit', checkAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const nickname = String(req.body.nickname || '').trim().slice(0, 20);
    const isAdmin = req.body.is_admin === '1' ? 1 : 0;

    const user = await dbGet('SELECT id, username, is_admin FROM users WHERE id = ?', [id]);
    if (!user) return res.redirect('/admin/users?error=用户不存在');

    const isSelf = Number(req.session.adminId) === id;
    const demoting = !!user.is_admin && !isAdmin;          // 管理员 -> 普通用户
    const promoting = !user.is_admin && !!isAdmin;          // 普通用户 -> 管理员

    if (demoting) {
      // 1) 不能取消最后一个管理员（否则没人能进后台了）
      const admins = (await dbGet('SELECT COUNT(*) c FROM users WHERE is_admin = 1'))?.c || 0;
      if (admins <= 1) {
        return res.redirect('/admin/users/' + id + '?error=' +
          encodeURIComponent('这是最后一个管理员，不能降级，否则没人能再登录后台'));
      }

      // 2) 管理员把自己的权限取消：允许，但要立刻退出登录，避免“还开着后台却什么都点不动”的困惑
      if (isSelf) {
        await dbRun('UPDATE users SET nickname = ?, is_admin = 0 WHERE id = ?', [nickname, id]);
        console.warn('⚠️ 管理员 ' + req.session.adminName + ' 取消了自己的管理员权限，已强制退出后台');
        return req.session.destroy(() => res.redirect('/admin/login?notice=' +
          encodeURIComponent('你已取消自己的管理员权限，因此被退出后台。如需恢复，请让其他管理员重新赋予权限')));
      }
    }

    await dbRun('UPDATE users SET nickname = ?, is_admin = ? WHERE id = ?', [nickname, isAdmin, id]);

    if (isSelf) {
      // 修改自己的资料：只更新昵称，权限不变（避免误操作把自己关在门外）
      const msg = '昵称已更新' + (promoting ? '，权限未变（自己的权限不能自己提升，请让其他管理员操作）' : '');
      return res.redirect('/admin/users/' + id + '?success=' + encodeURIComponent(msg));
    }
    res.redirect('/admin/users/' + id + '?success=' + encodeURIComponent(promoting ? '已设为管理员' : '资料已更新'));
  } catch (e) {
    console.error('修改用户失败:', e);
    res.redirect('/admin/users?error=修改失败');
  }
});

// 重置用户密码
router.post('/users/:id/password', checkAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const password = String(req.body.password || '');
    const isSelf = Number(req.session.adminId) === id;

    // 重置自己的密码：要求 8 位，并在成功后强制重新登录
    // （否则旧会话一直有效，密码改了却没有任何感觉）
    if (isSelf) {
      if (password.length < 8) return res.redirect('/admin/users/' + id + '?error=' + encodeURIComponent('给自己重置密码请用 8 位以上'));
      if (/^(123456|admin|password|111111|000000)$/i.test(password)) {
        return res.redirect('/admin/users/' + id + '?error=' + encodeURIComponent('该密码太常见，容易被猜到，请换一个'));
      }
      const hashedSelf = await bcrypt.hash(password, 10);
      await dbRun("UPDATE users SET password = ?, pwd_changed_at = datetime('now') WHERE id = ?", [hashedSelf, id]);
      await guard.logAttempt({ username: req.session.adminName, userId: id, ip: guard.clientIp(req), success: true, reason: '后台重置了自己密码', source: 'admin' });
      console.warn('🔑 管理员 ' + req.session.adminName + ' 重置了自己的密码，已强制退出');
      return req.session.destroy(() => res.redirect('/admin/login?notice=' +
        encodeURIComponent('密码已重置，请用新密码重新登录')));
    }

    if (password.length < 6) return res.redirect('/admin/users/' + id + '?error=密码至少6位');

    const hashed = await bcrypt.hash(password, 10);
    const r = await dbRun("UPDATE users SET password = ?, pwd_changed_at = datetime('now') WHERE id = ?", [hashed, id]);
    if (!r || !r.changes) return res.redirect('/admin/users?error=用户不存在');
    res.redirect('/admin/users/' + id + '?success=' + encodeURIComponent('密码已重置，请把新密码告知该用户'));
  } catch (e) {
    console.error('重置密码失败:', e);
    res.redirect('/admin/users?error=重置失败');
  }
});

// 删除用户（连同其识别记录、收藏、纠错记录一起清理）
router.post('/users/:id/delete', checkAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const user = await dbGet('SELECT id, username, is_admin FROM users WHERE id = ?', [id]);
    if (!user) return res.redirect('/admin/users?error=用户不存在');

    // 安全约束：不能删自己，也不能删最后一个管理员
    if (req.session.adminId === id) return res.redirect('/admin/users?error=不能删除当前登录的账号');
    if (user.is_admin) {
      const admins = (await dbGet('SELECT COUNT(*) c FROM users WHERE is_admin = 1'))?.c || 0;
      if (admins <= 1) return res.redirect('/admin/users?error=不能删除最后一个管理员');
    }

    const h = await dbRun('DELETE FROM histories WHERE user_id = ?', [id]);
    const c = await dbRun('DELETE FROM collections WHERE user_id = ?', [id]);
    await dbRun('DELETE FROM corrections WHERE user_id = ?', [id]);
    await dbRun('DELETE FROM users WHERE id = ?', [id]);

    const msg = `已删除用户「${user.username}」及其 ${(h && h.changes) || 0} 条识别记录、${(c && c.changes) || 0} 条收藏`;
    console.log('🗑️ 后台删除用户: ' + msg);
    res.redirect('/admin/users?success=' + encodeURIComponent(msg));
  } catch (e) {
    console.error('删除用户失败:', e);
    res.redirect('/admin/users?error=删除失败');
  }
});

// 清空某用户的识别记录
router.post('/users/:id/clear-history', checkAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const r = await dbRun('DELETE FROM histories WHERE user_id = ?', [id]);
    res.redirect('/admin/users/' + id + '?success=' + encodeURIComponent('已清空 ' + ((r && r.changes) || 0) + ' 条识别记录'));
  } catch (e) {
    res.redirect('/admin/users?error=清空失败');
  }
});

// ==================== 识别历史 ====================

router.get('/histories', checkAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const keyword = String(req.query.q || '').trim();
    const onlyCorrected = req.query.corrected === '1';

    const conds = [];
    const params = [];
    if (keyword) { conds.push('(h.disease_name LIKE ? OR u.username LIKE ?)'); params.push('%' + keyword + '%', '%' + keyword + '%'); }
    if (onlyCorrected) conds.push("h.corrected = '1'");
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const total = (await dbGet('SELECT COUNT(*) c FROM histories h LEFT JOIN users u ON u.id = h.user_id ' + where, params))?.c || 0;
    const rows = await dbAll(`
      SELECT h.*, u.username
      FROM histories h LEFT JOIN users u ON u.id = h.user_id
      ${where}
      ORDER BY h.create_time DESC, h.id DESC LIMIT ? OFFSET ?
    `, [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE]);

    res.render('admin/histories', view(req, '识别历史', 'histories', {
      rows, keyword, onlyCorrected, page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      total,
      flash: { success: req.query.success, error: req.query.error }
    }));
  } catch (e) {
    console.error('历史列表失败:', e);
    res.render('admin/histories', view(req, '识别历史', 'histories', { rows: [], keyword: '', onlyCorrected: false, page: 1, totalPages: 1, total: 0, flash: { error: String(e.message) } }));
  }
});

// 删除单条识别记录
router.post('/histories/:id/delete', checkAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const row = await dbGet('SELECT image_url FROM histories WHERE id = ?', [id]);
    await dbRun('DELETE FROM histories WHERE id = ?', [id]);
    // 顺手删掉对应的图片文件，避免 uploads 目录越堆越多
    if (row && row.image_url) {
      const rel = String(row.image_url).replace(/^https?:\/\/[^/]+/, '');
      if (rel.indexOf('/uploads/') === 0) {
        try { fs.unlinkSync(require('path').join(__dirname, '../public', rel)); } catch (err) { /* 文件可能已不存在 */ }
      }
    }
    res.redirect('/admin/histories?success=已删除该条记录');
  } catch (e) {
    console.error('删除记录失败:', e);
    res.redirect('/admin/histories?error=删除失败');
  }
});

// 批量删除识别记录
router.post('/histories/batch-delete', checkAuth, async (req, res) => {
  try {
    let ids = req.body.ids || [];
    if (!Array.isArray(ids)) ids = [ids];
    ids = ids.map((x) => parseInt(x)).filter((x) => x > 0);
    if (!ids.length) return res.redirect('/admin/histories?error=请先勾选要删除的记录');

    const marks = ids.map(() => '?').join(',');
    const rows = await dbAll('SELECT image_url FROM histories WHERE id IN (' + marks + ')', ids);
    const r = await dbRun('DELETE FROM histories WHERE id IN (' + marks + ')', ids);
    for (const row of rows) {
      const rel = String(row.image_url || '').replace(/^https?:\/\/[^/]+/, '');
      if (rel.indexOf('/uploads/') === 0) {
        try { fs.unlinkSync(require('path').join(__dirname, '../public', rel)); } catch (e) {}
      }
    }
    res.redirect('/admin/histories?success=' + encodeURIComponent('已删除 ' + ((r && r.changes) || 0) + ' 条记录'));
  } catch (e) {
    console.error('批量删除失败:', e);
    res.redirect('/admin/histories?error=批量删除失败');
  }
});

// 导出识别记录为 CSV
router.get('/histories/export.csv', checkAuth, async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT h.id, u.username, h.disease_name, h.plant_name, h.confidence, h.level_text,
             h.ai_source, h.corrected, h.create_time
      FROM histories h LEFT JOIN users u ON u.id = h.user_id
      ORDER BY h.create_time DESC
    `);
    const head = ['ID', '用户', '病害名称', '寄主植物', '置信度', '危害等级', '识别来源', '是否人工纠正', '识别时间'];
    const esc = (v) => '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
    const lines = [head.map(esc).join(',')];
    rows.forEach((r) => lines.push([r.id, r.username || '未登录', r.disease_name, r.plant_name, r.confidence,
      r.level_text, r.ai_source, r.corrected === '1' ? '是' : '否', r.create_time].map(esc).join(',')));
    // 加 BOM，Excel 打开中文不乱码
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="histories.csv"');
    res.send('\uFEFF' + lines.join('\r\n'));
  } catch (e) {
    res.redirect('/admin/histories?error=导出失败');
  }
});

// ==================== 用户纠错 ====================

router.get('/corrections', checkAuth, async (req, res) => {
  const status = ['pending', 'approved', 'rejected', 'all'].includes(String(req.query.status)) ? String(req.query.status) : 'pending'
  try {
    const where = status === 'all' ? '' : 'WHERE COALESCE(c.status, \'pending\') = ?'
    const params = status === 'all' ? [] : [status]
    const rows = await dbAll(`
      SELECT c.*, u.username, d.name AS disease_name_live, d.verified AS disease_verified
      FROM corrections c
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN diseases d ON d.id = c.disease_id
      ${where}
      ORDER BY c.create_time DESC, c.id DESC LIMIT 200
    `, params)

    // 各状态数量（给页签上显示）
    const counts = { pending: 0, approved: 0, rejected: 0, all: 0 }
    const stat = await dbAll(`SELECT COALESCE(status, 'pending') AS s, COUNT(*) AS n FROM corrections GROUP BY COALESCE(status, 'pending')`)
    stat.forEach((r) => { counts[r.s] = Number(r.n) || 0; counts.all += Number(r.n) || 0 })

    res.render('admin/corrections', view(req, '用户纠错', 'corrections', {
      rows, counts, status,
      flash: { success: req.query.success, error: req.query.error }
    }))
  } catch (e) {
    res.render('admin/corrections', view(req, '用户纠错', 'corrections', {
      rows: [], counts: { pending: 0, approved: 0, rejected: 0, all: 0 }, status,
      flash: { error: String(e.message) }
    }))
  }
});

// 批量核实：只处理"有数据来源"的条目，没来源的一律跳过并报数
router.post('/diseases/batch-verify', checkAuth, async (req, res) => {
  try {
    let ids = req.body.ids || []
    if (!Array.isArray(ids)) ids = [ids]
    ids = ids.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n))
    if (!ids.length) return res.redirect('/admin/diseases?error=' + encodeURIComponent('没有选中任何条目'))

    const marks = ids.map(() => '?').join(',')
    const rows = await dbAll('SELECT id, name, verify_source FROM diseases WHERE id IN (' + marks + ')', ids)
    const okIds = rows.filter((r) => String(r.verify_source || '').trim()).map((r) => r.id)
    const skipped = rows.length - okIds.length
    const today = new Date().toISOString().slice(0, 10)

    if (okIds.length) {
      const m2 = okIds.map(() => '?').join(',')
      await dbRun("UPDATE diseases SET verified = 1, verify_date = COALESCE(NULLIF(verify_date, ''), ?), category = REPLACE(category, '（AI草稿）', '') WHERE id IN (" + m2 + ')', [today].concat(okIds))
    }

    let msg = '已核实 ' + okIds.length + ' 条'
    if (skipped) msg += '，跳过 ' + skipped + ' 条（没填数据来源，不能上线）'
    res.redirect('/admin/diseases?success=' + encodeURIComponent(msg))
  } catch (e) {
    res.redirect('/admin/diseases?error=' + encodeURIComponent(String(e.message)))
  }
})

// 复核：通过（把对应病害标为已核实）/ 驳回
router.post('/corrections/:id/review', checkAuth, async (req, res) => {
  const id = parseInt(req.params.id)
  const action = String((req.body && req.body.action) || '')
  const note = String((req.body && req.body.note) || '').trim().slice(0, 200)
  const reviewer = (req.session && req.session.adminUser) || 'admin'
  try {
    const rows = await dbAll('SELECT * FROM corrections WHERE id = ?', [id])
    const c = rows && rows[0]
    if (!c) return res.redirect('/admin/corrections?error=记录不存在')

    if (action === 'approve') {
      // 找对应的病害（优先用回填的 id，其次按名称匹配）
      let disease = null
      if (c.disease_id) {
        const r = await dbAll('SELECT id, name, verified FROM diseases WHERE id = ?', [c.disease_id])
        disease = r && r[0]
      }
      if (!disease) {
        const r = await dbAll('SELECT id, name, verified FROM diseases WHERE name = ?', [String(c.correct_name || '').trim()])
        disease = r && r[0]
      }
      if (!disease) {
        return res.redirect('/admin/corrections?error=知识库里没有「' + encodeURIComponent(String(c.correct_name || '')) + '」，请先在病虫害库新增')
      }
      const today = new Date().toISOString().slice(0, 10)
      await dbRun('UPDATE diseases SET verified = 1, verify_source = ?, verify_date = ? WHERE id = ?',
        ['用户纠错 · 人工复核', today, disease.id])
      await dbRun('UPDATE corrections SET status = ?, reviewer = ?, reviewed_at = ?, note = ?, disease_id = ? WHERE id = ?',
        ['approved', reviewer, new Date().toISOString(), note, disease.id, id])
      return res.redirect('/admin/corrections?success=' + encodeURIComponent('已通过，「' + disease.name + '」标为已核实'))
    }

    if (action === 'reject') {
      await dbRun('UPDATE corrections SET status = ?, reviewer = ?, reviewed_at = ?, note = ? WHERE id = ?',
        ['rejected', reviewer, new Date().toISOString(), note, id])
      return res.redirect('/admin/corrections?status=rejected&success=已驳回')
    }

    res.redirect('/admin/corrections?error=未知操作')
  } catch (e) {
    res.redirect('/admin/corrections?error=' + encodeURIComponent(String(e.message)))
  }
});

// 删除纠错记录
router.post('/corrections/:id/delete', checkAuth, async (req, res) => {
  try {
    await dbRun('DELETE FROM corrections WHERE id = ?', [parseInt(req.params.id)]);
    res.redirect('/admin/corrections?success=已删除');
  } catch (e) {
    res.redirect('/admin/corrections?error=删除失败');
  }
});

// ==================== 用户意见反馈 ====================

router.get('/feedback', checkAuth, async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT f.*, u.username FROM feedback f LEFT JOIN users u ON u.id = f.user_id
      ORDER BY f.create_time DESC, f.id DESC LIMIT 300
    `)
    res.render('admin/feedback', view(req, '意见反馈', 'feedback', {
      rows,
      flash: { success: req.query.success, error: req.query.error }
    }))
  } catch (e) {
    res.render('admin/feedback', view(req, '意见反馈', 'feedback', {
      rows: [],
      flash: { error: String(e.message) }
    }))
  }
})

router.post('/feedback/:id/delete', checkAuth, async (req, res) => {
  try {
    await dbRun('DELETE FROM feedback WHERE id = ?', [parseInt(req.params.id)])
    res.redirect('/admin/feedback?success=已删除')
  } catch (e) {
    res.redirect('/admin/feedback?error=删除失败')
  }
})

// ==================== 病虫害：列表页快捷补图 ====================
const multer = require('multer');
const pathMod = require('path');
const fsMod = require('fs');
const UPLOAD_DIR = pathMod.join(__dirname, '..', 'public', 'uploads');
if (!fsMod.existsSync(UPLOAD_DIR)) fsMod.mkdirSync(UPLOAD_DIR, { recursive: true });

const imgUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = (pathMod.extname(file.originalname || '') || '.jpg').toLowerCase();
      cb(null, 'disease-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) return cb(new Error('只能上传图片文件'))
    cb(null, true)
  }
});

const uploadGuard = (err, req, res, next) => {
  if (err) return res.redirect('/admin/diseases?error=' + encodeURIComponent(err.message || '上传失败'))
  next()
};

// 核实 / 取消核实：只有核实过的数据才会出现在 App 里
router.post('/diseases/:id/verify', checkAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const to = String(req.query.to || '1') === '1' ? 1 : 0;
  try {
    const row = await dbGet('SELECT name, verify_source FROM diseases WHERE id = ?', [id]);
    if (!row) return res.redirect('/admin/diseases?error=' + encodeURIComponent('病害不存在'));
    // 没有数据来源的不允许上线：真实数据必须有出处
    if (to === 1 && !String(row.verify_source || '').trim()) {
      return res.redirect('/admin/diseases?error=' + encodeURIComponent('「' + row.name + '」还没填数据来源，请先编辑补上再核实'));
    }
    // 核实后去掉「（AI草稿）」标记，表示内容已人工确认
    await dbRun("UPDATE diseases SET verified = ?, category = REPLACE(category, '（AI草稿）', '') WHERE id = ?", [to, id]);
    res.redirect('/admin/diseases?success=' + encodeURIComponent('已' + (to ? '核实「' + row.name + '」，App 可见' : '取消核实「' + row.name + '」，App 已隐藏')));
  } catch (e) {
    res.redirect('/admin/diseases?error=' + encodeURIComponent('操作失败：' + e.message));
  }
});

router.post('/diseases/:id/image', checkAuth, imgUpload.single('image'), uploadGuard, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!req.file) return res.redirect('/admin/diseases?error=' + encodeURIComponent('请选择一张图片'));
  try {
    const row = await dbGet('SELECT image, name FROM diseases WHERE id = ?', [id]);
    if (!row) return res.redirect('/admin/diseases?error=' + encodeURIComponent('病害不存在'));
    // 旧图删掉，避免堆积
    if (row.image) {
      try { fsMod.unlinkSync(pathMod.join(__dirname, '..', 'public', String(row.image).replace(/^\//, ''))) } catch (e) {}
    }
    await dbRun('UPDATE diseases SET image = ? WHERE id = ?', ['/uploads/' + req.file.filename, id]);
    res.redirect('/admin/diseases?success=' + encodeURIComponent('已给「' + row.name + '」更新配图'));
  } catch (e) {
    console.error('补图失败:', e);
    res.redirect('/admin/diseases?error=' + encodeURIComponent('保存失败：' + e.message));
  }
});

// ==================== 病虫害管理（复用 routes/disease.js）====================
router.use('/diseases', checkAuth, require('./disease'));

module.exports = router;
