# VPS 自动部署

`.github/workflows/deploy-vps.yml` 在 `main` 分支更新后把源码发送到服务器。服务器在独立发布目录中构建 Docker 镜像，容器通过健康检查后才更新 `/opt/clarity/current`。

服务器登录配置保存在 `/opt/clarity/shared/.env.server`，账本数据库保存在 Docker 卷 `clarity-investment-data`。二者均不进入 GitHub，也不会因为代码发布而被覆盖。

GitHub 仓库需要以下 Actions Secrets：

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`
- `VPS_KNOWN_HOSTS`

自动部署使用独立的 Ed25519 SSH 密钥，不使用服务器密码。部署失败时旧容器继续运行，可在 GitHub Actions 页面查看构建日志。
