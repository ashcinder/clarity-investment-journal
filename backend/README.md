# Backend

Node.js HTTP API + SQLite。本地开发时前后端分离；云服务器中后端可直接托管构建后的前端。

```bash
cd backend
npm run dev
```

`dev` 监听后端文件变化并重启。正常运行使用 `npm run start`。

API 默认地址：http://127.0.0.1:4318 ，健康检查：`GET /api/health`。

数据文件为 `backend/data/clarity.sqlite`。原有数据库已整体迁移，内容不变。数据库及 WAL 文件不提交到源码库。前端重启或重新构建不会影响数据库。

可选环境变量：

- `CLARITY_PORT`：后端端口，默认 4318。
- `CLARITY_DB_PATH`：数据库绝对路径。
- `CLARITY_FRONTEND_ORIGIN`：允许的前端来源，默认 `http://127.0.0.1:5173`。
- `CLARITY_FRONTEND_DIR`：需要由后端托管的前端构建目录。
- `CLARITY_PUBLIC_ORIGIN`：云服务器对外 HTTPS 来源。
- `CLARITY_LOGIN_EMAIL`、`CLARITY_LOGIN_PASSWORD`、`CLARITY_SESSION_SECRET`：三项同时存在时启用登录，并在首次启动时创建保留旧账本的初始管理员账号。
- `CLARITY_ALLOW_REGISTRATION`：默认开放邮箱注册；设为 `false` 可关闭新用户注册。

服务只监听本机地址，供个人本地使用。API 包括账本读写、清空、汇率查询和健康检查；后台每分钟检查自动定投。

`src/server.mjs` 是独立服务器入口，可同时提供前端静态文件、密码登录、API 和 SQLite；`src/automation.ts` 是定投逻辑。`shared/` 保存共用计算，`cloud/` 保存 D1 API 和 Sites 登录适配。`scripts/` 收纳启动与清理脚本，`tests/` 收纳所有自动化验证。

## 本机来源

默认同时接受 `http://127.0.0.1:5173` 与 `http://localhost:5173`，两者连接同一个 SQLite 账本。其他来源仍会被拒绝。
