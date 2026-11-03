FROM node:22-bookworm-slim
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends libreoffice-impress poppler-utils fonts-dejavu-core ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
RUN mkdir -p /app/storage && chown -R node:node /app
USER node
EXPOSE 3000
ENV NODE_ENV=production PORT=3000 STORAGE_DIR=/app/storage
CMD ["node","server.js"]
