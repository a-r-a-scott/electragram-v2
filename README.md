# Electragram v2

A modern AWS-hosted microservices platform for event management and multi-channel communication (Email, SMS, WhatsApp). Supports web (Next.js 15) and native mobile (React Native/Expo) clients. Migrated from a Ruby on Rails monolith.

## Architecture

```
12 microservices  ←→  AWS API Gateway  ←→  Next.js Web + React Native Mobile
     ↕                                           ↕
  AWS RDS          AWS SQS/SNS/EventBridge     CloudFront
  PostgreSQL       ElastiCache Redis           S3
```

See [docs/architecture.md](docs/architecture.md) for the full architecture and microservices catalogue.  
See [docs/analysis.md](docs/analysis.md) for the migration analysis from the Rails monolith.

---

## Monorepo Structure

```
electragram-v2/
├── apps/
│   ├── web/              # Next.js 15 App Router dashboard
│   └── mobile/           # React Native (Expo SDK 52)
├── services/
│   ├── identity/         # Auth, users, accounts, RBAC — TypeScript/Fastify  ✅
│   ├── contacts/         # Contacts, lists, custom fields — TypeScript/Fastify ✅
│   ├── events/           # Events, guests, forms, pages — TypeScript/Fastify  ✅
│   ├── messaging/        # Messages, templates, dispatch — TypeScript/Fastify ✅
│   ├── delivery/         # Email/SMS/WhatsApp sending — Go/Lambda             ✅
│   ├── tracking/         # Open pixel, click redirect — Go/Lambda             ✅
│   ├── chat/             # Real-time conversations — TypeScript/Fastify       🔧
│   ├── integrations/     # CRM integrations — TypeScript/Fastify              🔧
│   ├── design/           # Themes, templates, blocks — TypeScript/Fastify     ✅
│   ├── analytics/        # Metrics, activity feed — TypeScript/Fastify        ✅
│   ├── webhooks/         # Incoming Twilio webhooks — Go/Lambda               ✅
│   └── media/            # File uploads, exports — TypeScript/Lambda          🔧
├── packages/
│   ├── types/            # Shared TypeScript types and Zod schemas
│   ├── test-utils/       # Shared test factories, DB helpers, AWS mocks
│   └── config/           # ESLint, TSConfig, Vitest presets
└── infra/
    └── cdk/              # AWS CDK stacks (TypeScript)
```

---

## Service Implementation Status

| Service | Status | Language | Tests | Description |
|---|---|---|---|---|
| **Identity** | ✅ Complete | TypeScript/Fastify | 83+ passing | JWT auth (RS256), Google OAuth, account management, RBAC |
| **Contacts** | ✅ Complete | TypeScript/Fastify | 80+ passing | CRUD, deduplication, lists, custom fields, full-text search |
| **Events** | ✅ Complete | TypeScript/Fastify | 83 unit + integration | Guest state machine, forms, pages, check-in, bulk-add |
| **Messaging** | ✅ Complete | TypeScript/Fastify | 82 unit + integration | Templates, messages, scheduling, SQS dispatch, unsubscribes |
| **Delivery** | ✅ Complete | Go/Lambda | 30 passing (worker 100%) | SendGrid email, Twilio SMS/WhatsApp, partial batch failure |
| **Tracking** | ✅ Complete | Go/Lambda | 57 passing (handler 98%) | Open pixel, click redirect, unsubscribe page/confirm, HMAC tokens |
| **Chat** | ✅ Complete | TypeScript/Fastify | 48 passing | Real-time WebSocket conversations, SQS inbound consumer, Twilio outbound |
| **Integrations** | ✅ Complete | TypeScript/Fastify | 47 passing | HubSpot, Mailchimp, Google Sheets, Klaviyo — OAuth + API key + ProviderKit sync |
| **Design** | ✅ Complete | TypeScript/Fastify | 61 passing | Themes, templates, layers, fonts, palettes, graphics, blocks, email renderer |
| **Analytics** | ✅ Complete | TypeScript/Fastify | 48 passing | SNS event consumer, snapshot counter upserts, activity feed, summary rates |
| **Webhooks** | ✅ Complete | Go/Lambda | 47 passing (handler 95.9%) | Twilio sig validation (HMAC-SHA1), route to SQS |
| **Media** | ✅ Complete | TypeScript/Lambda | 45 passing | S3 presigned uploads, CSV import pipeline, export generation |

**Reference implementations:**
- **TypeScript/Fastify ECS service** → Identity (auth), Events (CRUD + state machine), or Messaging (async dispatch)
- **Go Lambda (SQS trigger)** → Delivery (batch processor, partial failure handling)
- **Go Lambda (API Gateway trigger)** → Tracking (low-latency HTTP, HMAC tokens, async DB writes) or Webhooks (Twilio signature validation, SQS routing)
- **TypeScript/Fastify — renderer pattern** → Design (template rendering, CSS variable injection, interpolation pipeline)
- **TypeScript/Fastify — SQS consumer + HTTP API** → Analytics (background SNS event processing, atomic counter upserts, activity feed)
- **TypeScript/Fastify — WebSocket + SQS consumer** → Chat (real-time message broadcast, inbound Twilio routing, find-or-create conversation)
- **TypeScript/Fastify — OAuth + ProviderKit strategy** → Integrations (OAuth 2.0 connect flows, API key auth, pluggable provider adapters, contact sync)
- **TypeScript/Lambda — direct handler + router** → Media (S3 presigned URLs, CSV import pipeline, export generation, Lambda-native without framework overhead)

---

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 9+
- Go 1.26+
- Docker + Docker Compose
- AWS CLI (for deployment)

### Local Development

```bash
# Install all dependencies
pnpm install

# Start local infrastructure (Postgres, Redis, LocalStack)
docker compose up -d postgres redis localstack

# Run database migrations for all services
pnpm db:migrate

# Start all services in watch mode
pnpm dev

# Or start a single service
pnpm --filter @electragram/events-service dev
```

Service ports:

| Service | Port |
|---|---|
| Web app | 3000 |
| Identity | 3001 |
| Contacts | 3002 |
| Events | 3003 |
| Messaging | 3004 |
| Chat | 3007 |
| Integrations | 3008 |
| Design | 3009 |
| Analytics | 3010 |

### Environment Variables

```bash
cp .env.example .env
# Edit .env with your local values
```

Key variables:

```env
# Database
DATABASE_URL=postgres://postgres:postgres@localhost:5432/electragram

# JWT (generate with: openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt)
JWT_PRIVATE_KEY_PEM=...
JWT_PUBLIC_KEY_PEM=...

# AWS (LocalStack for local dev)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
SQS_ENDPOINT=http://localhost:4566
SQS_QUEUE_URL=http://localhost:4566/000000000000/delivery-queue

# SendGrid (email delivery)
SENDGRID_API_KEY=SG.xxx

# Twilio (SMS/WhatsApp delivery)
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_FROM_NUMBER=+15551234567

# Tracking (shared with Messaging service — must match)
TRACKING_HMAC_SECRET=a-long-random-secret-min-32-chars
BASE_URL=https://electragram.io

# Webhooks service (Twilio inbound)
TWILIO_WEBHOOK_TOKEN=your-webhook-registration-token
TWILIO_WEBHOOK_BASE_URL=https://api.electragram.io
CHAT_INBOUND_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/chat-inbound
DELIVERY_STATUS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/delivery-status

# Analytics
ANALYTICS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/analytics-events
```

---

## Testing

### Test pyramid

```
              ┌───────────────────────────┐
              │   E2E (Playwright/Detox)  │  ← /apps/web, /apps/mobile
              ├───────────────────────────┤
              │  Contract (Pact)          │  ← service-to-service API boundaries
              ├───────────────────────────┤
              │  Integration (TC/Postgres)│  ← each TS service
              ├───────────────────────────┤
              │  Unit (Vitest / go test)  │  ← all packages + services
              └───────────────────────────┘
```

### Run all unit tests (no Docker required — fast)

```bash
pnpm test:unit
# Go services
cd services/delivery && go test ./...
cd services/tracking && go test ./...
cd services/webhooks && go test ./...
```

### Run integration tests (requires Docker for Testcontainers)

```bash
pnpm test:integration
```

### Run everything

```bash
pnpm test
```

### E2E tests

```bash
# Web (Playwright)
pnpm --filter @electragram/web test:e2e

# Mobile (Detox — requires simulator)
pnpm --filter @electragram/mobile test:e2e:ios
pnpm --filter @electragram/mobile test:e2e:android
```

### Load tests (requires k6)

```bash
k6 run services/delivery/tests/load/delivery.k6.js
k6 run services/tracking/tests/load/tracking.k6.js
```

### Coverage thresholds

| Layer | Tool | Threshold |
|---|---|---|
| TypeScript services | Vitest + v8 | ≥ 80% (lines/functions/branches) |
| Go services | `go test -cover` | ≥ 80% (worker/handler packages: 100%) |
| React web | Vitest + RTL | ≥ 80% |
| React Native | Jest + RNTL | ≥ 80% |
| CDK infra | Vitest + CDK Assertions | ≥ 80% |

Coverage is enforced in CI — builds fail below threshold.

---

## Technology Stack

| Layer | Technology |
|---|---|
| **API services** | TypeScript 5.7 / Fastify 5 / Drizzle ORM |
| **High-throughput Lambda** | Go 1.26 / AWS Lambda |
| **Web frontend** | Next.js 15 / React 19 / App Router / Tailwind CSS / shadcn/ui |
| **Mobile** | React Native 0.76 / Expo SDK 52 / Expo Router / NativeWind |
| **State management** | Zustand / TanStack Query v5 |
| **Database** | PostgreSQL 16 / per-service schemas / `tsvector` full-text search |
| **Cache** | Redis 7 / ElastiCache |
| **Queue** | AWS SQS FIFO (delivery) + standard (events) |
| **Pub/Sub** | AWS SNS + EventBridge |
| **Auth** | JWT RS256 / `jose` / AWS Lambda Authorizer |
| **Email delivery** | SendGrid v3 Mail Send API |
| **SMS/WhatsApp** | Twilio Messaging API |
| **Storage** | AWS S3 + CloudFront |
| **Infrastructure** | AWS CDK (TypeScript) — VPC, ECS Fargate, Lambda, RDS, ElastiCache |
| **CI/CD** | GitHub Actions → ECR → ECS rolling deploy |
| **Testing** | Vitest, Testcontainers, `go test` + testify, Playwright, Detox, Pact, k6 |
| **Monorepo** | Turborepo + pnpm workspaces |

---

## Inter-Service Communication

### Synchronous (REST)

All authenticated REST calls carry a JWT bearer token. The API Gateway Lambda Authorizer validates the token before forwarding to the target service.

| Consumer | Provider | Key calls |
|---|---|---|
| Events | Identity | Validate account membership |
| Messaging | Events | Look up event guest lists for recipient expansion |
| Delivery | Messaging | Write back recipient delivery status |
| Tracking | Messaging | Write back open/click counters |

### Asynchronous (SQS/SNS/EventBridge)

| Queue / Topic | Producer | Consumer | Purpose |
|---|---|---|---|
| `delivery-queue` (SQS FIFO) | Messaging Service | Delivery Lambda | Per-recipient send jobs |
| `tracking-events` (SNS) | Tracking Lambda | Analytics Service | Open/click events |
| `guest-status-changed` (EventBridge) | Events Service | Messaging Service | RSVP triggers |
| `message-sent` (EventBridge) | Messaging Service | Analytics Service | Message stats |

---

## Deployment

### Staging (automatic on push to `main`)

```bash
git push origin main
# GitHub Actions builds Docker images → pushes to ECR → rolls out ECS services
```

### Production (manual approval)

```bash
git push origin production
# Or trigger via GitHub Actions workflow_dispatch with environment=production
```

### Infrastructure (CDK)

```bash
# Bootstrap (one-time per AWS account/region)
cd infra/cdk && pnpm cdk bootstrap

# Deploy staging
pnpm --filter @electragram/infra-cdk deploy:staging

# Deploy production
pnpm --filter @electragram/infra-cdk deploy:production
```

### CDK Stacks

| Stack | Resources |
|---|---|
| `NetworkStack` | VPC, subnets, security groups, NAT Gateway |
| `DatabaseStack` | RDS PostgreSQL 16, per-service schemas, parameter groups |
| `MessagingStack` | SQS queues, SNS topics, EventBridge rules |
| `ServicesStack` | ECS Fargate cluster, task definitions, IAM roles |
| `ApiGatewayStack` | REST API Gateway, Lambda Authorizer, routes |
| `CloudFrontStack` | CloudFront distribution, S3 origin, WAF ACL |

---

## Contributing

1. Branch from `main`
2. All PRs must pass the CI gate: lint → typecheck → unit tests → integration tests → CDK tests
3. Coverage thresholds are enforced — builds fail below threshold
4. Follow the service patterns:
   - **TypeScript/Fastify ECS:** use Identity or Events as the reference
   - **Go Lambda (SQS trigger):** use Delivery as the reference
   - **Go Lambda (API Gateway trigger):** use Tracking as the reference
5. Commit message format: `feat(service): description` / `fix(service): description`

---

## Documentation

- [Migration Analysis](docs/analysis.md) — current-state inventory, gap analysis, 8 migration risks, 6 ADRs
- [Architecture & Microservices Catalogue](docs/architecture.md) — full system design, all 12 service PRDs, data model, SLOs
