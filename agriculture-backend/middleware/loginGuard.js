// ==================================================================
// 登录防护：失败次数统计 + 临时锁定 + 登录日志
//
// 思路：
//   1. 同一账号连续输错 N 次 -> 锁定该账号一段时间（防定向爆破）
//   2. 同一 IP 连续输错 M 次 -> 锁定该 IP（防换账号字典攻击）
//   3. 每次尝试都写日志（成功/失败、IP、原因），后台可查“谁在猜密码”
//
// ⚠️ 时间处理注意：SQLite 的 datetime('now') 存的是【UTC】时间。
//    必须用 parseSqliteTime() 显式按 UTC 解析，否则在 UTC+8 环境下
//    会把锁定时间算成 8 小时（旧版本就踩了这个坑）。
// ==================================================================
const { dbRun, dbGet, dbAll } = require('../config/db');

const MAX_FAILS_PER_USER = 5;         // 同一账号允许连续失败次数
const MAX_FAILS_PER_IP = 20;          // 同一 IP 允许连续失败次数
const LOCK_STEPS_MIN = [1, 5, 15, 60]; // 锁定时长阶梯（分钟）
const WINDOW_MIN = 300;                // 统计窗口：最近 5 小时。
                                       // 必须覆盖完整的阶梯升级过程（1+5+15+60≈91 分钟），
                                       // 否则打到高等级时早期记录会被截断，永远升不到第 4 档

// 把 SQLite 的 "YYYY-MM-DD HH:MM:SS" 按 UTC 解析成时间戳
function parseSqliteTime(s) {
  if (!s) return Date.now();
  const t = String(s).trim().replace(' ', 'T');
  return Date.parse(/[Zz]|[+-]\d\d:?\d\d$/.test(t) ? t : t + 'Z');
}

// 取某个 key 的最近失败时间列表（新的在前）
async function recentFailures(where, param) {
  const rows = await dbAll(
    "SELECT create_time FROM login_logs WHERE success = 0 AND " + where +
    " AND create_time >= datetime('now', '-" + WINDOW_MIN + " minutes') ORDER BY id DESC",
    [param]
  );
  return rows.map((r) => parseSqliteTime(r.create_time)).filter((n) => !isNaN(n));
}

// 由失败时间列表推算锁定状态（入参 times 为时间戳数组，顺序不限）
//
// 规则（防爆破机制的核心）：
//   · 每凑满 MAX_FAILS_PER_USER 次失败锁一轮，时长按档递增：1 → 5 → 15 → 60 分钟（封顶 60）
//   · 必须【按时间从旧到新】累计：先发生的失败构成第 1 轮，之后的第 2 轮才能升到第 2 档
//   · 锁定期间攻击者进不来，若库里残留那时的失败记录，直接跳过不重复计数
//   · 登录成功后会清除该账号的失败记录（见 clearFailures），正常用户不会被历史拖累
function evalLock(times) {
  if (!times || !times.length) return { locked: false, fails: 0, level: 0 };
  const now = Date.now();
  const list = times
    .filter((t) => t >= now - WINDOW_MIN * 60 * 1000)
    .sort((a, b) => a - b);   // 从旧到新处理，档位才能逐级累加
  if (!list.length) return { locked: false, fails: 0, level: 0 };

  let level = 0;       // 已经触发的锁定轮数（决定当前档位）
  let count = 0;       // 当前这一轮已累计的失败次数
  let lockEnd = 0;     // 最近一次锁定的结束时间（0 表示当前没有锁定）
  let lockMin = 0;

  for (const t of list) {
    // 关键：如果正处于锁定中，先判断它是否已经过期
    // （旧版在这里写错，会拿后面那次的失败时间去算上一次锁定的终点，导致档位混乱）
    if (lockEnd) {
      if (t < lockEnd) continue;   // 这次失败发生在锁定期间，攻击者本来就被挡住，忽略
      lockEnd = 0;                 // 锁定已过期，重新开始计数
      count = 0;
    }

    count++;
    if (count >= MAX_FAILS_PER_USER) {
      level++;
      count = 0;
      lockMin = LOCK_STEPS_MIN[Math.min(level - 1, LOCK_STEPS_MIN.length - 1)];
      lockEnd = t + lockMin * 60 * 1000;   // 从“触发锁定的那次失败”起算
    }
  }

  if (lockEnd && now < lockEnd) {
    return { locked: true, remain: Math.ceil((lockEnd - now) / 1000), fails: list.length, level, lockMin };
  }
  return { locked: false, fails: count, level };
}

// 登录成功后清除该账号的失败记录：给正常用户一个干净的起点
async function clearFailures(username) {
  try {
    await dbRun('DELETE FROM login_logs WHERE username = ? AND success = 0', [String(username || '').slice(0, 40)]);
  } catch (e) {
    console.error('清除失败记录出错:', e.message);
  }
}

// 检查某账号/IP 的锁定状态
async function checkLock(username, ip) {
  const userTimes = await recentFailures('username = ?', username);
  const userLock = evalLock(userTimes);
  if (userLock.locked) return Object.assign({ scope: '账号' }, userLock);

  const ipTimes = await recentFailures('ip = ?', ip);
  // IP 用固定 15 分钟、阈值 20 次
  if (ipTimes.length >= MAX_FAILS_PER_IP) {
    const earliest = ipTimes[Math.min(MAX_FAILS_PER_IP - 1, ipTimes.length - 1)];
    const end = earliest + 15 * 60 * 1000;
    if (Date.now() < end) {
      return { locked: true, scope: 'IP', remain: Math.ceil((end - Date.now()) / 1000), fails: ipTimes.length, level: 1, lockMin: 15 };
    }
  }
  return { locked: false, userFails: userTimes.length, ipFails: ipTimes.length };
}

// 记录一次登录尝试
async function logAttempt({ username, userId, ip, success, reason, source }) {
  try {
    await dbRun(
      'INSERT INTO login_logs (username, user_id, ip, success, reason, source) VALUES (?, ?, ?, ?, ?, ?)',
      [String(username || '').slice(0, 40), userId || null, String(ip || '').slice(0, 60), success ? 1 : 0,
       String(reason || '').slice(0, 80), String(source || 'api').slice(0, 20)]
    );
  } catch (e) {
    console.error('写登录日志失败:', e.message);
  }
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  const ip = (xf ? String(xf).split(',')[0] : (req.ip || req.connection.remoteAddress || '')).replace('::ffff:', '');
  return ip || 'unknown';
}

// 清理过期日志（保留最近 30 天）
async function cleanOldLogs() {
  try { await dbRun("DELETE FROM login_logs WHERE create_time < datetime('now', '-30 days')"); } catch (e) {}
}

module.exports = {
  checkLock, logAttempt, clientIp, cleanOldLogs, parseSqliteTime, evalLock, clearFailures,
  MAX_FAILS_PER_USER, MAX_FAILS_PER_IP, LOCK_STEPS_MIN, WINDOW_MIN
};
