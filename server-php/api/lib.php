<?php
/* Jay Chat PHP 后端 — 数据库 + 公共函数 */
require __DIR__ . '/config.php';

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    if (DB_DRIVER === 'mysql') {
        $pdo = new PDO('mysql:host=' . DB_MYSQL_HOST . ';dbname=' . DB_MYSQL_NAME . ';charset=utf8mb4', DB_MYSQL_USER, DB_MYSQL_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    } else {
        @mkdir(dirname(DB_SQLITE_PATH), 0775, true);
        $pdo = new PDO('sqlite:' . DB_SQLITE_PATH, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT => 5, // busy timeout (seconds)
        ]);
        $pdo->exec('PRAGMA journal_mode=WAL');
        $pdo->exec('PRAGMA synchronous=NORMAL');
    }
    install($pdo);
    return $pdo;
}

function install(PDO $pdo): void {
    $auto = DB_DRIVER === 'mysql' ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $tables = [
        "CREATE TABLE IF NOT EXISTS users (
            id $auto,
            username VARCHAR(64) UNIQUE NOT NULL,
            email VARCHAR(128) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            avatar VARCHAR(255) DEFAULT '',
            is_bot TINYINT DEFAULT 0,
            is_official TINYINT DEFAULT 0,
            name_changes TEXT DEFAULT '[]',
            last_active INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL
        )",
        "CREATE TABLE IF NOT EXISTS tokens (
            token VARCHAR(64) PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        )",
        "CREATE TABLE IF NOT EXISTS codes (
            id $auto,
            email VARCHAR(128) NOT NULL,
            code VARCHAR(8) NOT NULL,
            purpose VARCHAR(16) NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        )",
        "CREATE TABLE IF NOT EXISTS friend_requests (
            id $auto,
            from_id INTEGER NOT NULL,
            to_id INTEGER NOT NULL,
            status VARCHAR(16) DEFAULT 'pending',
            created_at INTEGER NOT NULL
        )",
        "CREATE TABLE IF NOT EXISTS friends (
            id $auto,
            user_id INTEGER NOT NULL,
            friend_id INTEGER NOT NULL,
            remark VARCHAR(64) DEFAULT '',
            created_at INTEGER NOT NULL,
            UNIQUE(user_id, friend_id)
        )",
        "CREATE TABLE IF NOT EXISTS groups (
            id $auto,
            name VARCHAR(64) NOT NULL,
            avatar VARCHAR(255) DEFAULT '',
            owner_id INTEGER NOT NULL,
            is_official TINYINT DEFAULT 0,
            created_at INTEGER NOT NULL
        )",
        "CREATE TABLE IF NOT EXISTS group_members (
            id $auto,
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role VARCHAR(16) DEFAULT 'member',
            muted_until INTEGER DEFAULT 0,
            joined_at INTEGER NOT NULL,
            UNIQUE(group_id, user_id)
        )",
        "CREATE TABLE IF NOT EXISTS messages (
            id $auto,
            conv_type VARCHAR(16) NOT NULL,
            conv_id INTEGER NOT NULL,
            sender_id INTEGER NOT NULL,
            type VARCHAR(16) NOT NULL,
            content TEXT DEFAULT '',
            media_url TEXT DEFAULT '',
            one_time TINYINT DEFAULT 0,
            expired_for TEXT DEFAULT '[]',
            recalled TINYINT DEFAULT 0,
            created_at INTEGER NOT NULL
        )",
        "CREATE TABLE IF NOT EXISTS conv_reads (
            id $auto,
            conv_type VARCHAR(16) NOT NULL,
            conv_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            last_read_at INTEGER DEFAULT 0,
            last_read_msg_id INTEGER DEFAULT 0,
            muted TINYINT DEFAULT 0,
            UNIQUE(conv_type, conv_id, user_id)
        )",
        "CREATE TABLE IF NOT EXISTS moments (
            id $auto,
            user_id INTEGER NOT NULL,
            content TEXT DEFAULT '',
            media TEXT DEFAULT '[]',
            visibility VARCHAR(16) DEFAULT 'public',
            visible_to TEXT DEFAULT '[]',
            hide_from TEXT DEFAULT '[]',
            deleted TINYINT DEFAULT 0,
            created_at INTEGER NOT NULL
        )",
        "CREATE TABLE IF NOT EXISTS moment_likes (
            id $auto,
            moment_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            UNIQUE(moment_id, user_id)
        )",
        "CREATE TABLE IF NOT EXISTS moment_comments (
            id $auto,
            moment_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            target_comment_id INTEGER DEFAULT 0,
            content TEXT NOT NULL,
            deleted TINYINT DEFAULT 0,
            created_at INTEGER NOT NULL
        )",
        "CREATE TABLE IF NOT EXISTS notifications (
            id $auto,
            user_id INTEGER NOT NULL,
            type VARCHAR(32) NOT NULL,
            actor_id INTEGER NOT NULL,
            ref_type VARCHAR(16) DEFAULT '',
            ref_id INTEGER DEFAULT 0,
            content TEXT DEFAULT '',
            is_read TINYINT DEFAULT 0,
            created_at INTEGER NOT NULL
        )",
    ];
    foreach ($tables as $t) $pdo->exec($t);
    seed($pdo);
}

function seed(PDO $pdo): void {
    // 官方账号 杰同学
    $q = $pdo->prepare('SELECT * FROM users WHERE email=?');
    $q->execute(['xujszjjzjzjxhxhh@qq.com']);
    $official = $q->fetch();
    if (!$official) {
        $pdo->prepare('INSERT INTO users (username,email,password_hash,avatar,is_official,created_at) VALUES (?,?,?,?,1,?)')
            ->execute(['杰同学', 'xujszjjzjzjxhxhh@qq.com', password_hash('101113', PASSWORD_DEFAULT), '/uploads/official-avatar.svg', now()]);
        $q->execute(['xujszjjzjzjxhxhh@qq.com']);
        $official = $q->fetch();
    }
    // 官方群
    $q = $pdo->prepare('SELECT * FROM groups WHERE is_official=1');
    $q->execute();
    $group = $q->fetch();
    if (!$group) {
        $pdo->prepare('INSERT INTO groups (name,avatar,owner_id,is_official,created_at) VALUES (?,?,?,1,?)')
            ->execute(['Jay Chat官方群', '/uploads/official-group.svg', $official['id'], now()]);
        $q->execute();
        $group = $q->fetch();
        $pdo->prepare('INSERT INTO group_members (group_id,user_id,role,joined_at) VALUES (?,?,?,?)')
            ->execute([$group['id'], $official['id'], 'owner', now()]);
    }
    // AI 机器人
    $q = $pdo->prepare('SELECT * FROM users WHERE is_bot=1');
    $q->execute();
    $bot = $q->fetch();
    if (!$bot) {
        $pdo->prepare('INSERT INTO users (username,email,password_hash,avatar,is_bot,created_at) VALUES (?,?,?,?,1,?)')
            ->execute(['Jay AI', 'ai-bot@jaychat.local', password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT), '/uploads/jay-ai.svg', now()]);
    }
    // 捆绑素材
    foreach (['official-avatar.svg', 'official-group.svg', 'jay-ai.svg'] as $f) {
        $src = __DIR__ . '/assets/' . $f;
        $dst = __DIR__ . '/../uploads/' . $f;
        if (is_file($src) && !is_file($dst)) { @mkdir(dirname($dst), 0775, true); @copy($src, $dst); }
    }
}

/* ---------- helpers ---------- */
function now(): int { return time(); }

function out($data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
function fail(string $msg, int $code = 400): void { out(['error' => $msg], $code); }
function body(): array {
    $raw = file_get_contents('php://input');
    $j = json_decode($raw, true);
    return is_array($j) ? $j : $_POST;
}
function currentUser(): ?array {
    static $user = false;
    if ($user !== false) return $user;
    $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    $token = preg_replace('/^Bearer\s+/i', '', $hdr) ?: ($_GET['token'] ?? '');
    if (!$token) { $user = null; return null; }
    $st = db()->prepare('SELECT u.* FROM tokens t JOIN users u ON u.id=t.user_id WHERE t.token=?');
    $st->execute([$token]);
    $u = $st->fetch();
    if ($u) touchActive((int)$u['id']);
    $user = $u ?: null;
    return $user;
}
function requireAuth(): array {
    $u = currentUser();
    if (!$u) fail('未登录或登录已过期', 401);
    return $u;
}
function touchActive(int $uid): void {
    try {
        db()->prepare('UPDATE users SET last_active=? WHERE id=?')->execute([now(), $uid]);
    } catch (Throwable $e) { /* 心跳失败不影响请求，下一个请求会再更新 */ }
}
function pubUser(array $u): array {
    return ['id' => (int)$u['id'], 'username' => $u['username'], 'email' => $u['email'] ?? '', 'avatar' => $u['avatar'] ?: '', 'isBot' => !!$u['is_bot'], 'isOfficial' => !!$u['is_official']];
}
function pubUserById($id): ?array {
    $st = db()->prepare('SELECT * FROM users WHERE id=?'); $st->execute([(int)$id]);
    $u = $st->fetch();
    return $u ? pubUser($u) : null;
}
function areFriends(int $a, int $b): bool {
    $st = db()->prepare('SELECT 1 FROM friends WHERE user_id=? AND friend_id=?'); $st->execute([$a, $b]);
    return !!$st->fetch();
}
function inGroup(int $gid, int $uid): ?array {
    $st = db()->prepare('SELECT * FROM group_members WHERE group_id=? AND user_id=?'); $st->execute([$gid, $uid]);
    $r = $st->fetch();
    return $r ?: null;
}
function onlineIds(): array {
    $st = db()->prepare('SELECT id FROM users WHERE last_active > ? AND is_bot=0');
    $st->execute([now() - ONLINE_WINDOW]);
    return array_map(fn($r) => (int)$r['id'], $st->fetchAll());
}
function lastReadMsg(string $type, int $convId, int $uid): int {
    $st = db()->prepare('SELECT last_read_msg_id FROM conv_reads WHERE conv_type=? AND conv_id=? AND user_id=?');
    $st->execute([$type, $convId, $uid]);
    $r = $st->fetch();
    return $r ? (int)$r['last_read_msg_id'] : 0;
}
function insertIgnore(string $table, array $cols, array $params): void {
    $ph = implode(',', array_fill(0, count($cols), '?'));
    $sql = DB_DRIVER === 'mysql'
        ? "INSERT IGNORE INTO $table (" . implode(',', $cols) . ") VALUES ($ph)"
        : "INSERT OR IGNORE INTO $table (" . implode(',', $cols) . ") VALUES ($ph)";
    db()->prepare($sql)->execute($params);
}
function ensureReadRow(string $type, int $convId, int $uid): void {
    insertIgnore('conv_reads', ['conv_type', 'conv_id', 'user_id', 'last_read_at', 'last_read_msg_id'], [$type, $convId, $uid, 0, 0]);
}
function notify(int $userId, string $type, int $actorId, string $refType, int $refId, string $content): void {
    db()->prepare('INSERT INTO notifications (user_id,type,actor_id,ref_type,ref_id,content,is_read,created_at) VALUES (?,?,?,?,?,?,0,?)')
        ->execute([$userId, $type, $actorId, $refType, $refId, $content, now()]);
}

/* ---------- message output ---------- */
function msgOut(array $m, int $viewerId): array {
    $expiredList = json_decode($m['expired_for'] ?: '[]', true) ?: [];
    $expired = $m['one_time'] && (int)$m['sender_id'] !== $viewerId && in_array($viewerId, $expiredList);
    return [
        'id' => (int)$m['id'], 'convType' => $m['conv_type'], 'convId' => (int)$m['conv_id'],
        'sender' => pubUserById($m['sender_id']),
        'type' => $m['type'],
        'content' => $m['recalled'] ? '' : ($expired ? '[内容已销毁]' : $m['content']),
        'mediaUrl' => ($m['recalled'] || $expired) ? '' : $m['media_url'],
        'oneTime' => !!$m['one_time'], 'expired' => $expired, 'recalled' => !!$m['recalled'],
        'createdAt' => (int)$m['created_at'],
    ];
}
function groupSummary(array $g, int $uid): array {
    $st = db()->prepare('SELECT COUNT(*) c FROM group_members WHERE group_id=?'); $st->execute([$g['id']]);
    $memberCount = (int)$st->fetch()['c'];
    $st = db()->prepare('SELECT user_id FROM group_members WHERE group_id=?'); $st->execute([$g['id']]);
    $ids = array_map(fn($r) => (int)$r['user_id'], $st->fetchAll());
    $online = array_flip(onlineIds());
    $cnt = 0; foreach ($ids as $id) if (isset($online[$id])) $cnt++;
    $role = inGroup((int)$g['id'], $uid)['role'] ?? 'member';
    return ['id' => (int)$g['id'], 'name' => $g['name'], 'avatar' => $g['avatar'] ?: '', 'isOfficial' => !!$g['is_official'], 'role' => $role, 'memberCount' => $memberCount, 'onlineCount' => $cnt];
}
function conversationsOut(int $uid): array {
    $list = [];
    $online = array_flip(onlineIds());
    $st = db()->prepare('SELECT f.remark, u.* FROM friends f JOIN users u ON u.id=f.friend_id WHERE f.user_id=? AND u.is_bot=0');
    $st->execute([$uid]);
    foreach ($st->fetchAll() as $f) {
        $fid = (int)$f['id'];
        $st2 = db()->prepare("SELECT * FROM messages WHERE conv_type='private' AND ((sender_id=? AND conv_id=?) OR (sender_id=? AND conv_id=?)) ORDER BY id DESC LIMIT 1");
        $st2->execute([$uid, $fid, $fid, $uid]);
        $last = $st2->fetch();
        if (!$last) continue;
        $st3 = db()->prepare("SELECT * FROM conv_reads WHERE conv_type='private' AND conv_id=? AND user_id=?");
        $st3->execute([min($fid, $uid), $uid]);
        $read = $st3->fetch();
        $unread = 0;
        if ($last && (int)$last['sender_id'] !== $uid) {
            $st4 = db()->prepare("SELECT COUNT(*) c FROM messages WHERE conv_type='private' AND ((sender_id=? AND conv_id=?) OR (sender_id=? AND conv_id=?)) AND id>? AND sender_id<>?");
            $st4->execute([$uid, $fid, $fid, $uid, $read['last_read_msg_id'] ?? 0, $uid]);
            $unread = (int)$st4->fetch()['c'];
        }
        $list[] = [
            'convType' => 'private', 'convId' => $fid, 'name' => $f['remark'] ?: $f['username'], 'avatar' => $f['avatar'] ?: '',
            'online' => isset($online[$fid]), 'unread' => $unread, 'muted' => !!($read['muted'] ?? 0),
            'lastReadMsgId' => (int)($read['last_read_msg_id'] ?? 0), 'last' => $last ? msgOut($last, $uid) : null,
        ];
    }
    $st = db()->prepare('SELECT g.*, m.role FROM groups g JOIN group_members m ON m.group_id=g.id AND m.user_id=?');
    $st->execute([$uid]);
    foreach ($st->fetchAll() as $g) {
        $gid = (int)$g['id'];
        $st2 = db()->prepare("SELECT * FROM messages WHERE conv_type='group' AND conv_id=? ORDER BY id DESC LIMIT 1");
        $st2->execute([$gid]);
        $last = $st2->fetch();
        if (!$last) continue;
        $st3 = db()->prepare("SELECT * FROM conv_reads WHERE conv_type='group' AND conv_id=? AND user_id=?");
        $st3->execute([$gid, $uid]);
        $read = $st3->fetch();
        $unread = 0;
        if ($last && (int)$last['sender_id'] !== $uid) {
            $st4 = db()->prepare("SELECT COUNT(*) c FROM messages WHERE conv_type='group' AND conv_id=? AND id>? AND sender_id<>?");
            $st4->execute([$gid, $read['last_read_msg_id'] ?? 0, $uid]);
            $unread = (int)$st4->fetch()['c'];
        }
        $summary = groupSummary($g, $uid);
        $list[] = [
            'convType' => 'group', 'convId' => $gid, 'name' => $g['name'], 'avatar' => $g['avatar'] ?: '/uploads/official-group.svg',
            'isOfficial' => !!$g['is_official'], 'unread' => $unread, 'muted' => !!($read['muted'] ?? 0),
            'lastReadMsgId' => (int)($read['last_read_msg_id'] ?? 0),
            'memberCount' => $summary['memberCount'], 'onlineCount' => $summary['onlineCount'],
            'last' => msgOut($last, $uid),
        ];
    }
    usort($list, fn($a, $b) => ($b['last']['createdAt'] ?? 0) <=> ($a['last']['createdAt'] ?? 0));
    return $list;
}

/* ---------- mail ---------- */
function sendCodeMail(string $email, string $code): void {
    require_once __DIR__ . '/phpmailer/src/PHPMailer.php';
    require_once __DIR__ . '/phpmailer/src/SMTP.php';
    require_once __DIR__ . '/phpmailer/src/Exception.php';
    $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host = SMTP_HOST;
        $mail->SMTPAuth = true;
        $mail->Username = SMTP_USER;
        $mail->Password = SMTP_PASS;
        $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
        $mail->Port = SMTP_PORT;
        $mail->CharSet = 'UTF-8';
        $mail->setFrom(SMTP_FROM, SMTP_FROM_NAME);
        $mail->addAddress($email);
        $mail->isHTML(true);
        $mail->Subject = "【Jay Chat】你的验证码：$code";
        $mail->Body = mailBody($code);
        $mail->send();
    } catch (\Throwable $e) {
        throw new RuntimeException('验证码邮件发送失败，请稍后重试');
    }
}
function mailBody(string $code): string {
    return '<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f2f4f8;font-family:-apple-system,\'PingFang SC\',sans-serif;">
    <div style="max-width:420px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(20,40,90,.12);">
      <div style="background:linear-gradient(135deg,#0a84ff,#5e5ce6);padding:28px 32px;color:#fff;"><h1 style="margin:0;font-size:22px;">Jay Chat</h1><p style="margin:6px 0 0;opacity:.9;font-size:13px;">邮箱验证码</p></div>
      <div style="padding:32px;text-align:center;"><p style="color:#555;font-size:14px;margin:0 0 16px;">你的验证码是（5 分钟内有效）：</p>
      <div style="font-size:34px;font-weight:700;letter-spacing:8px;color:#0a84ff;background:#eef4ff;border-radius:12px;padding:14px 0;">' . htmlspecialchars($code) . '</div>
      <p style="color:#999;font-size:12px;margin:20px 0 0;">如果这不是你本人的操作，请忽略此邮件。</p></div></div></body></html>';
}

/* ---------- AI ---------- */
function aiChat(array $history): string {
    $messages = array_merge([['role' => 'system', 'content' => '你是 Jay Chat 官方群里的智能助手 Jay AI，回答用中文，简洁友好，有帮助。你在一个群聊里，回复会以 @用户名 的形式展示给提问者。']], $history);
    $payload = json_encode(['model' => AI_MODEL, 'messages' => $messages, 'max_tokens' => 800, 'temperature' => 0.7], JSON_UNESCAPED_UNICODE);
    $ch = curl_init(AI_URL);
    $opts = [
        CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 25,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . AI_KEY, 'Content-Type: application/json'],
    ];
    if ($p = getenv('HTTPS_PROXY') ?: getenv('https_proxy')) { $opts[CURLOPT_PROXY] = $p; }
    curl_setopt_array($ch, $opts);
    $res = curl_exec($ch);
    curl_close($ch);
    if (!$res) return '抱歉，我暂时无法回答。';
    $j = json_decode($res, true);
    return $j['choices'][0]['message']['content'] ?? '抱歉，我暂时无法回答。';
}

/* ---------- AI reply (runs after response sent) ---------- */
function handleAIReply(array $group, array $userMsg): void {
    $st = db()->prepare("SELECT * FROM messages WHERE conv_type='group' AND conv_id=? ORDER BY id DESC LIMIT 10");
    $st->execute([$group['id']]);
    $rows = array_reverse($st->fetchAll());
    $history = [];
    foreach ($rows as $r) {
        if ($r['recalled']) continue;
        $u = pubUserById($r['sender_id']);
        $history[] = ['role' => ($u && $u['isBot']) ? 'assistant' : 'user', 'content' => ($u ? $u['username'] : '用户') . ': ' . $r['content']];
    }
    $reply = aiChat($history);
    $st = db()->prepare('SELECT * FROM users WHERE is_bot=1');
    $st->execute();
    $bot = $st->fetch();
    $sender = pubUserById($userMsg['sender_id']);
    db()->prepare("INSERT INTO messages (conv_type,conv_id,sender_id,type,content,media_url,one_time,expired_for,created_at) VALUES ('group',?,?,?,?,?,0,'[]',?)")
        ->execute([$group['id'], $bot['id'], 'text', '@' . $sender['username'] . ' ' . $reply, '', now()]);
}
