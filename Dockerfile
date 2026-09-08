FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
# Build native SQLite dependencies for the target architecture when a prebuild
# is unavailable (notably during the arm64 publication build).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && npm ci

FROM dependencies AS builder
COPY . .
RUN npm run db:generate && npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MONOGATARI_DATA_DIR=/data
WORKDIR /app
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/scripts/migrate-production-database.mjs ./scripts/migrate-production-database.mjs
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl util-linux \
  && rm -rf /var/lib/apt/lists/* \
  && chmod 755 ./docker-entrypoint.sh \
  && mkdir -p /data/backups \
  && chown -R node:node /app /data
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
