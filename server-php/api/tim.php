<?php
/* ===== 腾讯云 IM（TIM）接入层 =====
 * - UserSig 签发（HMAC-SHA256 + zlib + 腾讯专用 base64url 转义）
 * - REST API 调用
 * - 账号导入 / 资料同步 / 群镜像
 * - 实时信号推送（自定义消息 TIMCustomElem）
 *
 * 自定义消息体格式：{"e": 事件名, "d": 数据}
 * 事件：msg / msg-update / read-update / notification / friendreq / presence
 */

/* ---------- UserSig ---------- */
// 腾讯 UserSig 的 base64url 转义与通用 base64url 不同：+ → * ，/ → - ，= → _
function tim_sig_escape(string $b64): string {
    return str_replace(['+', '/', '='], ['*', '-', '_'], $b64);
}

function tim_usersig(string $identifier, int $expireSec = 180 * 86400): string {
    $curr = time();
    $expire = $curr + $expireSec;
    $raw = "TLS.identifier:{$identifier}\n"
        . 'TLS.sdkappid:' . TIM_SDKAPPID . "\n"
        . "TLS.time:{$curr}\n"
        . "TLS.expire:{$expire}\n";
    $sig = base64_encode(hash_hmac('sha256', $raw, TIM_SECRET, true));
    $doc = [
        'TLS.ver' => '2.0',
        'TLS.identifier' => $identifier,
        'TLS.sdkappid' => (int)TIM_SDKAPPID,
        'TLS.time' => $curr,
        'TLS.expire' => $expire,
        'TLS.sig' => $sig,
    ];
    return tim_sig_escape(base64_encode(gzcompress(json_encode($doc))));
}

function tim_identifier($uid): string { return 'u' . (int)$uid; }

/* ---------- 前端登录凭证 ---------- */
function tim_creds(int $uid): array {
    tim_ensure_account($uid);
    return [
        'sdkappid' => (int)TIM_SDKAPPID,
        'identifier' => tim_identifier($uid),
        'usersig' => tim_usersig(tim_identifier($uid)),
        'expire' => time() + 180 * 86400,
    ];
}

/* ---------- 公共地址 / 头像 ---------- */
function app_base_url(): string {
    if (defined('APP_BASE_URL') && APP_BASE_URL !== '') return rtrim(APP_BASE_URL, '/');
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $host = $_SERVER['HTTP_HOST'] ?? 'jaychat.ct.ws';
    return ($https ? 'https://' : 'http://') . $host;
}
function tim_faceurl($avatar): string {
    if (!$avatar) return '';
    if (preg_match('#^https?://#i', $avatar)) return (string)$avatar;
    return app_base_url() . '/' . ltrim((string)$avatar, '/');
}

/* ---------- REST ---------- */
function tim_rest(string $path, array $body, $identifier = null): array {
    $identifier = $identifier ?: TIM_ADMIN_IDENTIFIER;
    $qs = http_build_query([
        'sdkappid' => TIM_SDKAPPID,
        'identifier' => $identifier,
        'usersig' => tim_usersig($identifier),
        'random' => random_int(0, 4294967295),
        'contenttype' => 'json',
    ]);
    $ch = curl_init('https://console.tim.qq.com' . $path . '?' . $qs);
    $opts = [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    ];
    if ($p = (getenv('HTTPS_PROXY') ?: getenv('https_proxy'))) $opts[CURLOPT_PROXY] = $p;
    curl_setopt_array($ch, $opts);
    $res = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);
    if ($res === false) return ['ActionStatus' => 'FAIL', 'ErrorInfo' => 'curl: ' . $err];
    $j = json_decode($res, true);
    return is_array($j) ? $j : ['ActionStatus' => 'FAIL', 'ErrorInfo' => 'bad response'];
}
function tim_ok(array $r): bool {
    return ($r['ActionStatus'] ?? '') === 'OK' && (int)($r['ErrorCode'] ?? 0) === 0;
}

/* ---------- 账号导入 / 资料 ---------- */
function tim_ensure_account(int $uid): bool {
    static $done = [];
    if (isset($done[$uid])) return true;
    $st = db()->prepare('SELECT 1 FROM tim_accounts WHERE user_id=?');
    $st->execute([$uid]);
    if ($st->fetch()) { $done[$uid] = true; return true; }
    $st = db()->prepare('SELECT id,username,avatar FROM users WHERE id=?');
    $st->execute([$uid]);
    $u = $st->fetch();
    if (!$u) return false;
    $r = tim_rest('/v4/im_open_login_svc/account_import', [
        'Identifier' => tim_identifier($uid),
        'Nick' => $u['username'],
        'FaceUrl' => tim_faceurl($u['avatar']),
    ]);
    if (!tim_ok($r)) return false;
    insertIgnore('tim_accounts', ['user_id', 'imported_at'], [$uid, now()]);
    $done[$uid] = true;
    return true;
}

// 昵称 / 头像变更时同步到腾讯 IM
function tim_update_profile(int $uid, $nick = null, $avatar = null): void {
    if (!tim_ensure_account($uid)) return;
    $items = [];
    if ($nick !== null) $items[] = ['Tag' => 'Tag_Profile_IM_Nick', 'Value' => (string)$nick];
    if ($avatar !== null) $items[] = ['Tag' => 'Tag_Profile_IM_FaceUrl', 'Value' => tim_faceurl($avatar)];
    if (!$items) return;
    tim_rest('/v4/profile/portrait_set', [
        'From_Account' => tim_identifier($uid),
        'ProfileItem' => $items,
    ]);
}

/* ---------- 群镜像 ---------- */
function tim_group_id(int $appGroupId): ?string {
    $st = db()->prepare('SELECT tim_group_id FROM tim_groups WHERE group_id=?');
    $st->execute([$appGroupId]);
    $r = $st->fetch();
    return $r ? $r['tim_group_id'] : null;
}

function tim_ensure_group(int $appGroupId): ?string {
    if ($gid = tim_group_id($appGroupId)) return $gid;
    $st = db()->prepare('SELECT * FROM groups WHERE id=?');
    $st->execute([$appGroupId]);
    $g = $st->fetch();
    if (!$g) return null;
    $ownerUid = (int)$g['owner_id'];
    if (!tim_ensure_account($ownerUid)) return null;

    $st = db()->prepare('SELECT user_id FROM group_members WHERE group_id=?');
    $st->execute([$appGroupId]);
    $members = [];
    foreach ($st->fetchAll() as $row) {
        $u = (int)$row['user_id'];
        if ($u === $ownerUid) continue;
        if (tim_ensure_account($u)) $members[] = ['Member_Account' => tim_identifier($u)];
    }
    $r = tim_rest('/v4/group_open_http_svc/create_group', [
        'Owner_Account' => tim_identifier($ownerUid),
        'Type' => 'Public',
        'Name' => mb_substr($g['name'], 0, 30),
        'FaceUrl' => tim_faceurl($g['avatar']),
        'MemberList' => $members,
        'ApplyJoinOption' => 'FreeAccess',
    ]);
    if (!tim_ok($r) || empty($r['GroupId'])) return null;
    insertIgnore('tim_groups', ['group_id', 'tim_group_id', 'synced_at'], [$appGroupId, $r['GroupId'], now()]);
    return $r['GroupId'];
}

// 把 PHP 侧的成员差异同步到腾讯群
function tim_sync_group_members(int $appGroupId): void {
    $gid = tim_ensure_group($appGroupId);
    if (!$gid) return;
    $st = db()->prepare('SELECT user_id FROM group_members WHERE group_id=?');
    $st->execute([$appGroupId]);
    $want = [];
    foreach ($st->fetchAll() as $row) {
        $u = (int)$row['user_id'];
        if (tim_ensure_account($u)) $want[tim_identifier($u)] = true;
    }
    $r = tim_rest('/v4/group_open_http_svc/get_group_member_info', ['GroupId' => $gid]);
    $have = [];
    foreach (($r['MemberList'] ?? []) as $m) $have[$m['Member_Account']] = true;

    $add = array_values(array_diff(array_keys($want), array_keys($have)));
    $del = array_values(array_diff(array_keys($have), array_keys($want)));
    if ($add) {
        tim_rest('/v4/group_open_http_svc/add_group_member', [
            'GroupId' => $gid,
            'MemberList' => array_map(function ($a) { return ['Member_Account' => $a]; }, $add),
        ]);
    }
    if ($del) {
        tim_rest('/v4/group_open_http_svc/delete_group_member', [
            'GroupId' => $gid, 'MemberToDel_Account' => $del,
        ]);
    }
    db()->prepare('UPDATE tim_groups SET synced_at=? WHERE group_id=?')->execute([now(), $appGroupId]);
}

// 单个成员加入 Tencent 群（注册/邀请时调用，幂等）
function tim_add_group_member(int $appGroupId, int $uid): void {
    $gid = tim_ensure_group($appGroupId);
    if (!$gid) return;
    if (!tim_ensure_account($uid)) return;
    tim_rest('/v4/group_open_http_svc/add_group_member', [
        'GroupId' => $gid,
        'MemberList' => [['Member_Account' => tim_identifier($uid)]],
    ]);
}

// 用户登录时把其所在的全部应用群补齐到 Tencent 群（容错：注册时同步失败也能补上）
function tim_sync_user_groups(int $uid): void {
    $st = db()->prepare('SELECT group_id FROM group_members WHERE user_id=?');
    $st->execute([$uid]);
    foreach ($st->fetchAll() as $row) tim_add_group_member((int)$row['group_id'], $uid);
}

function tim_update_group(int $appGroupId, $name = null, $avatar = null, $ownerUid = null): void {
    $gid = tim_ensure_group($appGroupId);
    if (!$gid) return;
    $body = ['GroupId' => $gid];
    if ($name !== null) $body['Name'] = mb_substr((string)$name, 0, 30);
    if ($avatar !== null) $body['FaceUrl'] = tim_faceurl($avatar);
    if (count($body) > 1) tim_rest('/v4/group_open_http_svc/modify_group_base_info', $body);
    if ($ownerUid !== null) {
        tim_rest('/v4/group_open_http_svc/change_group_owner', [
            'GroupId' => $gid, 'NewOwner_Account' => tim_identifier($ownerUid),
        ]);
    }
}

/* ---------- 实时信号 ---------- */
function tim_signal_user(int $toUid, string $event, array $data = [], int $fromUid = 0): void {
    if ($toUid <= 0) return;
    if (!tim_ensure_account($toUid)) return;
    $from = $fromUid > 0 ? tim_identifier($fromUid) : TIM_ADMIN_IDENTIFIER;
    if ($fromUid > 0) tim_ensure_account($fromUid);
    tim_rest('/v4/openim/sendmsg', [
        'SyncOtherMachine' => 2, // 不同步到发送方，避免自己收到自己的信号
        'From_Account' => $from,
        'To_Account' => tim_identifier($toUid),
        'MsgRandom' => random_int(1, 4294967295),
        'MsgBody' => [[
            'MsgType' => 'TIMCustomElem',
            'MsgContent' => [
                'Data' => json_encode(['e' => $event, 'd' => $data], JSON_UNESCAPED_UNICODE),
                'Desc' => 'JC-SIGNAL',
                'Ext' => '',
            ],
        ]],
    ]);
}

function tim_signal_group(int $appGroupId, string $event, array $data = [], int $fromUid = 0): void {
    $gid = tim_ensure_group($appGroupId);
    if (!$gid) return;
    $from = $fromUid > 0 ? tim_identifier($fromUid) : TIM_ADMIN_IDENTIFIER;
    if ($fromUid > 0) tim_ensure_account($fromUid);
    tim_rest('/v4/group_open_http_svc/send_group_msg', [
        'GroupId' => $gid,
        'From_Account' => $from,
        'Random' => random_int(1, 4294967295),
        'MsgBody' => [[
            'MsgType' => 'TIMCustomElem',
            'MsgContent' => [
                'Data' => json_encode(['e' => $event, 'd' => $data], JSON_UNESCAPED_UNICODE),
                'Desc' => 'JC-SIGNAL',
                'Ext' => '',
            ],
        ]],
    ]);
}

/* ---------- 会话级信号（自动区分私聊/群聊） ---------- */
function tim_signal_conv(string $convType, int $convId, string $event, array $data = [], int $fromUid = 0): void {
    if ($convType === 'group') {
        tim_signal_group($convId, $event, $data, $fromUid);
    } else {
        tim_signal_user($convId, $event, $data, $fromUid);
    }
}

/* ---------- 在线状态广播（O(1)：借官方群作为全员广播通道） ---------- */
function tim_official_group_id(): ?int {
    $st = db()->prepare('SELECT id FROM groups WHERE is_official=1 LIMIT 1');
    $st->execute();
    $r = $st->fetch();
    return $r ? (int)$r['id'] : null;
}

function tim_broadcast_presence(int $uid, bool $online, bool $changed = false): void {
    $gid = tim_official_group_id();
    if (!$gid) return;
    tim_signal_group($gid, 'presence', ['userId' => $uid, 'online' => $online]);
}
