#!/usr/bin/env bash
set -euo pipefail

release_dir="${1:?缺少发布目录}"
shared_dir="/opt/clarity/shared"
current_link="/opt/clarity/current"

mkdir -p "$shared_dir"

if [[ ! -f "$shared_dir/.env.server" ]]; then
  previous_release="$(readlink -f "$current_link" 2>/dev/null || true)"
  if [[ -n "$previous_release" && -f "$previous_release/.env.server" ]]; then
    cp "$previous_release/.env.server" "$shared_dir/.env.server"
    chmod 600 "$shared_dir/.env.server"
  else
    echo "服务器登录配置不存在：$shared_dir/.env.server" >&2
    exit 1
  fi
fi

ln -sfn "$shared_dir/.env.server" "$release_dir/.env.server"
cd "$release_dir"

docker compose build
docker compose up -d --remove-orphans

for attempt in {1..30}; do
  if curl -fsS http://127.0.0.1:4318/api/health >/dev/null; then
    ln -sfn "$release_dir" "$current_link"
    echo "部署成功：$(basename "$release_dir")"
    exit 0
  fi
  sleep 2
done

docker compose logs --tail 100 >&2
echo "新版本未通过健康检查，未切换 current 链接" >&2
exit 1
