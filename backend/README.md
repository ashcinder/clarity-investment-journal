# Backend

Node.js HTTP API + SQLite。后端不再托管前端网页；前端独立运行在 5173 端口。

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

服务只监听本机地址，供个人本地使用。API 包括账本读写、清空、汇率查询和健康检查；后台每分钟检查自动定投。

`src/server.mjs` 是独立后端入口，`src/automation.ts` 是定投逻辑。`cloud/` 保存线上 D1 API 和 Sites 登录适配；这些文件不由本地 Node 服务加载。线上使用的数据库迁移仍放在根目录 `drizzle/`，不要修改已应用的迁移。

## 本机来源

默认同时接受 `http://127.0.0.1:5173` 与 `http://localhost:5173`，两者连接同一个 SQLite 账本。其他来源仍会被拒绝。
