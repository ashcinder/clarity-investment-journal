FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json ./tsconfig.json
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
RUN npm ci

COPY frontend frontend
COPY backend/shared backend/shared
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV CLARITY_PORT=4318
ENV CLARITY_BIND_HOST=0.0.0.0
ENV CLARITY_FRONTEND_DIR=/app/frontend/dist
ENV CLARITY_DB_PATH=/data/clarity.sqlite

COPY package.json ./package.json
COPY backend/src backend/src
COPY backend/shared backend/shared
COPY --from=build /app/frontend/dist frontend/dist

RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 4318
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4318/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "backend/src/server.mjs"]
