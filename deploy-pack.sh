#!/bin/bash
# 打包 InfinityFree 部署包：client(www) + PHP后端 → jaychat-infinityfree.zip
set -e
ROOT=/workspace
STAGE=/tmp/jaychat-pack/htdocs
rm -rf /tmp/jaychat-pack && mkdir -p "$STAGE"

# 1) 客户端静态文件（排除本地测试路由器）
cp -r "$ROOT/app/www/." "$STAGE/"
rm -f "$STAGE/php-router.php"

# 2) PHP 后端（api/、.htaccess、uploads/）
cp -r "$ROOT/server-php/api" "$STAGE/api"
cp "$ROOT/server-php/.htaccess" "$STAGE/.htaccess"
mkdir -p "$STAGE/uploads"
for f in official-avatar.svg official-group.svg jay-ai.svg; do
  cp "$ROOT/server-php/api/assets/$f" "$STAGE/uploads/$f"
done

# 3) 清理 PHPMailer 多余文件（只留 src）
find "$STAGE/api/phpmailer" -maxdepth 1 -mindepth 1 ! -name src -exec rm -rf {} +

# 4) 教程
cp "$ROOT/部署教程-InfinityFree.md" /tmp/jaychat-pack/

# 5) zip（zip 根目录 = htdocs 内容，解压即用）
rm -f "$ROOT/jaychat-infinityfree.zip"
cd "$STAGE" && zip -qr "$ROOT/jaychat-infinityfree.zip" .
cp /tmp/jaychat-pack/部署教程-InfinityFree.md "$ROOT/" 2>/dev/null || true
echo "打包完成: $ROOT/jaychat-infinityfree.zip"
unzip -l "$ROOT/jaychat-infinityfree.zip" | tail -3
