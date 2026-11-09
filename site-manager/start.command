#!/bin/bash
# Webサイト管理システム 起動用（Mac）
cd "$(dirname "$0")" || exit 1
if ! command -v node > /dev/null 2>&1; then
  echo "Node.js がインストールされていません。https://nodejs.org/ja から LTS 版をインストールしてください。"
  read -r -p "Enterキーで閉じます"
  exit 1
fi
(sleep 2; open "http://127.0.0.1:3800/") &
node server.js
