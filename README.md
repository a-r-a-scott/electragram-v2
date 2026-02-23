# Electragram v2

A modern AWS-hosted microservices platform for event management and multi-channel communication (Email, SMS, WhatsApp). Supports web (Next.js 15) and native mobile (React Native/Expo) clients.

## Architecture

```
12 microservices  ←→  AWS API Gateway  ←→  Next.js Web + React Native Mobile
     ↕                                           ↕
  AWS RDS          AWS SQS/SNS/EventBridge     CloudFront
  PostgreSQL       ElastiCache Redis           S3
```

See [docs/architecture.md](docs/architecture.md) for the full architecture and microservices catalogue.  
See [docs/analysis.md](docs/analysis.md) for the migration analysis from the Rails monolith.

## Monorepo Structure

```
electragram-v2/
├── apps/
│   ├── web/              # Next.js 15 dashboard
│   ├── mobile/           # React Native (Expo SDK 52)
│   └── public-pages/     # Public event pages
├── services/
│   ├── identity/         # Auth, users, accounts, RBAC (TS/Fastify) — COMPLETE
│   ├── contacts/         # Contacts, lists, custom fields (TS/Fastify) — COMPLETE
│   ├── events/           # Events, guests, forms, pages (TS/Fastify)
│   ├── messaging/        # Messages, releases, triggers (TS/Fastify)
│   ├── chat/             # Real-time conversations (TS/Fastify)
│   ├── integrations/     # CRM integrations (TS/Fastify)
│   ├── design/           # Themes, templates, blocks (TS/Fastify)
│   ├── analytics/        # Metrics, activity feed (TS/Fastify)
│   ├── delivery/         # Email/SMS/WhatsApp sending (Go/Lambda)
│   ├── tracking/         # Open pixel, click redirect (Go/Lambda)
│   ├── webhooks/         # Incoming Twilio webhooks (Go/Lambda)
│   └── media/            # File uploads, exports (TS/Lambda)
├── packages/
│   ├── types/            # Shared TypeScript types (Zod schemas)
│   ├── ui/               # Shared React web components
│   ├── ui-native/        # Shared React Native components
│   ├── api-client/       # Generated OpenAPI client
│   ├── test-utils/       # Shared test factories and helpers
│   └── config/           # ESLint, TSConfig, Vitest presets
└── infra/
    └── cdk/              # AWS CDK stacks (TypeScript)
```

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 9+
- Go 1.23+
- Docker + Docker Compose
- AWS CLI (for deployment)

### Local Development

```bash
# Install dependencies
pnpm install

# Start infrastructure (Postgres, Redis, LocalStack)
docker compose up -d postgres redis localstack

# Start all services
pnpm dev

# Or start a specific service
pnpm --filter @electragram/identity-service dev
```

Services will be available at:
- Identity: http://localhost:3001
- Contacts: http://localhost:3002
- Events: http://localhost:3003
- Messaging: http://localhost:3004
- Chat: http://localhost:3007
- Integrations: http://localhost:3008
- Design: http://localhost:3009
- Analytics: http://localhost:3010
- Web app: http://localhost:3000

### Environment Setup

```bash
cp .env.example .env
# Edit .env with your local values
```

## Testing

### Run all tests
```bash
pnpm test
```

### Unit tests only (fast, no Docker required)
```bash
pnpm test:unit
```

### Integration tests (requires Docker)
```bash
pnpm test:integration
```

### E2E tests (web)
```bash
pnpm --filter @electragram/web test:e2e
```

### E2E tests (mobile)
```bash
pnpm --filter @electragram/mobile test:e2e:ios
pnpm --filter @electragram/mobile test:e2e:android
```

### Load tests
```bash
# Requires k6 installed
k6 run services/delivery/tests/load/delivery.k6.js
k6 run services/tracking/tests/load/tracking.k6.js
```

### Coverage Requirements

All services enforce **100% line/branch/function coverage** via CI. Builds fail below threshold.

| Layer | Tool | Threshold |
|---|---|---|
| TypeScript services | Vitest + c8 | 100% |
| Go services | go test -cover | 100% |
| React web | Vitest + RTL | 100% |
| React Native | Jest + RNTL | 100% |
| CDK infra | Vitest + CDK Assertions | 100% |

## Deployment

### Staging (auto, on push to `main`)
```bash
git push origin main
# GitHub Actions deploys all changed services
```

### Production (manual)
```bash
git push origin production
# Or trigger via GitHub Actions workflow_dispatch
```

### Infrastructure (CDK)
```bash
# Deploy all stacks to staging
pnpm --filter @electragram/infra-cdk deploy:staging

# Deploy to production
pnpm --filter @electragram/infra-cdk deploy:production
```

## Service Implementation Status

| Service | Status | Description |
|---|---|---|
| Identity | ✅ Complete | JWT auth, Google OAuth, RBAC |
| Contacts | ✅ Complete | CRUD, deduplication, lists |
| Events | 🔧 Stub | Guest lifecycle, forms, pages |
| Messaging | 🔧 Stub | Messages, releases, triggers |
| Chat | 🔧 Stub | Real-time conversations |
| Integrations | 🔧 Stub | HubSpot, Mailchimp, etc. |
| Design | 🔧 Stub | Themes, templates, blocks |
| Analytics | 🔧 Stub | Metrics, snapshots |
| Delivery | 🔧 Stub | SendGrid, Twilio (Go) |
| Tracking | 🔧 Stub | Open pixel, redirects (Go) |
| Webhooks | 🔧 Stub | Twilio webhooks (Go) |
| Media | 🔧 Stub | S3 uploads, exports |

See [Identity Service](services/identity/) and [Contacts Service](services/contacts/) as the **reference implementation** for the pattern to follow when implementing stub services.

## Technology Stack

| Layer | Technology |
|---|---|
| API services | TypeScript 5.7 / Fastify 5 |
| High-throughput | Go 1.23 / AWS Lambda |
| Web frontend | Next.js 15 / React 19 |
| Mobile | React Native 0.76 / Expo SDK 52 |
| Database | PostgreSQL 16 / Drizzle ORM |
| Cache | Redis 7 / ElastiCache |
| Queue | AWS SQS |
| Events | AWS SNS + EventBridge |
| Auth | JWT RS256 / AWS Secrets Manager |
| Storage | AWS S3 + CloudFront |
| Infrastructure | AWS CDK (TypeScript) |
| CI/CD | GitHub Actions |
| Testing | Vitest, Testcontainers, Playwright, Detox, Pact, k6 |

## Contributing

1. Branch from `main`
2. All PRs must pass the CI gate (lint + typecheck + unit tests + integration tests + CDK tests)
3. 100% test coverage required — PRs failing below threshold are automatically rejected
4. Follow the Identity/Contacts service pattern for new service implementations

## Documentation

- [Migration Analysis](docs/analysis.md)
- [Architecture & Microservices Catalogue](docs/architecture.md)
