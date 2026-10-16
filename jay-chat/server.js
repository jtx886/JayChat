// Jay Chat 服务端入口
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const { load, db } = require('./lib/db');
const { ensureOfficial } = require('./lib/seed');
const { initSocket } = require('./socket');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const friendRoutes = require('./routes/friends');
const groupRoutes = require('./routes/groups');
const messageRoutes = require('./routes/messages');
const momentRoutes = require('./routes/moments');
const adminRoutes = require('./routes/admin');

load(); // 先加载数据库（socket/auth 依赖 db.secret）

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
  maxHttpBufferSize: 5e6,
  pingInterval: 10000,
  pingTimeout: 20000,
});

app.use(express.json({ limit: '80mb' }));
app.use((req, res, next) => {
  app.set('io', io);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/moments', momentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', messageRoutes);

// 兜底：SPA
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: '接口不存在' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initSocket(io);
ensureOfficial();

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Jay Chat] 服务已启动: http://0.0.0.0:${PORT}`);
});
