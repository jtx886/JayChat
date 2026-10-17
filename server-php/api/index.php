<?php
/* Jay Chat PHP 后端 — 路由与全部接口 */
require __DIR__ . '/lib.php';

$method = $_SERVER['REQUEST_METHOD'];
$route = $_GET['r'] ?? '';
$route = preg_replace('#^api/#', '', trim($route, '/'));
if ($method === 'OPTIONS') out(['ok' => true]);
if (ob_get_level()) ob_end_clean();
ignore_user_abort(true);

/* ============ server info ============ */
if ($route === 'server-info') out(['type' => 'php', 'version' => '1.1.0', 'time' => now()]);

/* ============ AUTH ============ */
if ($route === 'auth/send-code' && $method === 'POST') {
    $b = body(); $email = trim($b['email'] ?? ''); $purpose = $b['purpose'] ?? 'register';
    if (!preg_match('/^[\w.+-]+@qq\.com$|^[\w.+-]+@163\.com$/i', $email)) fail('仅支持 @qq.com 和 @163.com 邮箱');
    $st = db()->prepare('SELECT 1 FROM users WHERE email=?'); $st->execute([$email]);
    if ($purpose === 'register' && $st->fetch()) fail('该邮箱已注册');
    if ($purpose === 'reset' && !$st->fetch()) fail('该邮箱未注册');
    $st = db()->prepare('SELECT * FROM codes WHERE email=? AND purpose=? ORDER BY id DESC LIMIT 1');
    $st->execute([$email, $purpose]);
    if (($r = $st->fetch()) && now() - (int)$r['created_at'] < 60) fail('发送太频繁，请 1 分钟后再试', 429);
    $code = (string)random_int(100000, 999999);
    db()->prepare('INSERT INTO codes (email,code,purpose,expires_at,created_at) VALUES (?,?,?,?,?)')
        ->execute([$email, $code, $purpose, now() + 300, now()]);
    try { sendCodeMail($email, $code); } catch (Throwable $e) { fail($e->getMessage(), 500); }
    out(['ok' => true]);
}

if ($route === 'auth/register' && $method === 'POST') {
    $b = body(); $username = trim($b['username'] ?? ''); $email = trim($b['email'] ?? '');
    $password = (string)($b['password'] ?? ''); $code = trim($b['code'] ?? '');
    if (mb_strlen($username) < 1 || mb_strlen($username) > 6) fail('昵称需为 1-6 个字符');
    if (!preg_match('/^[\w.+-]+@qq\.com$|^[\w.+-]+@163\.com$/i', $email)) fail('仅支持 @qq.com 和 @163.com 邮箱');
    if (strlen($password) < 6) fail('密码至少 6 位');
    $st = db()->prepare("SELECT * FROM codes WHERE email=? AND purpose='register' AND code=? AND expires_at>? ORDER BY id DESC LIMIT 1");
    $st->execute([$email, $code, now()]);
    if (!$st->fetch()) fail('验证码错误或已过期');
    $st = db()->prepare('SELECT 1 FROM users WHERE email=?'); $st->execute([$email]);
    if ($st->fetch()) fail('该邮箱已注册');
    $st = db()->prepare('SELECT 1 FROM users WHERE username=?'); $st->execute([$username]);
    if ($st->fetch()) fail('昵称已被占用');
    db()->prepare('INSERT INTO users (username,email,password_hash,avatar,created_at) VALUES (?,?,?,?,?)')
        ->execute([$username, $email, password_hash($password, PASSWORD_DEFAULT), '', now()]);
    $uid = (int)db()->lastInsertId();
    $st = db()->prepare('SELECT * FROM groups WHERE is_official=1'); $st->execute();
    if ($g = $st->fetch()) insertIgnore('group_members', ['group_id', 'user_id', 'role', 'joined_at'], [$g['id'], $uid, 'member', now()]);
    $token = bin2hex(random_bytes(24));
    db()->prepare('INSERT INTO tokens (token,user_id,created_at) VALUES (?,?,?)')->execute([$token, $uid, now()]);
    out(['ok' => true, 'token' => $token, 'user' => pubUserById($uid)]);
}

if ($route === 'auth/login' && $method === 'POST') {
    $b = body(); $account = trim($b['account'] ?? ''); $password = (string)($b['password'] ?? '');
    $st = db()->prepare('SELECT * FROM users WHERE (username=? OR email=?) AND is_bot=0');
    $st->execute([$account, $account]);
    $u = $st->fetch();
    if (!$u) fail('用户不存在');
    if (!password_verify($password, $u['password_hash'])) fail('密码错误');
    $token = bin2hex(random_bytes(24));
    db()->prepare('INSERT INTO tokens (token,user_id,created_at) VALUES (?,?,?)')->execute([$token, (int)$u['id'], now()]);
    out(['ok' => true, 'token' => $token, 'user' => pubUser($u)]);
}

if ($route === 'auth/reset-password' && $method === 'POST') {
    $b = body(); $email = trim($b['email'] ?? ''); $code = trim($b['code'] ?? ''); $password = (string)($b['password'] ?? '');
    if (strlen($password) < 6) fail('密码至少 6 位');
    $st = db()->prepare("SELECT * FROM codes WHERE email=? AND purpose='reset' AND code=? AND expires_at>? ORDER BY id DESC LIMIT 1");
    $st->execute([$email, $code, now()]);
    if (!$st->fetch()) fail('验证码错误或已过期');
    $st = db()->prepare('SELECT * FROM users WHERE email=?'); $st->execute([$email]);
    if (!$u = $st->fetch()) fail('该邮箱未注册');
    db()->prepare('UPDATE users SET password_hash=? WHERE id=?')->execute([password_hash($password, PASSWORD_DEFAULT), $u['id']]);
    db()->prepare('DELETE FROM tokens WHERE user_id=?')->execute([$u['id']]);
    out(['ok' => true]);
}

if ($route === 'auth/me') {
    $u = requireAuth();
    out(['user' => pubUser($u)]);
}

/* ============ USERS ============ */
if ($route === 'users/search') {
    $me = requireAuth(); $q = trim($_GET['q'] ?? '');
    if ($q === '') out(['users' => []]);
    $st = db()->prepare('SELECT * FROM users WHERE username LIKE ? AND is_bot=0 AND id<>? LIMIT 20');
    $st->execute(["%$q%", $me['id']]);
    out(['users' => array_map('pubUser', $st->fetchAll())]);
}

if ($route === 'users/avatar' && $method === 'POST') {
    $me = requireAuth();
    $url = saveUpload('image');
    db()->prepare('UPDATE users SET avatar=? WHERE id=?')->execute([$url, $me['id']]);
    out(['ok' => true, 'avatar' => $url]);
}

if ($route === 'users/name' && $method === 'POST') {
    $me = requireAuth(); $name = trim(body()['username'] ?? '');
    if (mb_strlen($name) < 1 || mb_strlen($name) > 6) fail('昵称需为 1-6 个字符');
    $st = db()->prepare('SELECT 1 FROM users WHERE username=? AND id<>?'); $st->execute([$name, $me['id']]);
    if ($st->fetch()) fail('昵称已被占用');
    $changes = json_decode($me['name_changes'] ?: '[]', true) ?: [];
    $weekAgo = now() - 7 * 86400;
    $recent = array_values(array_filter($changes, fn($t) => $t > $weekAgo));
    if (count($recent) >= 2) fail('一周内只能修改 2 次昵称');
    $recent[] = now();
    db()->prepare('UPDATE users SET username=?, name_changes=? WHERE id=?')->execute([$name, json_encode($recent), $me['id']]);
    out(['ok' => true, 'username' => $name, 'remaining' => 2 - count($recent)]);
}

if ($route === 'users/name-quota') {
    $me = requireAuth();
    $changes = json_decode($me['name_changes'] ?: '[]', true) ?: [];
    $weekAgo = now() - 7 * 86400;
    out(['remaining' => max(0, 2 - count(array_filter($changes, fn($t) => $t > $weekAgo)))]);
}

if ($route === 'users/online') out(['online' => onlineIds()]);

/* ============ FRIENDS ============ */
if ($route === 'friends/request' && $method === 'POST') {
    $me = requireAuth(); $toId = (int)(body()['userId'] ?? 0);
    if ($toId === (int)$me['id']) fail('不能添加自己');
    $target = pubUserById($toId);
    if (!$target || $target['isBot']) fail('用户不存在');
    if (areFriends((int)$me['id'], $toId)) fail('已经是好友了');
    $st = db()->prepare("SELECT 1 FROM friend_requests WHERE from_id=? AND to_id=? AND status='pending'");
    $st->execute([$me['id'], $toId]);
    if ($st->fetch()) fail('已发送过申请，等待对方通过');
    db()->prepare("INSERT INTO friend_requests (from_id,to_id,status,created_at) VALUES (?,?, 'pending',?)")->execute([$me['id'], $toId, now()]);
    out(['ok' => true]);
}

if ($route === 'friends/requests') {
    $me = requireAuth();
    $st = db()->prepare("SELECT r.*, u.username, u.avatar FROM friend_requests r JOIN users u ON u.id=r.from_id WHERE r.to_id=? AND r.status='pending' ORDER BY r.id DESC");
    $st->execute([$me['id']]);
    $incoming = array_map(fn($r) => ['id' => (int)$r['id'], 'user' => ['id' => (int)$r['from_id'], 'username' => $r['username'], 'avatar' => $r['avatar']], 'createdAt' => (int)$r['created_at']], $st->fetchAll());
    $st = db()->prepare("SELECT r.*, u.username, u.avatar FROM friend_requests r JOIN users u ON u.id=r.to_id WHERE r.from_id=? AND r.status='pending' ORDER BY r.id DESC");
    $st->execute([$me['id']]);
    $outgoing = array_map(fn($r) => ['id' => (int)$r['id'], 'user' => ['id' => (int)$r['to_id'], 'username' => $r['username'], 'avatar' => $r['avatar']], 'createdAt' => (int)$r['created_at']], $st->fetchAll());
    out(['incoming' => $incoming, 'outgoing' => $outgoing]);
}

if ($route === 'friends/requests/count') {
    $me = requireAuth();
    $st = db()->prepare("SELECT COUNT(*) c FROM friend_requests WHERE to_id=? AND status='pending'"); $st->execute([$me['id']]);
    out(['count' => (int)$st->fetch()['c']]);
}

if (preg_match('#^friends/requests/(\d+)/(accept|reject)$#', $route, $m) && $method === 'POST') {
    $me = requireAuth();
    $st = db()->prepare('SELECT * FROM friend_requests WHERE id=?'); $st->execute([$m[1]]);
    $r = $st->fetch();
    if (!$r || (int)$r['to_id'] !== (int)$me['id'] || $r['status'] !== 'pending') fail('申请不存在');
    db()->prepare('UPDATE friend_requests SET status=? WHERE id=?')->execute([$m[2], $r['id']]);
    if ($m[2] === 'accept') {
        insertIgnore('friends', ['user_id', 'friend_id', 'created_at'], [$r['to_id'], $r['from_id'], now()]);
        insertIgnore('friends', ['user_id', 'friend_id', 'created_at'], [$r['from_id'], $r['to_id'], now()]);
        notify((int)$r['from_id'], 'friend_accepted', (int)$me['id'], 'user', (int)$me['id'], '通过了你的好友申请');
    }
    out(['ok' => true]);
}

if ($route === 'friends') {
    $me = requireAuth();
    $st = db()->prepare('SELECT f.remark, u.* FROM friends f JOIN users u ON u.id=f.friend_id WHERE f.user_id=? AND u.is_bot=0 ORDER BY u.username');
    $st->execute([$me['id']]);
    $online = array_flip(onlineIds());
    $friends = array_map(fn($u) => [
        'id' => (int)$u['id'], 'username' => $u['username'], 'avatar' => $u['avatar'] ?: '', 'remark' => $u['remark'] ?: '',
        'online' => isset($online[(int)$u['id']]), 'createdAt' => (int)$u['created_at'],
    ], $st->fetchAll());
    out(['friends' => $friends]);
}

if (preg_match('#^friends/(\d+)/remark$#', $route, $m) && $method === 'POST') {
    $me = requireAuth();
    db()->prepare('UPDATE friends SET remark=? WHERE user_id=? AND friend_id=?')
        ->execute([mb_substr(trim(body()['remark'] ?? ''), 0, 20), $me['id'], $m[1]]);
    out(['ok' => true]);
}

if (preg_match('#^friends/(\d+)$#', $route) && $method === 'DELETE') {
    $me = requireAuth(); $fid = (int)$m[1];
    db()->prepare('DELETE FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)')
        ->execute([$me['id'], $fid, $fid, $me['id']]);
    out(['ok' => true]);
}

if (preg_match('#^friends/(\d+)/moments$#', $route, $m)) {
    $me = requireAuth();
    if (!areFriends((int)$me['id'], (int)$m[1])) fail('不是好友', 403);
    out(['moments' => queryMoments(fn($x) => (int)$x['user_id'] === (int)$m[1], (int)$me['id'])]);
}

/* ============ GROUPS ============ */
if ($route === 'groups' && $method === 'POST') {
    $me = requireAuth();
    $name = trim(body()['name'] ?? '');
    if ($name === '') fail('请输入群名称');
    $avatar = '';
    if (!empty($_FILES['file']['tmp_name'])) $avatar = saveUpload('image');
    db()->prepare('INSERT INTO groups (name,avatar,owner_id,created_at) VALUES (?,?,?,?)')->execute([$name, $avatar, $me['id'], now()]);
    $gid = (int)db()->lastInsertId();
    db()->prepare("INSERT INTO group_members (group_id,user_id,role,joined_at) VALUES (?,?, 'owner',?)")->execute([$gid, $me['id'], now()]);
    out(['ok' => true, 'groupId' => $gid]);
}

if ($route === 'groups' && $method === 'GET') {
    $me = requireAuth();
    $st = db()->prepare('SELECT g.*, m.role FROM groups g JOIN group_members m ON m.group_id=g.id AND m.user_id=? ORDER BY g.id');
    $st->execute([$me['id']]);
    out(['groups' => array_map(fn($g) => groupSummary($g, (int)$me['id']), $st->fetchAll())]);
}

if (preg_match('#^groups/(\d+)$#', $route, $m) && $method === 'GET') {
    $me = requireAuth();
    $st = db()->prepare('SELECT * FROM groups WHERE id=?'); $st->execute([$m[1]]);
    if (!$g = $st->fetch()) fail('群不存在', 404);
    $mine = inGroup((int)$g['id'], (int)$me['id']);
    if (!$mine) fail('不是群成员', 403);
    $st = db()->prepare('SELECT gm.role, gm.muted_until, gm.joined_at, u.* FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=? ORDER BY gm.joined_at');
    $st->execute([$g['id']]);
    $online = array_flip(onlineIds());
    $members = array_map(function ($row) use ($online, $g) {
        $u = pubUser($row);
        $u['role'] = $row['role']; $u['mutedUntil'] = (int)$row['muted_until'];
        $u['online'] = isset($online[(int)$row['id']]);
        $u['lastReadMsgId'] = lastReadMsg('group', (int)$g['id'], (int)$row['id']);
        return $u;
    }, $st->fetchAll());
    $onlineCnt = count(array_filter($members, fn($x) => $x['online']));
    out([
        'group' => ['id' => (int)$g['id'], 'name' => $g['name'], 'avatar' => $g['avatar'] ?: '', 'isOfficial' => !!$g['is_official'],
            'ownerId' => (int)$g['owner_id'], 'createdAt' => (int)$g['created_at'], 'memberCount' => count($members), 'onlineCount' => $onlineCnt],
        'myRole' => $mine['role'], 'members' => $members,
    ]);
}

if (preg_match('#^groups/(\d+)/name$#', $route, $m) && $method === 'POST') {
    $me = requireAuth(); checkGroupPerm((int)$m[1], (int)$me['id'], ['owner', 'admin']);
    db()->prepare('UPDATE groups SET name=? WHERE id=?')->execute([mb_substr(trim(body()['name'] ?? ''), 0, 20), $m[1]]);
    out(['ok' => true]);
}

if (preg_match('#^groups/(\d+)/avatar$#', $route, $m) && $method === 'POST') {
    $me = requireAuth(); checkGroupPerm((int)$m[1], (int)$me['id'], ['owner', 'admin']);
    out(['ok' => true, 'avatar' => saveUpload('image')]);
}

if (preg_match('#^groups/(\d+)/invite$#', $route, $m) && $method === 'POST') {
    $me = requireAuth();
    if (!inGroup((int)$m[1], (int)$me['id'])) fail('不是群成员', 403);
    $st = db()->prepare('SELECT * FROM groups WHERE id=?'); $st->execute([$m[1]]); $g = $st->fetch();
    foreach ((array)(body()['userIds'] ?? []) as $id) {
        $target = pubUserById((int)$id);
        if ($target && !$target['isBot'] && !inGroup((int)$m[1], (int)$id)) {
            insertIgnore('group_members', ['group_id', 'user_id', 'role', 'joined_at'], [$m[1], (int)$id, 'member', now()]);
            notify((int)$id, 'group_invite', (int)$me['id'], 'group', (int)$m[1], "邀请你加入了群聊「{$g['name']}」");
        }
    }
    out(['ok' => true]);
}

if (preg_match('#^groups/(\d+)/kick$#', $route, $m) && $method === 'POST') {
    $me = requireAuth(); $gid = (int)$m[1];
    $mine = checkGroupPerm($gid, (int)$me['id'], ['owner', 'admin']);
    $st = db()->prepare('SELECT * FROM groups WHERE id=?'); $st->execute([$gid]); $g = $st->fetch();
    if ($g['is_official']) fail('官方群不允许移除成员');
    $target = inGroup($gid, (int)(body()['userId'] ?? 0));
    if (!$target) fail('成员不存在');
    if ($target['role'] === 'owner' || ($mine['role'] === 'admin' && $target['role'] !== 'member')) fail('无权限操作该成员', 403);
    db()->prepare('DELETE FROM group_members WHERE group_id=? AND user_id=?')->execute([$gid, $target['user_id']]);
    out(['ok' => true]);
}

if (preg_match('#^groups/(\d+)/admin$#', $route, $m) && $method === 'POST') {
    $me = requireAuth(); $gid = (int)$m[1];
    $mine = inGroup($gid, (int)$me['id']);
    if (!$mine || $mine['role'] !== 'owner') fail('仅群主可设置管理员', 403);
    $target = inGroup($gid, (int)(body()['userId'] ?? 0));
    if (!$target || $target['role'] === 'owner') fail('成员不存在');
    db()->prepare('UPDATE group_members SET role=? WHERE group_id=? AND user_id=?')
        ->execute((body()['set'] ?? false) ? ['admin', $gid, $target['user_id']] : ['member', $gid, $target['user_id']]);
    out(['ok' => true]);
}

if (preg_match('#^groups/(\d+)/mute$#', $route, $m) && $method === 'POST') {
    $me = requireAuth(); $gid = (int)$m[1];
    $mine = checkGroupPerm($gid, (int)$me['id'], ['owner', 'admin']);
    $target = inGroup($gid, (int)(body()['userId'] ?? 0));
    if (!$target || $target['role'] === 'owner') fail('成员不存在');
    if ($mine['role'] === 'admin' && $target['role'] === 'admin') fail('管理员不能禁言管理员', 403);
    $minutes = (int)(body()['minutes'] ?? 0);
    $until = $minutes > 0 ? now() + $minutes * 60 : 0;
    db()->prepare('UPDATE group_members SET muted_until=? WHERE group_id=? AND user_id=?')->execute([$until, $gid, $target['user_id']]);
    out(['ok' => true, 'mutedUntil' => $until]);
}

if (preg_match('#^groups/(\d+)/transfer$#', $route, $m) && $method === 'POST') {
    $me = requireAuth(); $gid = (int)$m[1];
    $mine = inGroup($gid, (int)$me['id']);
    if (!$mine || $mine['role'] !== 'owner') fail('仅群主可转让', 403);
    $st = db()->prepare('SELECT * FROM groups WHERE id=?'); $st->execute([$gid]); $g = $st->fetch();
    if ($g['is_official']) fail('官方群不能转让');
    $target = inGroup($gid, (int)(body()['userId'] ?? 0));
    if (!$target || (int)$target['user_id'] === (int)$me['id']) fail('成员不存在');
    db()->prepare("UPDATE group_members SET role='member' WHERE group_id=? AND user_id=?")->execute([$gid, $me['id']]);
    db()->prepare("UPDATE group_members SET role='owner' WHERE group_id=? AND user_id=?")->execute([$gid, $target['user_id']]);
    db()->prepare('UPDATE groups SET owner_id=? WHERE id=?')->execute([$target['user_id'], $gid]);
    out(['ok' => true]);
}

if (preg_match('#^groups/(\d+)/leave$#', $route, $m) && $method === 'POST') {
    $me = requireAuth(); $gid = (int)$m[1];
    $st = db()->prepare('SELECT * FROM groups WHERE id=?'); $st->execute([$gid]); $g = $st->fetch();
    $mine = $g ? inGroup($gid, (int)$me['id']) : null;
    if (!$g || !$mine) fail('不是群成员');
    if ($g['is_official']) fail('Jay Chat官方群不能退出');
    db()->prepare('DELETE FROM group_members WHERE group_id=? AND user_id=?')->execute([$gid, $me['id']]);
    out(['ok' => true]);
}

if (preg_match('#^groups/(\d+)/online$#', $route, $m)) {
    requireAuth();
    $st = db()->prepare('SELECT user_id FROM group_members WHERE group_id=?'); $st->execute([$m[1]]);
    $ids = array_map(fn($r) => (int)$r['user_id'], $st->fetchAll());
    out(['online' => array_values(array_intersect($ids, onlineIds()))]);
}

function checkGroupPerm(int $gid, int $uid, array $roles): array {
    $mine = inGroup($gid, $uid);
    if (!$mine || !in_array($mine['role'], $roles)) fail('无权限', 403);
    return $mine;
}

/* ============ CONVERSATIONS ============ */
if ($route === 'conversations' && $method === 'GET') {
    $me = requireAuth();
    out(['conversations' => conversationsOut((int)$me['id'])]);
}

if ($route === 'conversations/mute' && $method === 'POST') {
    $me = requireAuth(); $b = body();
    $type = $b['convType'] === 'group' ? 'group' : 'private';
    $convId = (int)$b['convId'];
    ensureReadRow($type, $type === 'private' ? min($convId, (int)$me['id']) : $convId, (int)$me['id']);
    db()->prepare('UPDATE conv_reads SET muted=? WHERE conv_type=? AND conv_id=? AND user_id=?')
        ->execute($b['muted'] ? [1, $type, $type === 'private' ? min($convId, (int)$me['id']) : $convId, $me['id']] : [0, $type, $type === 'private' ? min($convId, (int)$me['id']) : $convId, $me['id']]);
    out(['ok' => true]);
}

/* ============ MESSAGES ============ */
if ($route === 'messages' && $method === 'GET') {
    $me = requireAuth();
    $type = ($_GET['convType'] ?? '') === 'group' ? 'group' : 'private';
    $convId = (int)($_GET['convId'] ?? 0);
    $limit = min((int)($_GET['limit'] ?? 50), 100);
    $before = (int)($_GET['before'] ?? 0);
    $uid = (int)$me['id'];
    if ($type === 'group' && !inGroup($convId, $uid)) fail('不是群成员', 403);
    if ($type === 'private' && !areFriends($uid, $convId)) fail('不是好友', 403);
    if ($type === 'private') {
        $sql = "SELECT * FROM messages WHERE conv_type='private' AND ((sender_id=? AND conv_id=?) OR (sender_id=? AND conv_id=?))";
        $params = [$uid, $convId, $convId, $uid];
        if ($before) { $sql .= ' AND id<?'; $params[] = $before; }
        $sql .= ' ORDER BY id DESC LIMIT ' . $limit;
    } else {
        $sql = "SELECT * FROM messages WHERE conv_type='group' AND conv_id=?";
        $params = [$convId];
        if ($before) { $sql .= ' AND id<?'; $params[] = $before; }
        $sql .= ' ORDER BY id DESC LIMIT ' . $limit;
    }
    $st = db()->prepare($sql); $st->execute($params);
    $rows = array_reverse($st->fetchAll());
    $msgs = array_map(fn($x) => msgOut($x, $uid), $rows);
    $reads = [];
    if ($type === 'group') {
        $st = db()->prepare('SELECT user_id, last_read_msg_id FROM conv_reads WHERE conv_type=? AND conv_id=?');
        $st->execute(['group', $convId]);
        foreach ($st->fetchAll() as $r) $reads[(int)$r['user_id']] = (int)$r['last_read_msg_id'];
    } else {
        $reads[$convId] = lastReadMsg('private', min($convId, $uid), $convId);
    }
    out(['messages' => $msgs, 'reads' => $reads, 'myLastRead' => lastReadMsg($type, $type === 'private' ? min($convId, $uid) : $convId, $uid)]);
}

if ($route === 'messages' && $method === 'POST') {
    $me = requireAuth();
    $b = body();
    $result = handleMessageSend((int)$me['id'], $b['convType'] ?? '', (int)($b['convId'] ?? 0), $b['type'] ?? '', (string)($b['content'] ?? ''), (string)($b['mediaUrl'] ?? ''), !empty($b['oneTime']));
    if (isset($result['error'])) fail($result['error'], $result['code'] ?? 400);
    out(['message' => $result['message']]);
}

function handleMessageSend(int $uid, string $convType, int $convId, string $type, string $content, string $mediaUrl, bool $oneTime): array {
    if (!in_array($type, ['text', 'image', 'video'])) return ['error' => '不支持的消息类型'];
    if ($convType === 'private') {
        if (!areFriends($uid, $convId)) return ['error' => '对方不是你的好友'];
    } elseif ($convType === 'group') {
        $mine = inGroup($convId, $uid);
        if (!$mine) return ['error' => '不是群成员'];
        if ((int)$mine['muted_until'] > now()) return ['code' => 403, 'error' => '你已被禁言，剩余 ' . ceil(((int)$mine['muted_until'] - now()) / 60) . ' 分钟'];
    } else {
        return ['error' => '不支持的会话类型'];
    }
    $st = db()->prepare('INSERT INTO messages (conv_type,conv_id,sender_id,type,content,media_url,one_time,expired_for,created_at) VALUES (?,?,?,?,?,?,?,?,?)');
    $st->execute([$convType, $convId, $uid, $type, $content, $mediaUrl, $oneTime ? 1 : 0, '[]', now()]);
    $id = (int)db()->lastInsertId();
    $st = db()->prepare('SELECT * FROM messages WHERE id=?'); $st->execute([$id]);
    $message = msgOut($st->fetch(), $uid);
    if ($convType === 'group') {
        $st = db()->prepare('SELECT * FROM groups WHERE id=?'); $st->execute([$convId]);
        $g = $st->fetch();
        if ($g && $g['is_official'] && $type === 'text' && preg_match('/@Jay\s?AI/i', $content)) {
            // 响应发送完成后再生成 AI 回复
            $group = $g; $userMsg = $st->fetch();
            $st2 = db()->prepare('SELECT * FROM messages WHERE id=?'); $st2->execute([$id]);
            $userMsg = $st2->fetch();
            register_shutdown_function(fn() => handleAIReply($group, $userMsg));
        }
    }
    return ['message' => $message];
}

if (preg_match('#^messages/(\d+)/recall$#', $route, $m) && $method === 'POST') {
    $me = requireAuth();
    $st = db()->prepare('SELECT * FROM messages WHERE id=?'); $st->execute([$m[1]]);
    $msg = $st->fetch();
    if (!$msg || (int)$msg['sender_id'] !== (int)$me['id']) fail('只能撤回自己的消息', 403);
    if (now() - (int)$msg['created_at'] > 180) fail('超过 3 分钟，无法撤回');
    db()->prepare("UPDATE messages SET recalled=1, content='', media_url='' WHERE id=?")->execute([$msg['id']]);
    out(['ok' => true]);
}

if (preg_match('#^messages/(\d+)/seen-once$#', $route, $m) && $method === 'POST') {
    $me = requireAuth();
    $st = db()->prepare('SELECT * FROM messages WHERE id=?'); $st->execute([$m[1]]);
    $msg = $st->fetch();
    if ($msg && $msg['one_time'] && (int)$msg['sender_id'] !== (int)$me['id']) {
        $list = json_decode($msg['expired_for'] ?: '[]', true) ?: [];
        if (!in_array((int)$me['id'], $list)) {
            $list[] = (int)$me['id'];
            db()->prepare('UPDATE messages SET expired_for=? WHERE id=?')->execute([json_encode($list), $msg['id']]);
        }
    }
    out(['ok' => true]);
}

if (preg_match('#^messages/(\d+)/media$#', $route, $m)) {
    $me = requireAuth();
    $st = db()->prepare('SELECT * FROM messages WHERE id=?'); $st->execute([$m[1]]);
    $msg = $st->fetch();
    if (!$msg || !$msg['media_url']) fail('不存在', 404);
    $list = json_decode($msg['expired_for'] ?: '[]', true) ?: [];
    $isSender = (int)$msg['sender_id'] === (int)$me['id'];
    if (!$isSender && in_array((int)$me['id'], $list)) fail('内容已销毁', 410);
    $file = __DIR__ . '/../uploads/' . basename($msg['media_url']);
    if (!is_file($file)) fail('文件不存在', 404);
    if (!$isSender && $msg['one_time'] && !in_array((int)$me['id'], $list)) {
        $list[] = (int)$me['id'];
        db()->prepare('UPDATE messages SET expired_for=? WHERE id=?')->execute([json_encode($list), $msg['id']]);
    }
    header('Content-Type: ' . mime_content_type($file) ?: 'application/octet-stream');
    header('Content-Length: ' . filesize($file));
    readfile($file);
    exit;
}

/* ============ READ (polling mode) ============ */
if ($route === 'read' && $method === 'POST') {
    $me = requireAuth(); $b = body();
    $type = ($b['convType'] ?? '') === 'group' ? 'group' : 'private';
    $convId = (int)($b['convId'] ?? 0);
    $lastId = (int)($b['lastReadMsgId'] ?? 0);
    $canon = $type === 'private' ? min($convId, (int)$me['id']) : $convId;
    ensureReadRow($type, $canon, (int)$me['id']);
    db()->prepare('UPDATE conv_reads SET last_read_at=?, last_read_msg_id=? WHERE conv_type=? AND conv_id=? AND user_id=?')
        ->execute([now(), $lastId, $type, $canon, $me['id']]);
    out(['ok' => true]);
}

/* ============ SYNC (polling) ============ */
if ($route === 'sync' && $method === 'GET') {
    $me = requireAuth(); $uid = (int)$me['id'];
    $activeType = ($_GET['activeType'] ?? '') === 'group' ? 'group' : 'private';
    $activeId = (int)($_GET['activeId'] ?? 0);
    $lastMsgId = (int)($_GET['lastMsgId'] ?? 0);
    $lastNotifId = (int)($_GET['lastNotifId'] ?? 0);
    $resp = [
        'now' => now(),
        'presence' => onlineIds(),
        'conversations' => conversationsOut($uid),
        'unreadNotifs' => 0,
        'friendReqCount' => 0,
        'newNotifications' => [],
        'active' => null,
    ];
    $st = db()->prepare('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND is_read=0'); $st->execute([$uid]);
    $resp['unreadNotifs'] = (int)$st->fetch()['c'];
    $st = db()->prepare("SELECT COUNT(*) c FROM friend_requests WHERE to_id=? AND status='pending'"); $st->execute([$uid]);
    $resp['friendReqCount'] = (int)$st->fetch()['c'];
    if ($lastNotifId > 0) {
        $st = db()->prepare('SELECT n.*, u.username, u.avatar FROM notifications n JOIN users u ON u.id=n.actor_id WHERE n.user_id=? AND n.id>? ORDER BY n.id DESC LIMIT 10');
        $st->execute([$uid, $lastNotifId]);
        $resp['newNotifications'] = array_map(fn($n) => [
            'id' => (int)$n['id'], 'type' => $n['type'], 'actor' => ['id' => (int)$n['actor_id'], 'username' => $n['username'], 'avatar' => $n['avatar']],
            'refType' => $n['ref_type'], 'refId' => (int)$n['ref_id'], 'content' => $n['content'], 'createdAt' => (int)$n['created_at'],
        ], $st->fetchAll());
        $resp['newNotifications'] = array_reverse($resp['newNotifications']);
    }
    if ($activeId > 0) {
        $allowed = $activeType === 'group' ? inGroup($activeId, $uid) : areFriends($uid, $activeId);
        if ($allowed) {
            if ($activeType === 'private') {
                $st = db()->prepare("SELECT * FROM messages WHERE conv_type='private' AND ((sender_id=? AND conv_id=?) OR (sender_id=? AND conv_id=?)) AND id>? ORDER BY id ASC LIMIT 50");
                $st->execute([$uid, $activeId, $activeId, $uid, $lastMsgId]);
                $reads = [$activeId => lastReadMsg('private', min($activeId, $uid), $activeId)];
            } else {
                $st = db()->prepare("SELECT * FROM messages WHERE conv_type='group' AND conv_id=? AND id>? ORDER BY id ASC LIMIT 50");
                $st->execute([$activeId, $lastMsgId]);
                $reads = [];
                $st2 = db()->prepare('SELECT user_id, last_read_msg_id FROM conv_reads WHERE conv_type=? AND conv_id=?');
                $st2->execute(['group', $activeId]);
                foreach ($st2->fetchAll() as $r) $reads[(int)$r['user_id']] = (int)$r['last_read_msg_id'];
            }
            $resp['active'] = ['convType' => $activeType, 'convId' => $activeId, 'messages' => array_map(fn($x) => msgOut($x, $uid), $st->fetchAll()), 'reads' => $reads];
        }
    }
    out($resp);
}

/* ============ UPLOAD ============ */
if ($route === 'upload' && $method === 'POST') {
    requireAuth();
    $url = saveUpload(null);
    out(['url' => $url, 'name' => $_FILES['file']['name'] ?? '', 'size' => (int)($_FILES['file']['size'] ?? 0)]);
}

function saveUpload(?string $kind): string {
    if (empty($_FILES['file']['tmp_name']) || !is_uploaded_file($_FILES['file']['tmp_name'])) fail('上传失败');
    $name = $_FILES['file']['name'] ?? 'file';
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION)) ?: 'bin';
    if ($kind === 'image' && !in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp'])) $ext = 'jpg';
    $dir = __DIR__ . '/../uploads';
    @mkdir($dir, 0775, true);
    $fn = now() . '-' . bin2hex(random_bytes(4)) . '.' . $ext;
    if (!move_uploaded_file($_FILES['file']['tmp_name'], $dir . '/' . $fn)) fail('上传失败');
    return '/uploads/' . $fn;
}

/* ============ STICKERS ============ */
if ($route === 'stickers/search') {
    $q = $_GET['q'] ?? 'trending';
    $list = [];
    $urls = [
        "https://g.tenor.com/v1/search?q=" . urlencode($q) . "&key=LIVDSRZULELA&limit=30&media_filter=minimal",
        "https://www.doutula.com/api/search?keyword=" . urlencode($q) . "&min=0&limit=30",
    ];
    foreach ($urls as $i => $u) {
        $ch = curl_init($u);
        $opts = [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 6];
        if ($p = getenv('HTTPS_PROXY') ?: getenv('https_proxy')) { $opts[CURLOPT_PROXY] = $p; }
        curl_setopt_array($ch, $opts);
        $res = curl_exec($ch); curl_close($ch);
        if (!$res) continue;
        $j = json_decode($res, true);
        if ($i === 0) {
            foreach ($j['results'] ?? [] as $x) {
                $url = $x['media'][0]['gif']['url'] ?? ($x['media'][0]['tinygif']['url'] ?? '');
                if ($url) $list[] = $url;
            }
        } else {
            foreach (($j['data'] ?? $j['list'] ?? []) as $x) {
                if ($img = ($x['image'] ?? $x['img'] ?? $x['url'] ?? '')) $list[] = $img;
            }
        }
        if ($list) break;
    }
    if (!$list) fail('表情包服务暂时不可用', 500);
    out(['stickers' => $list]);
}

/* ============ MOMENTS ============ */
function momentVisible(array $m, int $viewerId): bool {
    if ($m['deleted']) return false;
    if ((int)$m['user_id'] === $viewerId) return true;
    if ($m['visibility'] === 'private') return false;
    $visibleTo = json_decode($m['visible_to'] ?: '[]', true) ?: [];
    $hideFrom = json_decode($m['hide_from'] ?: '[]', true) ?: [];
    if (in_array($viewerId, $hideFrom)) return false;
    if ($m['visibility'] === 'visible') return in_array($viewerId, $visibleTo);
    return true;
}
function momentOut(array $m, int $viewerId): array {
    $st = db()->prepare('SELECT u.id, u.username, u.avatar FROM moment_likes l JOIN users u ON u.id=l.user_id WHERE l.moment_id=? ORDER BY l.id');
    $st->execute([$m['id']]);
    $likes = $st->fetchAll();
    $st = db()->prepare('SELECT * FROM moment_comments WHERE moment_id=? AND deleted=0 ORDER BY id');
    $st->execute([$m['id']]);
    $comments = array_map(fn($c) => [
        'id' => (int)$c['id'], 'user' => pubUserById($c['user_id']), 'targetCommentId' => (int)$c['target_comment_id'],
        'content' => $c['content'], 'createdAt' => (int)$c['created_at'],
        'canDelete' => (int)$c['user_id'] === $viewerId || (int)$m['user_id'] === $viewerId,
    ], $st->fetchAll());
    return [
        'id' => (int)$m['id'], 'user' => pubUserById($m['user_id']), 'content' => $m['content'],
        'media' => json_decode($m['media'] ?: '[]', true) ?: [], 'visibility' => $m['visibility'],
        'createdAt' => (int)$m['created_at'],
        'liked' => !!count(array_filter($likes, fn($l) => (int)$l['id'] === $viewerId)),
        'likes' => array_map(fn($l) => ['id' => (int)$l['id'], 'username' => $l['username'], 'avatar' => $l['avatar']], $likes),
        'comments' => $comments, 'isMine' => (int)$m['user_id'] === $viewerId,
    ];
}
function queryMoments(callable $filter, int $viewerId): array {
    $st = db()->prepare('SELECT * FROM moments ORDER BY id DESC LIMIT 200');
    $st->execute();
    $out = [];
    foreach ($st->fetchAll() as $m) {
        if ($filter($m) && momentVisible($m, $viewerId)) $out[] = momentOut($m, $viewerId);
    }
    return $out;
}

if ($route === 'moments' && $method === 'POST') {
    $me = requireAuth(); $b = body();
    $media = array_slice(is_array($b['media'] ?? null) ? $b['media'] : [], 0, 9);
    if (trim($b['content'] ?? '') === '' && !$media) fail('说点什么吧');
    $vis = in_array($b['visibility'] ?? '', ['public', 'private', 'visible', 'hide']) ? $b['visibility'] : 'public';
    db()->prepare('INSERT INTO moments (user_id,content,media,visibility,visible_to,hide_from,created_at) VALUES (?,?,?,?,?,?,?)')
        ->execute([$me['id'], mb_substr((string)($b['content'] ?? ''), 0, 2000), json_encode($media), $vis,
            json_encode(array_map('intval', $b['visibleTo'] ?? [])), json_encode(array_map('intval', $b['hideFrom'] ?? [])), now()]);
    $id = (int)db()->lastInsertId();
    $st = db()->prepare('SELECT * FROM moments WHERE id=?'); $st->execute([$id]);
    out(['ok' => true, 'moment' => momentOut($st->fetch(), (int)$me['id'])]);
}

if ($route === 'moments/feed') {
    $me = requireAuth(); $scope = $_GET['scope'] ?? 'all';
    if ($scope === 'friends') {
        $st = db()->prepare('SELECT friend_id FROM friends WHERE user_id=?'); $st->execute([$me['id']]);
        $fids = array_map(fn($r) => (int)$r['friend_id'], $st->fetchAll());
        out(['moments' => queryMoments(fn($m) => in_array((int)$m['user_id'], $fids), (int)$me['id'])]);
    } else {
        out(['moments' => queryMoments(fn($m) => true, (int)$me['id'])]);
    }
}

if (preg_match('#^moments/user/(\d+)$#', $route, $m)) {
    $me = requireAuth();
    out(['moments' => queryMoments(fn($x) => (int)$x['user_id'] === (int)$m[1], (int)$me['id'])]);
}

if (preg_match('#^moments/(\d+)$#', $route, $m) && $method === 'GET') {
    $me = requireAuth();
    $st = db()->prepare('SELECT * FROM moments WHERE id=?'); $st->execute([$m[1]]);
    $mo = $st->fetch();
    if (!$mo || !momentVisible($mo, (int)$me['id'])) fail('动态不存在或不可见', 404);
    out(['moment' => momentOut($mo, (int)$me['id'])]);
}

if (preg_match('#^moments/(\d+)/like$#', $route, $m) && $method === 'POST') {
    $me = requireAuth();
    $st = db()->prepare('SELECT * FROM moments WHERE id=? AND deleted=0'); $st->execute([$m[1]]);
    if (!$mo = $st->fetch()) fail('动态不存在', 404);
    $st = db()->prepare('SELECT * FROM moment_likes WHERE moment_id=? AND user_id=?'); $st->execute([$mo['id'], $me['id']]);
    if ($exist = $st->fetch()) {
        db()->prepare('DELETE FROM moment_likes WHERE id=?')->execute([$exist['id']]);
        out(['ok' => true, 'liked' => false]);
    }
    db()->prepare('INSERT INTO moment_likes (moment_id,user_id,created_at) VALUES (?,?,?)')->execute([$mo['id'], $me['id'], now()]);
    if ((int)$mo['user_id'] !== (int)$me['id']) notify((int)$mo['user_id'], 'like', (int)$me['id'], 'moment', (int)$mo['id'], '赞了你的动态');
    out(['ok' => true, 'liked' => true]);
}

if (preg_match('#^moments/(\d+)$#', $route, $m) && $method === 'DELETE') {
    $me = requireAuth();
    $st = db()->prepare('SELECT * FROM moments WHERE id=?'); $st->execute([$m[1]]);
    $mo = $st->fetch();
    if (!$mo || (int)$mo['user_id'] !== (int)$me['id']) fail('无权限', 403);
    db()->prepare('UPDATE moments SET deleted=1 WHERE id=?')->execute([$m[1]]);
    out(['ok' => true]);
}

if (preg_match('#^moments/(\d+)/comments$#', $route, $m) && $method === 'POST') {
    $me = requireAuth();
    $st = db()->prepare('SELECT * FROM moments WHERE id=? AND deleted=0'); $st->execute([$m[1]]);
    if (!$mo = $st->fetch()) fail('动态不存在', 404);
    $content = trim(body()['content'] ?? '');
    if ($content === '') fail('请输入评论内容');
    $target = (int)(body()['targetCommentId'] ?? 0);
    if ($target) {
        $st = db()->prepare('SELECT * FROM moment_comments WHERE id=? AND moment_id=?');
        $st->execute([$target, $mo['id']]);
        if (!$st->fetch()) $target = 0;
    }
    db()->prepare('INSERT INTO moment_comments (moment_id,user_id,target_comment_id,content,created_at) VALUES (?,?,?,?,?)')
        ->execute([$mo['id'], $me['id'], $target, mb_substr($content, 0, 500), now()]);
    $cid = (int)db()->lastInsertId();
    if ($target) {
        $st = db()->prepare('SELECT * FROM moment_comments WHERE id=?'); $st->execute([$target]);
        if ($t = $st->fetch()) {
            if ((int)$t['user_id'] !== (int)$me['id'])
                notify((int)$t['user_id'], 'comment_reply', (int)$me['id'], 'moment', (int)$mo['id'], '回复了你的评论：' . mb_substr($content, 0, 30));
        }
    } elseif ((int)$mo['user_id'] !== (int)$me['id']) {
        notify((int)$mo['user_id'], 'comment', (int)$me['id'], 'moment', (int)$mo['id'], '评论了你的动态：' . mb_substr($content, 0, 30));
    }
    out(['ok' => true, 'comment' => ['id' => $cid, 'user' => pubUserById($me['id']), 'targetCommentId' => $target, 'content' => $content, 'createdAt' => now(), 'canDelete' => true]]);
}

if (preg_match('#^moments/comments/(\d+)$#', $route, $m) && $method === 'DELETE') {
    $me = requireAuth();
    $st = db()->prepare('SELECT * FROM moment_comments WHERE id=?'); $st->execute([$m[1]]);
    if (!$c = $st->fetch()) fail('评论不存在', 404);
    $st = db()->prepare('SELECT * FROM moments WHERE id=?'); $st->execute([$c['moment_id']]);
    $mo = $st->fetch();
    if ((int)$c['user_id'] !== (int)$me['id'] && (int)$mo['user_id'] !== (int)$me['id']) fail('无权限', 403);
    db()->prepare('UPDATE moment_comments SET deleted=1 WHERE id=?')->execute([$c['id']]);
    out(['ok' => true]);
}

/* ============ NOTIFICATIONS ============ */
if ($route === 'notifications') {
    $me = requireAuth();
    $st = db()->prepare('SELECT n.*, u.username, u.avatar FROM notifications n JOIN users u ON u.id=n.actor_id WHERE n.user_id=? ORDER BY n.id DESC LIMIT 100');
    $st->execute([$me['id']]);
    out(['notifications' => array_map(fn($n) => [
        'id' => (int)$n['id'], 'type' => $n['type'],
        'actor' => ['id' => (int)$n['actor_id'], 'username' => $n['username'], 'avatar' => $n['avatar']],
        'refType' => $n['ref_type'], 'refId' => (int)$n['ref_id'], 'content' => $n['content'],
        'isRead' => !!$n['is_read'], 'createdAt' => (int)$n['created_at'],
    ], $st->fetchAll())]);
}

if ($route === 'notifications/unread-count') {
    $me = requireAuth();
    $st = db()->prepare('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND is_read=0'); $st->execute([$me['id']]);
    out(['count' => (int)$st->fetch()['c']]);
}

if ($route === 'notifications/read' && $method === 'POST') {
    $me = requireAuth();
    db()->prepare('UPDATE notifications SET is_read=1 WHERE user_id=?')->execute([$me['id']]);
    out(['ok' => true]);
}

fail('接口不存在: ' . $route, 404);
