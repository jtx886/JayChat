# Jay Chat · InfinityFree 免费虚拟主机部署教程

> 本教程把 Jay Chat 的 **PHP 版后端**部署到 InfinityFree 免费主机，手机 APK 即可跨网络实时聊天。
> 消息通过 2 秒轮询同步（延迟 1~3 秒），其余功能（邮件验证码、AI、阅后即焚、已读、动态、通知）全部可用。

---

## 第 1 步：注册 InfinityFree 并创建主机

1. 打开 https://app.infinityfree.com/register 注册账号（邮箱验证）
2. 登录后点 **Create Account** 创建主机：
   - 选一个免费域名后缀（如 `xxxxx.epizy.com` 或 `xxxxx.infinityfreeapp.com`）
   - 这个域名就是你以后的服务器地址，记下来
3. 创建后进入控制面板（Control Panel），首次进入会让你设置 FTP 密码，记下来

## 第 2 步：开启免费 SSL（重要！）

APK 要求 HTTPS。控制面板里：

1. 找到 **Free SSL Certificates** → 为你的域名申请证书
2. 按提示回到域名管理把 CNAME 记录加上，等状态变为 **Active**（约几分钟）
3. 之后 `https://你的域名.epizy.com` 才能正常访问

## 第 3 步：创建 MySQL 数据库

1. 控制面板 → **MySQL Databases**
2. 点 **MySQL Databases** 创建一个新数据库
3. 页面会显示 4 个信息，全部记下来：

| 信息 | 长什么样 |
|---|---|
| MySQL Host Name | `sqlXXX.epizy.com` |
| Database Name | `epiz_XXXXXX_jaychat` |
| Username | `epiz_XXXXXX` |
| Password | 你设置的密码 |

## 第 4 步：修改配置文件

解压 `jaychat-infinityfree.zip`，用记事本打开 **`api/config.php`**，把开头改成：

```php
define('DB_DRIVER', 'mysql');          // 由 'sqlite' 改为 'mysql'

define('DB_MYSQL_HOST', 'sqlXXX.epizy.com');       // 第3步记下的 Host
define('DB_MYSQL_NAME', 'epiz_XXXXXX_jaychat');    // 第3步记下的 Database Name
define('DB_MYSQL_USER', 'epiz_XXXXXX');            // 第3步记下的 Username
define('DB_MYSQL_PASS', '你的数据库密码');           // 第3步记下的 Password
```

> 邮箱验证码和 AI 的配置已经填好，不用改。

## 第 5 步：上传文件到 htdocs

**方式一：网页文件管理器（最简单）**
1. 控制面板 → **Online File Manager**（或 File Manager）
2. 进入 `htdocs` 目录
3. 点 **Upload**，把 zip 里的**所有内容**（index.html、css、js、api、uploads、.htaccess 等）全部上传
   - 如果只能上传 zip：先上传 zip，再在文件管理器里右键 → **Extract** 解压到 htdocs

**方式二：FTP 客户端（FileZilla）**
1. 主机：`ftpupload.net`，端口 21，加密：显式 FTP over TLS
2. 用户名/密码：控制面板显示的 FTP 账号（`epiz_XXXXXX`）
3. 把 zip 内容全部拖进 `htdocs`

> ⚠️ 注意是 zip **里面的内容**放进 htdocs，不要多套一层文件夹。

## 第 6 步：验证部署

浏览器打开：

```
https://你的域名.epizy.com/api/server-info
```

看到下面的 JSON 就说明部署成功：

```json
{"type":"php","version":"1.1.0","time":1700000000}
```

## 第 7 步：APP 连接服务器

1. 打开 Jay Chat APP
2. 登录页底部点 **「⚙️ 服务器设置」**
3. 输入 `https://你的域名.epizy.com` → 保存
4. 正常注册 / 登录即可（每个新用户自动加入 Jay Chat官方群）

---

## 常见问题

**Q: 打开 API 显示 403/安全检查页面？**
InfinityFree 有浏览器校验机制，先用手机/电脑浏览器正常访问一次你的网站首页，再在 APP 里使用。

**Q: 视频发送失败？**
InfinityFree 免费版单文件上传上限约 10MB，请发送短视频或压缩后的图片（图片会自动压缩）。

**Q: 消息延迟有点高？**
轮询模式下正常 1~3 秒。若想要毫秒级实时，可随时切换到仓库里的 Node 版后端（Render 一键部署，WebSocket 真实时），APP 无需改动。

**Q: 账号被暂停？**
InfinityFree 免费主机要求每月登录面板一次保持活跃。

**Q: 数据库表会自动创建吗？**
会。第一次访问任何 API 时自动建表，并自动创建官方账号「杰同学」和「Jay Chat官方群」。

## 目录结构（上传后的 htdocs）

```
htdocs/
├── index.html          # APP 前端
├── css/ js/            # 前端资源
├── config.js           # 前端配置（可留空，用 APP 内服务器设置）
├── api/                # PHP 后端
│   ├── index.php       # 路由与全部接口
│   ├── lib.php         # 数据库与公共函数
│   ├── config.php      # ← 需要修改的数据库配置
│   └── phpmailer/      # 邮件库
├── uploads/            # 上传的图片/视频/头像
└── .htaccess           # URL 重写（必须上传）
```
