<?php
// ===== Jay Chat PHP 后端配置 =====
// 本地/零配置默认使用 SQLite（自动创建）
// InfinityFree 部署时：改为 mysql 并填下面 4 个值（控制面板 → MySQL 数据库里可以看到）
//   主机名一般是  sqlXXX.epizy.com  或  sqlXXX.infinityfree.com

define('DB_DRIVER', 'sqlite');            // 'sqlite' 或 'mysql'

define('DB_MYSQL_HOST', 'sqlXXX.epizy.com');
define('DB_MYSQL_NAME', 'epiz_XXXXXX_jaychat');
define('DB_MYSQL_USER', 'epiz_XXXXXX');
define('DB_MYSQL_PASS', '你的数据库密码');

// SQLite 数据文件存放目录（保持默认即可）
define('DB_SQLITE_PATH', __DIR__ . '/../data/jaychat.sqlite');

// 邮箱验证码（163 SMTP）
define('SMTP_HOST', 'smtp.163.com');
define('SMTP_PORT', 465);
define('SMTP_USER', 'jtxnb886@163.com');
define('SMTP_PASS', 'FLLRDtadYAfGXp9Y');
define('SMTP_FROM', 'jtxnb886@163.com');
define('SMTP_FROM_NAME', 'Jay Chat');

// Jay AI（智谱 GLM-4-Flash）
define('AI_URL', 'https://open.bigmodel.cn/api/paas/v4/chat/completions');
define('AI_KEY', 'd63d18de6bcf4a92a13a78696e401e83.0MIXAf8ANp2tG9BD');
define('AI_MODEL', 'GLM-4-Flash');

// 在线判定窗口（秒）：客户端每 12 秒心跳一次，留 3 倍余量避免误判离线
define('ONLINE_WINDOW', 35);

// ===== 腾讯云 IM（实时消息通道）=====
// 控制台：即时通信 IM → 应用管理 → 查看密钥。密钥仅供服务端使用，切勿外泄。
define('TIM_SDKAPPID', 1600167563);
define('TIM_SECRET', '905e603b25e4407fc8996a45df3ecee66f098c38b3313031b2d82c8426ef16ba');
// REST API 调用身份（腾讯 IM 应用默认存在 administrator 账号）
define('TIM_ADMIN_IDENTIFIER', 'administrator');
// 本服务的公网地址（用于把头像等相对地址补全给腾讯 IM；留空则自动按当前请求推断）
define('APP_BASE_URL', '');
