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
EXPOSE ${PORT:-3002}
CMD ["pnpm", "--filter", "@electragram/contacts-service", "dev"]

# ── build ─────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
RUN pnpm --filter @electragram/types build && \
    pnpm --filter @electragram/contacts-service build

# ── production ────────────────────────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production
RUN addgroup -g 1001 nodejs && adduser -S -u 1001 nodejs
COPY --from=build --chown=nodejs:nodejs /app/services/contacts/dist ./dist
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/services/contacts/package.json ./
USER nodejs
EXPOSE 3002
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -qO- http://localhost:3002/health || exit 1
CMD ["node", "dist/index.js"]
