# Frontend

React + Vite 前端，页面、组件、样式、静态资源全部在本目录。只通过 `/api/*` 调用后端，不直接访问数据库。

首次在项目根目录运行 `npm ci`，然后可以独立启动：

```bash
cd frontend
npm run dev
```

打开 http://127.0.0.1:5173 。默认将 `/api` 请求代理到 http://127.0.0.1:4318 。后端需要在另一终端启动。

```bash
npm run build
npm run start
```

构建输出为 `frontend/dist/`；`start` 启动构建预览，也支持 API 代理。

`CLARITY_API_URL` 可指定后端地址，`CLARITY_FRONTEND_PORT` 可指定前端端口。可以通过终端环境变量或 `frontend/.env.local` 设置。更改端口后须同步后端的 `CLARITY_FRONTEND_ORIGIN`。

共享类型和资产计算来自 `../backend/shared/ledger.ts`；主界面入口为 `src/components/investment-app.tsx`。
