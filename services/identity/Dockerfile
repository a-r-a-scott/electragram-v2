# ─── Base ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ─── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
COPY services/identity/package.json ./services/identity/
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
RUN pnpm install --frozen-lockfile --filter @electragram/identity-service...

# ─── Build ────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY packages/config ./packages/config
COPY packages/types ./packages/types
COPY services/identity ./services/identity
RUN pnpm --filter @electragram/types build && \
    pnpm --filter @electragram/identity-service build

# ─── Development ──────────────────────────────────────────────────────────────
FROM deps AS development
COPY packages/config ./packages/config
COPY packages/types ./packages/types
COPY services/identity ./services/identity
EXPOSE 3001
CMD ["pnpm", "--filter", "@electragram/identity-service", "dev"]

# ─── Production ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app
RUN addgroup -g 1001 nodejs && adduser -S -u 1001 nodejs

COPY --from=build --chown=nodejs:nodejs /app/services/identity/dist ./dist
COPY --from=build --chown=nodejs:nodejs /app/packages/types/dist ./node_modules/@electragram/types/dist
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

USER nodejs
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "dist/index.js"]
