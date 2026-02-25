# syntax=docker/dockerfile:1

# ── base ──────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ── deps ──────────────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ── development ───────────────────────────────────────────────────────────────
FROM deps AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["pnpm", "--filter", "@electragram/web", "dev"]

# ── build ─────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
RUN pnpm --filter @electragram/types build && \
    pnpm --filter @electragram/web build

# ── production ────────────────────────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production
RUN addgroup -g 1001 nodejs && adduser -S -u 1001 nodejs
COPY --from=build --chown=nodejs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nodejs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nodejs:nodejs /app/apps/web/public ./apps/web/public
USER nodejs
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -qO- http://localhost:3000/ || exit 1
CMD ["node", "apps/web/server.js"]
