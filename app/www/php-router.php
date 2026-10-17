<?php
// 本地开发用路由（php -S 时使用，InfinityFree 上不需要）
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
if (preg_match('#^/api(/|$)#', $uri)) {
    $_GET['r'] = ltrim($uri, '/');
    require '/workspace/jaychat/server-php/api/index.php';
    return true;
}
if (preg_match('#^/uploads/(.+)$#', $uri, $m)) {
    $f = realpath('/workspace/jaychat/server-php/uploads/' . basename($m[1]));
    if ($f && is_file($f)) {
        $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
        $mime = ['svg' => 'image/svg+xml', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png',
            'gif' => 'image/gif', 'webp' => 'image/webp', 'mp4' => 'video/mp4', 'mov' => 'video/quicktime', 'webm' => 'video/webm'];
        header('Content-Type: ' . ($mime[$ext] ?? 'application/octet-stream'));
        readfile($f);
        return true;
    }
    http_response_code(404);
    echo 'not found';
    return true;
}
return false; // 其余交给内置服务器提供静态文件
