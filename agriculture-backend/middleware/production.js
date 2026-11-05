// ==================================================================
// 生产环境增强中间件 —— 只用 Node 内置模块，不引入任何新依赖
//   · 响应压缩（gzip/deflate）
//   · 安全响应头
//   · 访问日志
// ==================================================================
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ---------------- 1. 响应压缩 ----------------
// 实现要点（踩过的坑）：
//   必须先把 res.write/res.end 替换成“收集数据”版本，再调用它们，
//   否则会调用到被替换后的自己，导致响应永远发不出去（表现为请求挂起）。
//   另外要判断 res.headersSent：如果响应头已经发出，就不要再改编码了。
function compression(opts) {
  const threshold = (opts && opts.threshold) || 1024;
  const level = (opts && opts.level) || 6;

  const pickEncoding = (accept) => {
    if (!accept) return null;
    if (/\bgzip\b/.test(accept)) return 'gzip';
    if (/\bdeflate\b/.test(accept)) return 'deflate';
    return null;
  };
  const compress = (buf, encoding) =>
    encoding === 'gzip' ? zlib.gzipSync(buf, { level }) : zlib.deflateSync(buf, { level });

  return function (req, res, next) {
    if (req.method === 'HEAD') return next();
    const encoding = pickEncoding(req.headers['accept-encoding']);
    if (!encoding) return next();

    // 先保存 Node 原生的 write/end，再替换
    const rawWrite = res.write;
    const rawEnd = res.end;
    const chunks = [];

    res.write = function (chunk, enc, cb) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof enc === 'string' ? enc : 'utf8'));
      if (typeof enc === 'function') enc();
      else if (typeof cb === 'function') cb();
      return true;
    };

    res.end = function (chunk, enc, cb) {
      if (chunk && !(typeof chunk === 'function')) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof enc === 'string' ? enc : 'utf8'));
      }
      if (typeof chunk === 'function') cb = chunk;
      if (typeof enc === 'function') cb = enc;

      const body = chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);
      const type = String(res.getHeader('Content-Type') || '');
      const skipType = /image|video|audio|zip|gzip|woff|font|octet-stream/i.test(type);

      // 响应头已经发出、内容太小、类型不适合压缩、已经编码过 —— 都直接原样发出
      if (res.headersSent || res.writableEnded || body.length < threshold || skipType || res.getHeader('Content-Encoding')) {
        return rawEnd.call(res, body, cb);
      }

      let out;
      try { out = compress(body, encoding); }
      catch (e) { return rawEnd.call(res, body, cb); }

      res.setHeader('Content-Encoding', encoding);
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Content-Length', out.length);
      return rawEnd.call(res, out, cb);
    };

    next();
  };
}

// ---------------- 2. 安全响应头 ----------------
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  res.setHeader('X-XSS-Protection', '0');
  res.removeHeader('X-Powered-By');
  next();
}

// ---------------- 3. 访问日志 ----------------
function accessLog(opts) {
  const dir = (opts && opts.dir) || path.join(__dirname, '../logs');
  let stream = null;
  let currentDay = '';
  const openIfNeeded = () => {
    const day = new Date().toISOString().slice(0, 10);
    if (stream && day === currentDay) return;
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (stream) stream.end();
      stream = fs.createWriteStream(path.join(dir, 'access-' + day + '.log'), { flags: 'a' });
      currentDay = day;
    } catch (e) { stream = null; }
  };
  return function (req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
      try {
        const url = req.originalUrl || req.url || '';
        if (/^\/uploads\//.test(url) && res.statusCode < 400) return;
        openIfNeeded();
        if (!stream) return;
        const ip = String(req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress || '')
          .replace('::ffff:', '').split(',')[0].trim();
        stream.write([
          new Date().toISOString(), ip, req.method,
          // 脱敏：URL 里可能带 token（<image> 标签带不了请求头，只能拼 query）
          decodeURIComponent(url).replace(/([?&](token|access_token|jwt)=)[^&]*/gi, '$1***').slice(0, 200),
          res.statusCode, (Date.now() - start) + 'ms'
        ].join(' | ') + '\n');
      } catch (e) { /* 日志失败不影响业务 */ }
    });
    next();
  };
}


// ---------------- 4. 错误日志落盘 ----------------
// 为什么需要：服务端的 console 输出重启就没了，
// 识别失败、病害收录失败这类问题事后根本查不到。
// 这里把 console.error 也写一份到 logs/error-日期.log。
function errorLog(opts) {
  const dir = (opts && opts.dir) || path.join(__dirname, '../logs')
  let stream = null
  let day = ''
  const open = () => {
    const d = new Date().toISOString().slice(0, 10)
    if (stream && d === day) return
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      if (stream) stream.end()
      stream = fs.createWriteStream(path.join(dir, 'error-' + d + '.log'), { flags: 'a' })
      day = d
    } catch (e) { stream = null }
  }
  // 包装 console.error / console.warn，保留原有输出
  const origError = console.error.bind(console)
  const origWarn = console.warn.bind(console)
  const write = (level, args) => {
    try {
      open()
      if (!stream) return
      const text = args.map((a) => (a && a.stack) ? a.stack : (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
      stream.write(new Date().toISOString() + ' [' + level + '] ' + text + '\n')
    } catch (e) { /* 日志失败不影响业务 */ }
  }
  console.error = function () { write('ERROR', [...arguments]); origError(...arguments) }
  console.warn = function () { write('WARN', [...arguments]); origWarn(...arguments) }
  return (req, res, next) => next()
}

module.exports = { compression, securityHeaders, accessLog, errorLog };

