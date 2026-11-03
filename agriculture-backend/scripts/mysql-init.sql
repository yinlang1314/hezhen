-- 禾诊：MySQL 初始化（在任意 MySQL 客户端里执行一次）
-- 生成时间：2026-10-25

CREATE DATABASE IF NOT EXISTS hezhen
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

-- 专用账号（密码改成你自己想要的，记得同步 .env）
CREATE USER IF NOT EXISTS 'hezhen'@'localhost' IDENTIFIED BY 'Hezhen2026';
GRANT ALL PRIVILEGES ON hezhen.* TO 'hezhen'@'localhost';
FLUSH PRIVILEGES;

-- 表结构由后端启动时自动创建（config/db-mysql.js），这里不用建表。
