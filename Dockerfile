# =========================================================
# 智护随行 · 软件更新托管平台 — 容器镜像
# 零依赖 Node 应用：无需 npm install
# 适用：Claw Cloud Run / Koyeb / Render / 任意 Docker 环境
# 运行时请在平台挂载两个持久卷：
#   /app/data    （版本数据 db.json）
#   /app/uploads （软件包文件）
# =========================================================
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY server.js ./
COPY public ./public

EXPOSE 8200
CMD ["node", "server.js"]
