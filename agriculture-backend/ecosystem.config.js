// PM2 生产配置：pm2 start ecosystem.config.js --env production
// 常用命令：
//   pm2 start ecosystem.config.js --env production   # 启动
//   pm2 logs agr-backend                             # 看日志
//   pm2 restart agr-backend                          # 重启（改代码后）
//   pm2 stop agr-backend                             # 停止
//   pm2 save && pm2 startup                          # 开机自启
module.exports = {
  apps: [{
    name: 'agr-backend',
    script: 'app.js',
    cwd: __dirname,

    // 单进程：SQLite 是文件数据库，多进程写会互相锁
    instances: 1,
    exec_mode: 'fork',

    // 崩溃自动重启，但避免疯狂重启
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 3000,

    // 内存超过 400MB 自动重启（防内存泄漏拖垮服务器）
    max_memory_restart: '400M',

    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
      // 域名配好后可以把跨域收紧：
      // CORS_ORIGIN: 'https://your-domain.com'
    },

    // 日志文件（PM2 自己管理，按大小滚动）
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    merge_logs: true,
    time: true
  }]
};
