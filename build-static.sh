#!/bin/sh
set -e
mkdir -p dist
cp index.html styles.css script.js seed-data.js dist/
cat > dist/.assetsignore << 'IGNORE'
.git
.github
node_modules
.DS_Store
IGNORE
