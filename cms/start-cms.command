#!/bin/zsh

set -e

CMS_DIR="/Users/kentacky/DXL-Labs/xeloc-news/cms"
CMS_URL="http://localhost:4177/"
PORT="4177"

if ! lsof -nP -iTCP:${PORT} -sTCP:LISTEN | grep -q node; then
  cd "$CMS_DIR"
  npm start &
  sleep 1.5
fi

open "$CMS_URL"
