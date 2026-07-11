#!/bin/sh
set -e
mkdir -p dist
cp index.html styles.css script.js seed-data.js dist/
printf '%s\n' '/*' '  X-Frame-Options: DENY' '  Referrer-Policy: no-referrer' > dist/_headers
