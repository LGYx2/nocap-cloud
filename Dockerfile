# syntax=docker/dockerfile:1

# One image for the whole panel: API, worker and the built web panel.
# The server is bundled into a single file, so the runtime only installs native modules.

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/site/package.json apps/site/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @nocap/web build && pnpm --filter @nocap/server build

# Install only the native modules the bundle leaves external, at the exact locked version.
WORKDIR /out
RUN ARGON2_VERSION="$(node -p "require('/repo/apps/server/node_modules/@node-rs/argon2/package.json').version")" \
 && echo '{"name":"nocap","private":true,"type":"module"}' > package.json \
 && npm install --omit=dev --no-audit --no-fund "@node-rs/argon2@${ARGON2_VERSION}"

FROM node:22-alpine AS runtime
ARG NOCAP_VERSION=dev
ENV NODE_ENV=production \
    PORT=3000 \
    PUBLIC_DIR=/app/public \
    DATA_DIR=/app/data \
    NOCAP_VERSION=${NOCAP_VERSION}
# git clones apps; the Docker CLI (with BuildKit) builds and runs them through the mounted socket.
# Versions follow the pinned node:22-alpine base; pinning apk versions breaks on every Alpine update.
# hadolint ignore=DL3018
RUN apk add --no-cache git docker-cli docker-cli-buildx \
 && mkdir -p /app/data && chown 1000:1000 /app/data
WORKDIR /app
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/packages/db/drizzle ./drizzle
COPY --from=build /repo/apps/web/dist ./public

# Runs as the unprivileged node user (uid 1000). Compose adds the Docker socket's group.
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["wget", "-q", "--spider", "http://127.0.0.1:3000/api/health"]
CMD ["node", "--enable-source-maps", "dist/index.js"]
