#!/bin/zsh
cd "${0:A:h}" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "请先安装 Node.js 22.18 或更新版本：https://nodejs.org/"
  read '?按回车退出'; exit 1
fi
if [[ ! -d node_modules ]]; then
  npm ci || exit 1
fi
npm run local
