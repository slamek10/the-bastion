# two stages like bastion-heat: build natively on the build host (plain JS
# output), run on a slim image
FROM --platform=$BUILDPLATFORM node:22-slim AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
# the pnpm version pinned in package.json ("packageManager")
RUN npm install -g "$(node -p "require('./package.json').packageManager")" && \
  pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build && pnpm prune --prod

FROM node:22-slim
WORKDIR /app
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server.js /app/bastion-session.js /app/package.json ./

ARG VERSION=dev
ARG BUILD_DATE
ENV APP_VERSION=$VERSION \
  APP_BUILD_DATE=$BUILD_DATE \
  PORT=5040 \
  NODE_ENV=production \
  BODY_SIZE_LIMIT=1M

EXPOSE 5040
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5040/_api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
