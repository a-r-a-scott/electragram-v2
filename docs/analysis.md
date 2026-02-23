# Electragram Platform — Migration Analysis

**Date:** February 2026  
**Source repo:** `github.com/electragram/platform` (Rails 8 monolith)  
**Target repo:** `github.com/a-r-a-scott/electragram-v2` (AWS microservices)

---

## 1. Current State Inventory

### Application Overview

Electragram is a multi-tenant SaaS platform for event management and multi-channel communication. It serves event organizers, marketing teams, and administrators with tools for:

- **Event management** — create and manage events, guest lists, forms, custom pages
- **Contact management** — unified contact records with deduplication across email/phone
- **Multi-channel messaging** — email, SMS, and WhatsApp campaigns to contacts and event guests
- **Real-time chat** — inbound/outbound conversations via Twilio SMS/WhatsApp
- **Third-party integrations** — HubSpot, Mailchimp, Klaviyo, Customer.io, Salesforce, Google Sheets

### Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Backend framework | Ruby on Rails | 8.0.0 |
| Language | Ruby | 3.3.10 |
| Primary database | PostgreSQL | 16 |
| Cache database | PostgreSQL (Solid Cache) | 16 |
| Background jobs | Sidekiq Pro | 7.0 |
| Job scheduling | Sidekiq Cron | — |
| Session/cache store | Redis | — |
| Frontend (primary) | Stimulus + Turbo | Hotwire |
| Frontend (React) | React | 19.2.3 |
| Frontend (Vue) | Vue | 3.3.4 |
| CSS framework | Tailwind CSS | 3.2.4 |
| TypeScript | TypeScript | 5.6.3 |
| Component dev | Storybook | 8.6.14 |
| JS bundler | esbuild | — |
| API | GraphQL (graphql-ruby) | — |
| File storage | AWS S3 (Active Storage) | — |
| Image generation | AWS Lambda | — |
| Deployment | Render.com | — |

### Deployment Topology (Current)

```
Render.com
├── Web service (Rails — main app + API)     [pro plan, 1-2 instances]
├── Branded service (Rails — event pages)   [standard plan]
├── Sidekiq worker service                  [standard plan]
├── Redis instance                          [standard plan]
├── PostgreSQL primary                      [standard plan]
└── PostgreSQL cache (Solid Cache)          [starter plan]
```

### Domain Model Summary

**80+ database tables across these bounded contexts:**

| Domain | Key Tables | Record Count Estimate |
|---|---|---|
| Identity | users, accounts, account_users, roles, permissions | Low (thousands) |
| Contacts | contacts, contact_email_addresses, contact_phone_numbers, contact_lists | Medium-High (millions) |
| Events | events_events, events_guests, events_event_guests, events_forms | Medium (hundreds of thousands) |
| Messaging | messages, message_recipients, message_releases, message_deliveries | High (tens of millions) |
| Chat | chat_conversations, chat_messages, chat_identities | Medium |
| Integrations | integrations, credentials, provider_refs | Low |
| Design | themes, theme_templates, blocks | Low |
| Analytics | message_analytics_snapshots, activities | High (aggregated) |
| Media | uploads, exports | Medium |

### Third-Party Integrations

| Provider | Purpose | SDK |
|---|---|---|
| SendGrid | Email delivery | sendgrid gem |
| Twilio | SMS, WhatsApp, Voice | twilio-ruby |
| HubSpot | CRM sync | hubspot-api-client |
| Mailchimp | Marketing list sync | MailchimpMarketing |
| Klaviyo | Marketing automation | klaviyo gem |
| Customer.io | Behavioral messaging | customer_io gem |
| Salesforce | CRM sync | (configured) |
| Google OAuth | Sign-in, Contacts sync | google-apis-people_v1 |
| Google Sheets | Spreadsheet sync | google-apis-sheets_v4 |
| Google BigQuery | Analytics export | google-cloud-bigquery |
| AWS S3 | File storage | aws-sdk-s3 |
| AWS Lambda | Image generation | aws-sdk-lambda |
| Slack | Internal notifications | slack-ruby-client |

---

## 2. Identified Domain Boundaries

Analysis of the codebase reveals 12 clearly separable domains suitable for independent microservices:

```
1. Identity       — auth, users, accounts, RBAC
2. Contacts       — contacts, lists, deduplication, custom fields
3. Events         — events, guests, forms, pages, check-in
4. Messaging      — message creation, scheduling, recipients, triggers
5. Delivery       — email/SMS/WhatsApp sending (high-throughput)
6. Tracking       — open pixels, click redirects, unsubscribes
7. Chat           — real-time conversations via Twilio
8. Integrations   — CRM/marketing platform connectors
9. Design         — themes, templates, block editor
10. Analytics     — delivery metrics, activity feed, insights
11. Media         — file uploads, image generation, exports
12. Webhooks      — incoming provider webhooks routing
```

**Separation rationale:**

- **Delivery** and **Tracking** are split from Messaging because they have very different non-functional requirements — Delivery needs 10k+ msg/min throughput, Tracking needs sub-100ms redirect latency. Both are better served by Go + Lambda than TypeScript + ECS.
- **Webhooks** is stateless routing logic that should be isolated from Chat to allow independent scaling and to avoid a compromised Twilio signature key from impacting the broader Chat domain.
- **Design** is read-heavy and content-focused, making it a good candidate for aggressive caching and eventual CDN delivery of rendered templates.

---

## 3. Gap Analysis

### What is being retained
- All PostgreSQL schemas and data structures (zero field renames, zero data loss)
- All existing user-facing URLs and UX flows
- Existing AWS S3 bucket(s) for file storage
- Customer-facing IDs (CFIDs) used in GraphQL
- SendGrid and Twilio integrations (same API keys)
- All third-party integration logic (ported from Ruby ProviderKit)

### What is changing

| Aspect | Current | New |
|---|---|---|
| Runtime | Ruby on Rails monolith | 12 TypeScript/Go microservices |
| Deployment | Render.com | AWS ECS Fargate + Lambda |
| Background jobs | Sidekiq + Redis | AWS SQS + Lambda |
| Session auth | Cookie-based sessions | JWT (access + refresh tokens) |
| Encrypted fields | Rails 8 encryption | AWS KMS |
| Caching | Solid Cache (Postgres) + Redis | ElastiCache Redis |
| Frontend | ERB + Stimulus/Turbo + embedded React/Vue | Next.js 15 (full React) |
| Mobile | None | React Native (Expo SDK 52) |
| Real-time | Action Cable (WebSocket) | API Gateway WebSocket API |
| Full-text search | PostgreSQL tsvector | PostgreSQL tsvector (retained) |
| IaC | render.yaml | AWS CDK (TypeScript) |
| CI/CD | (Render auto-deploy) | GitHub Actions → ECR → ECS |

### New capabilities added
- Native mobile app (iOS + Android) via React Native/Expo
- WebSocket chat via AWS API Gateway (replaces Action Cable)
- Distributed tracing (AWS X-Ray + OpenTelemetry)
- Per-service independent scaling
- Blue/green deployment support
- Contract testing between services (Pact)
- Load testing suite (k6)

---

## 4. Migration Risks and Mitigations

### Risk 1 — Encrypted field migration
**Risk:** Rails 8 encrypts fields like `accounts.name`, `contact_email_addresses.email`, `user_sessions.persistence_token`, and others using ActiveRecord Encryption. The encrypted values cannot be read without the Rails master key.

**Mitigation:**
1. Run a one-time Rails script in the existing platform to decrypt all encrypted columns and write plaintext to a migration export.
2. Re-encrypt using AWS KMS in the new system before writing to the new database.
3. Rotate all keys post-migration.

### Risk 2 — Session continuity
**Risk:** Existing users have Rails session cookies. After cutover, their sessions will be invalid and they will need to log in again.

**Mitigation:**
- Communicate the migration to users in advance.
- Offer a migration-day "re-authenticate with Google" flow to minimise friction.
- The new Identity Service issues JWTs immediately on Google OAuth, so users with Google login have a one-click path back in.

### Risk 3 — Sidekiq queue drain
**Risk:** Sidekiq queues may have in-flight jobs (message deliveries, triggers) at the time of cutover.

**Mitigation:**
- Schedule cutover during a low-traffic window.
- Pause Sidekiq queues 30 minutes before cutover, allow all in-flight jobs to complete.
- Verify queue depth is zero before flipping DNS.

### Risk 4 — Polymorphic associations
**Risk:** Rails polymorphic associations (`receiveable`, `contactable`, `relateable`, `blockable`, `actor`) use `*_type` columns containing Rails class names (e.g. `Contact`, `Events::Guest`). These class names must be mapped to new service-scoped type identifiers.

**Mitigation:**
- Create a migration mapping table (`legacy_type_map`) that maps old Rails class names to new type slugs.
- All polymorphic reads in new services query through this mapping during the transition period.
- Post-migration cleanup script updates all `*_type` columns to new values.

### Risk 5 — tsvector full-text search indexes
**Risk:** PostgreSQL `tsvector` columns and GIN indexes exist on multiple tables (`contacts.search_text`, `accounts.search_text`, etc.). These must be rebuilt in the new database.

**Mitigation:**
- AWS DMS migrates all data including tsvector values.
- Post-migration, trigger `UPDATE table SET search_text = to_tsvector(...)` for all tables.
- Index rebuild can run as a background job; search degrades gracefully while it runs.

### Risk 6 — JSONB schema evolution
**Risk:** Multiple tables use untyped JSONB columns (`details`, `custom_fields`, `guest_responses`, `answers`). Their schemas are implicit in Ruby code.

**Mitigation:**
- Audit all JSONB column usages in the Rails codebase before migration.
- Define explicit Zod schemas in the TypeScript services for each JSONB column.
- Validate all reads through Zod; log and quarantine records that fail validation.

### Risk 7 — Twilio webhook signature validation
**Risk:** Twilio signs webhooks with an account-specific auth token. The new Webhook Service must validate these before routing.

**Mitigation:**
- Webhook Service validates `X-Twilio-Signature` header using the same auth tokens (stored in AWS Secrets Manager).
- Reject unsigned requests with 403 before any processing.

### Risk 8 — Custom domain routing
**Risk:** The existing branded service handles custom customer domains (e.g. `events.customer.com`) via Render's domain configuration. The new system must replicate this.

**Mitigation:**
- AWS CloudFront with SNI supports multiple custom domains.
- CloudFront origin request routing inspects `Host` header and routes to Public Pages service.
- Domain verification flow in the Integrations Service creates CloudFront CNAME entries via AWS SDK.

---

## 5. Architectural Decision Records (ADRs)

### ADR-001: TypeScript for most services, Go for high-throughput
**Decision:** Use TypeScript/Node.js (Fastify) for 9 services, Go for Delivery, Tracking, and Webhook services.

**Rationale:**
- TypeScript maximises code sharing with the React frontend (`@electragram/types` package).
- Go's goroutine model and minimal memory footprint make it ideal for sub-100ms tracking redirects and 10k+ msg/min delivery throughput.
- Both languages have excellent AWS SDK support.

### ADR-002: Retain PostgreSQL, no DynamoDB
**Decision:** Use AWS RDS PostgreSQL for all services. Do not introduce DynamoDB.

**Rationale:**
- The existing schema has complex relationships (polymorphic, many-to-many) that map poorly to DynamoDB's key-value model.
- PostgreSQL full-text search is already proven in the system.
- Operational simplicity: one database technology to monitor, back up, and query.
- Schema partitioning (Postgres schemas per service) provides logical separation without the operational overhead of separate RDS instances initially.

### ADR-003: JWT over AWS Cognito
**Decision:** Implement a custom JWT-based Identity Service rather than using AWS Cognito.

**Rationale:**
- The existing auth model has nuanced requirements: multi-tenant account switching, granular permissions per account-user pair, and magic link tokens.
- Cognito's user pool model does not natively support multiple accounts per user with per-account RBAC.
- A custom Identity Service gives full control over token claims and the multi-tenant model.
- AWS Secrets Manager stores the JWT signing key (RS256).

### ADR-004: Turborepo monorepo
**Decision:** All services, apps, and packages live in a single Turborepo monorepo.

**Rationale:**
- Shared packages (`types`, `api-client`, `test-utils`) are co-versioned with the services that consume them.
- Turborepo's task graph executes builds and tests in parallel with correct dependency ordering.
- Single GitHub repo simplifies PR review, code ownership, and branch management.

### ADR-005: SQS over Kafka for async messaging
**Decision:** Use AWS SQS + SNS for all async messaging. Do not introduce Kafka.

**Rationale:**
- SQS is fully managed, serverless-native, and integrates directly with Lambda as an event source.
- The messaging volume (millions of deliveries per day) is well within SQS's capabilities without Kafka's operational complexity.
- SNS fan-out covers the pub/sub patterns needed (delivery events → analytics).
- EventBridge covers domain event routing (contact created → integration sync).

### ADR-006: pnpm workspaces
**Decision:** Use pnpm as the package manager for the monorepo.

**Rationale:**
- pnpm's strict symlinked `node_modules` prevents phantom dependency issues across packages.
- pnpm workspaces integrate natively with Turborepo.
- Significantly faster installs than npm, smaller disk footprint than yarn Berry.

---

## 6. Data Migration Plan

### Phase 1 — Parallel run (weeks 1–4)
1. Deploy new system alongside existing Rails system
2. New system reads from a replica of the existing RDS database (read-only)
3. Validate data access patterns, API response shapes, and auth flows
4. Run load tests against staging

### Phase 2 — Dual writes (weeks 5–6)
1. New system begins accepting writes; Rails system continues as primary
2. Sync layer propagates writes back to Rails DB (for rollback safety)
3. Validate data consistency between both systems

### Phase 3 — Cutover (week 7)
1. Schedule maintenance window (low traffic period)
2. Pause Sidekiq queues; wait for drain
3. Run final AWS DMS replication task
4. Flip DNS: `app.electragram.com` → new CloudFront distribution
5. Monitor error rates for 24 hours
6. Keep Rails system warm for 48-hour rollback window

### Phase 4 — Decommission (week 8+)
1. Confirm stable operation for 2 weeks
2. Archive Rails codebase
3. Decommission Render.com services
4. Migrate S3 bucket ownership if needed

---

## 7. Technology Stack Comparison

| Concern | Rails monolith | New microservices |
|---|---|---|
| Request routing | Rails Router | API Gateway → service |
| Auth | Cookie sessions | JWT (RS256) |
| DB access | ActiveRecord ORM | Drizzle ORM (TS) / pgx (Go) |
| Background jobs | Sidekiq | SQS + Lambda |
| Scheduled jobs | Sidekiq Cron | EventBridge Scheduler |
| WebSockets | Action Cable | API Gateway WebSocket |
| Email delivery | Rails mailers + SendGrid | Delivery Service (Go) + SendGrid |
| SMS/WhatsApp | Twilio gem | Delivery Service (Go) + Twilio |
| File uploads | Active Storage | S3 presigned URLs (Media Service) |
| Search | PostgreSQL tsvector | PostgreSQL tsvector (unchanged) |
| Encrypted fields | Rails 8 Encryption | AWS KMS |
| Frontend | ERB + Stimulus + embedded React | Next.js 15 (React) |
| Mobile | None | React Native (Expo) |
| Observability | Rails logs | CloudWatch + X-Ray + OpenTelemetry |
| IaC | render.yaml | AWS CDK |
| Tests | RSpec | Vitest + Testcontainers + Playwright |
