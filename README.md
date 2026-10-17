# Jay Chat 💬

一个功能完整的跨网络实时 IM 聊天 APP（类微信），含服务端 + Android APK。

## ✨ 功能总览

| 模块 | 功能 |
|---|---|
| 账号 | 注册（昵称 1-6 字符，仅支持 @qq.com / @163.com 邮箱 + SMTP 验证码）、登录（用户名或邮箱）、自动登录、忘记密码（邮箱验证码重置） |
| 官方群 | 每个新用户自动加入「Jay Chat官方群」（蓝色 ✔ 官方认证、不可退群），群主为官方账号「杰同学」 |
| 官方 AI | 官方群输入 `@` 弹出 **Jay AI**，发送后 AI 实时回复（智谱 GLM-4-Flash），绿色「机器人」标识 |
| 聊天 | 实时收发（WebSocket）、emoji 分类表情 + 动画表情包（在线 GIF + 内置动画贴纸）、图片/视频、拍摄、**阅后即焚**（一次性查看）、长按消息（撤回/复制/删除）、**3 分钟内可撤回**、**已读回执**（私聊 已读/未读，群聊 N人已读）、在线状态实时显示 |
| 群聊 | 创建群聊、群头像/群名编辑、邀请好友、踢人、设管理员、自定义时长禁言、转让群主、按拼音首字母分组显示成员、群在线人数 + 在线列表 |
| 联系人 | 好友申请（通过/拒绝）、好友列表（首字母分组 + 备注）、好友资料（备注/删除）、查看好友动态 |
| 动态 | 图文/视频动态、四种可见范围（公开/私密/指定好友可见/不给谁看）、点赞、评论、回复评论、删除评论、动态广场（所有人）+ 好友动态（仅好友） |
| 通知 | 顶栏小铃铛 + 红点（有人通过了你的好友申请 / 点赞 / 评论 / 回复），点击跳转对应内容，APK 内本地推送通知 |
| 其他 | 消息免打扰（私聊/群聊）、一周只能改 2 次昵称、更换头像、退出登录、**全部时间显示为 24 小时制「xxxx年xx月xx日 HH:mm:ss」** |

## 📁 目录结构

```
jaychat/
├── server/          # Node.js 后端（Express + Socket.IO + SQLite + Nodemailer）
├── app/             # 前端 + Capacitor Android 工程
│   ├── www/         # Web 前端（Vue 3，无构建，直接打包进 APK）
│   └── android/     # Android 工程（Gradle 构建 APK）
├── render.yaml      # Render.com 一键部署配置
└── .github/workflows/build-apk.yml   # GitHub Actions 自动打 APK
```

## 🚀 部署服务器（必须！跨网络聊天的前提）

APP 需要连接一个公网服务器。推荐 Render 免费部署：

1. 把本仓库推送到你的 GitHub
2. 打开 [render.com](https://render.com) → **New +** → **Blueprint** → 选择本仓库 → Apply
3. 部署完成后会得到地址：`https://xxxx.onrender.com`
4. 打开 APP → 登录页底部「⚙️ 服务器设置」→ 填入该地址 → 保存

> 也可以部署到任何能跑 Node.js 的服务器：`cd server && npm install && npm start`（端口 3000）。

## 📱 打包 APK

### 方式一：GitHub Actions 自动打包（推荐）
推送代码后，进入仓库 **Actions** 页 → **Build Jay Chat APK** → 下载 **JayChat-APK** 工件即可。

### 方式二：本地打包
```bash
# 需要 JDK 17 + Android SDK 35
cd app
npm install
npx cap sync android
cd android
./gradlew assembleRelease
# 产物: app/build/outputs/apk/release/app-release.apk
```

签名文件：`app/android/jaychat.keystore`（storepass/keypass 均为 `jaychat2026`，alias `jaychat`，正式发布请自行更换）。

## 🧪 官方账号

| 账号 | 值 |
|---|---|
| 用户名 | 杰同学 |
| 邮箱 | xujszjjzjzjxhxhh@qq.com |
| 密码 | 101113 |

该账号是「Jay Chat官方群」群主，用于管理官方群。

## ⚙️ 配置说明

- 邮件验证码：`server/src/mailer.js`（SMTP 163，端口 465）
- AI 回复：`server/src/ai.js`（智谱 GLM-4-Flash）
- APP 服务器地址：`app/www/config.js` 或 APP 内「服务器设置」（保存后长期生效）

## 🛠 技术栈

- **后端**：Node.js + Express + Socket.IO + better-sqlite3 + Nodemailer + jsonwebtoken
- **前端**：Vue 3（运行时编译，免构建）+ 毛玻璃拟态 UI + 动画
- **APP**：Capacitor 7（WebView），本地通知 @capacitor/local-notifications
- **AI**：智谱开放平台 GLM-4-Flash
- **动画表情包**：Tenor API（客户端直连）+ 内置 SVG 动画贴纸（离线可用）
