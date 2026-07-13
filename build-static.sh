#!/bin/sh
set -e
mkdir -p dist/icons
cp index.html styles.css script.js seed-data.js cloud-sync.js config.example.js schema-journals.sql manifest.webmanifest sw.js dist/
cp icons/icon-180.png icons/icon-192.png icons/icon-512.png dist/icons/
# 本地密钥文件若存在则一并打包（私有部署时用）；公开仓库请不要提交 config.js
if [ -f config.js ]; then
  cp config.js dist/
fi
cat > dist/.assetsignore << 'IGNORE'
.git
.github
node_modules
.DS_Store
IGNORE
