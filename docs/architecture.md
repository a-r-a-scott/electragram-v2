# Electragram v2 — Architecture & Microservices Catalogue

**Version:** 1.0  
**Date:** February 2026

---

## System Architecture

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLIENTS                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ Next.js Web  │  │ React Native │  │  Public Event Pages  │ │
│  │    App       │  │  Expo App    │  │   (Next.js static)   │ │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘ │
└─────────┼─────────────────┼───────────────────────┼────────────┘
          │                 │                       │
┌─────────▼─────────────────▼───────────────────────▼────────────┐
│                       EDGE LAYER                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              AWS CloudFront CDN + WAF                    │  │
│  └──────────────────────────┬───────────────────────────────┘  │
│  ┌──────────────────────────▼───────────────────────────────┐  │
│  │        AWS API Gateway (REST + WebSocket)                │  │
│  │  ┌─────────────────────────────────────────────────┐     │  │
│  │  │  Lambda JWT Authorizer (validates RS256 tokens) │     │  │
│  │  └─────────────────────────────────────────────────┘     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
          │
┌─────────▼─────────────────────────────────────────────────────┐
│               MICROSERVICES LAYER                              │
│                                                                │
│  ECS Fargate (TypeScript/Fastify)                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Identity │ │ Contacts │ │  Events  │ │    Messaging     │ │
│  │ :3001    │ │ :3002    │ │  :3003   │ │     :3004        │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │   Chat   │ │ Integrat.│ │  Design  │ │    Analytics     │ │
│  │ :3007    │ │ :3008    │ │  :3009   │ │     :3010        │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘ │
│                                                                │
│  Lambda (Go)                      Lambda (TypeScript)          │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────────────┐  │
│  │ Delivery │ │ Tracking │ │  Webhooks  │    Media         │  │
│  │   (Go)   │ │   (Go)   │ │   (Go)    │   (TypeScript)   │  │
│  └──────────┘ └──────────┘ └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
          │                   │
┌─────────▼───────────────────▼───────────────────────────────┐
│                   ASYNC MESSAGING                            │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────────┐  │
│  │   AWS SQS   │  │   AWS SNS   │  │  AWS EventBridge   │  │
│  │  (queues)   │  │  (pub/sub)  │  │  (domain events)   │  │
│  └─────────────┘  └─────────────┘  └────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────────┐
│                     DATA LAYER                               │
│  ┌──────────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  AWS RDS         │  │ ElastiCache  │  │   AWS S3     │  │
│  │  PostgreSQL 16   │  │  Redis 7     │  │  (storage)   │  │
│  │  (per-service    │  │  (cache +    │  │              │  │
│  │   schemas)       │  │   sessions)  │  │              │  │
│  └──────────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────────┐                                        │
│  │  AWS Secrets     │                                        │
│  │  Manager         │                                        │
│  └──────────────────┘                                        │
└──────────────────────────────────────────────────────────────┘
```

### API Gateway Route Map

| Path Prefix | Target Service | Auth Required |
|---|---|---|
| `/api/auth/*` | Identity Service | No (public) |
| `/api/accounts/*` | Identity Service | Yes |
| `/api/users/*` | Identity Service | Yes |
| `/api/contacts/*` | Contacts Service | Yes |
| `/api/contact-lists/*` | Contacts Service | Yes |
| `/api/events/*` | Events Service | Yes |
| `/api/public/events/*` | Events Service | No (public) |
| `/api/door/*` | Events Service | Greeter token |
| `/api/messages/*` | Messaging Service | Yes |
| `/api/triggers/*` | Messaging Service | Yes |
| `/api/chat/*` | Chat Service | Yes |
| `/api/integrations/*` | Integrations Service | Yes |
| `/api/themes/*` | Design Service | Yes |
| `/api/design/*` | Design Service | Yes |
| `/api/analytics/*` | Analytics Service | Yes |
| `/api/activities/*` | Analytics Service | Yes |
| `/api/media/*` | Media Service | Yes |
| `/hooks/*` | Webhook Service | Provider sig |
| `/track/*` | Tracking Service | No (public) |

---

## Monorepo Structure

```
electragram-v2/
├── apps/
│   ├── web/                        # Next.js 15 dashboard app
│   ├── mobile/                     # React Native (Expo SDK 52)
│   └── public-pages/               # Next.js public event pages
├── services/
│   ├── identity/                   # TypeScript/Fastify
│   ├── contacts/                   # TypeScript/Fastify
│   ├── events/                     # TypeScript/Fastify
│   ├── messaging/                  # TypeScript/Fastify
│   ├── chat/                       # TypeScript/Fastify + WS
│   ├── integrations/               # TypeScript/Fastify
│   ├── design/                     # TypeScript/Fastify
│   ├── analytics/                  # TypeScript/Fastify
│   ├── delivery/                   # Go
│   ├── tracking/                   # Go
│   ├── webhooks/                   # Go
│   └── media/                      # TypeScript/Lambda
├── packages/
│   ├── ui/                         # Shared React web components
│   ├── ui-native/                  # React Native components
│   ├── api-client/                 # Generated OpenAPI client
│   ├── types/                      # Shared TypeScript types
│   ├── test-utils/                 # Shared test utilities
│   └── config/                     # ESLint, TSConfig, Tailwind presets
├── infra/
│   └── cdk/                        # AWS CDK stacks (TypeScript)
├── .github/
│   └── workflows/                  # GitHub Actions CI/CD
├── docs/
│   ├── analysis.md
│   ├── architecture.md
│   └── microservices/              # Per-service PRDs
├── turbo.json
├── package.json
├── pnpm-workspace.yaml
├── docker-compose.yml
└── README.md
```

---

## Microservices Catalogue

---

### Service 1: Identity Service

**Language:** TypeScript / Fastify  
**Deployment:** ECS Fargate  
**Port:** 3001  
**Database schema:** `identity.*`

#### Purpose
Central authentication and multi-tenant account management service. Issues and validates JWT tokens used by all other services. Manages users, accounts, roles, and granular permissions.

#### Owns
```
identity.users
identity.user_sessions
identity.user_authorizations
identity.accounts
identity.account_users
identity.roles
identity.account_user_permissions
```

#### API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signin` | No | Email/password sign-in |
| POST | `/api/auth/signup` | No | Create new user + account |
| POST | `/api/auth/google` | No | Google OAuth callback |
| POST | `/api/auth/magic-link` | No | Request magic link email |
| POST | `/api/auth/magic-link/verify` | No | Verify magic link token |
| POST | `/api/auth/refresh` | Refresh token | Refresh access token |
| DELETE | `/api/auth/signout` | Yes | Invalidate session |
| POST | `/api/auth/password-reset` | No | Request password reset |
| PATCH | `/api/auth/password-reset/:token` | No | Complete password reset |
| GET | `/api/me` | Yes | Current user profile |
| PATCH | `/api/me` | Yes | Update current user |
| GET | `/api/accounts` | Yes | List user's accounts |
| POST | `/api/accounts` | Yes | Create account |
| GET | `/api/accounts/:id` | Yes | Get account |
| PATCH | `/api/accounts/:id` | Yes | Update account |
| GET | `/api/accounts/:id/users` | Yes | List account members |
| POST | `/api/accounts/:id/users` | Yes | Invite user to account |
| DELETE | `/api/accounts/:id/users/:userId` | Yes | Remove user from account |
| GET | `/api/accounts/:id/roles` | Yes | List roles |
| GET | `/api/accounts/:id/permissions` | Yes | Get user permissions |
| PATCH | `/api/accounts/:id/permissions` | Yes | Update permissions |

#### JWT Token Structure
```json
{
  "sub": "usr_xxxx",
  "account_id": "acc_xxxx",
  "role": "admin",
  "permissions": ["contacts:read", "contacts:write", "events:read"],
  "iat": 1234567890,
  "exp": 1234568790
}
```

#### Non-functional Requirements
- Token issuance: < 50ms p99
- Token validation (Lambda authorizer): < 10ms p99
- Access token TTL: 15 minutes
- Refresh token TTL: 90 days
- 99.99% availability SLO (all other services depend on this)

#### Dependencies
- AWS Secrets Manager (JWT signing key — RS256)
- AWS SES (magic link + password reset emails)
- ElastiCache Redis (refresh token store, rate limiting)
- Google OAuth 2.0

---

### Service 2: Contacts Service

**Language:** TypeScript / Fastify  
**Deployment:** ECS Fargate  
**Port:** 3002  
**Database schema:** `contacts.*`

#### Purpose
Manages the unified contact database with deduplication, list segmentation, and custom field definitions. Publishes domain events for integration syncing.

#### Owns
```
contacts.contacts
contacts.contact_email_addresses
contacts.contact_phone_numbers
contacts.contact_lists
contacts.contact_list_members
contacts.contact_fields
contacts.contact_guests
```

#### API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/contacts` | Yes | Search/list contacts |
| POST | `/api/contacts` | Yes | Create contact |
| GET | `/api/contacts/:id` | Yes | Get contact |
| PATCH | `/api/contacts/:id` | Yes | Update contact |
| DELETE | `/api/contacts/:id` | Yes | Archive contact |
| POST | `/api/contacts/bulk-import` | Yes | CSV import via upload |
| POST | `/api/contacts/:id/email-addresses` | Yes | Add email address |
| DELETE | `/api/contacts/:id/email-addresses/:eid` | Yes | Remove email |
| POST | `/api/contacts/:id/phone-numbers` | Yes | Add phone number |
| DELETE | `/api/contacts/:id/phone-numbers/:pid` | Yes | Remove phone |
| GET | `/api/contact-lists` | Yes | List contact lists |
| POST | `/api/contact-lists` | Yes | Create list |
| GET | `/api/contact-lists/:id` | Yes | Get list |
| PATCH | `/api/contact-lists/:id` | Yes | Update list |
| DELETE | `/api/contact-lists/:id` | Yes | Archive list |
| GET | `/api/contact-lists/:id/members` | Yes | List members |
| POST | `/api/contact-lists/:id/members` | Yes | Add members |
| DELETE | `/api/contact-lists/:id/members` | Yes | Remove members |
| GET | `/api/contact-fields` | Yes | List custom fields |
| POST | `/api/contact-fields` | Yes | Create custom field |
| PATCH | `/api/contact-fields/:id` | Yes | Update custom field |
| DELETE | `/api/contact-fields/:id` | Yes | Delete custom field |

#### Deduplication Logic
- `email_hash` = SHA-256(lowercase(email)) — one record per email per account
- `dupe_key` = composite key for fuzzy matching
- On creation: check `contact_email_addresses` for existing email in account
- Merge strategy: newer record's non-null fields win

#### Domain Events (EventBridge)
- `contacts.ContactCreated` — triggers integration sync
- `contacts.ContactUpdated` — triggers integration sync
- `contacts.ContactUnsubscribed` — triggers delivery suppression update
- `contacts.ListMemberAdded` — triggers messaging trigger evaluation

#### Non-functional Requirements
- List query with pagination: < 100ms p99
- Bulk import (10k contacts): < 30 seconds
- Full-text search: < 200ms p99
- 99.9% availability SLO

#### Dependencies
- Identity Service (JWT validation via API Gateway authorizer)
- Analytics Service (activity events)
- EventBridge (domain events)
- SQS (bulk import job queue)

---

### Service 3: Events Service

**Language:** TypeScript / Fastify  
**Deployment:** ECS Fargate  
**Port:** 3003  
**Database schema:** `events.*`

#### Purpose
Full event lifecycle management — from creation through guest RSVP to check-in. Serves both the authenticated dashboard and unauthenticated public event pages.

#### Owns
```
events.events
events.guests
events.event_guests
events.event_guest_profiles
events.lists
events.list_members
events.forms
events.form_fields
events.guest_form_responses
events.pages
events.invitations
events.invitation_templates
events.invitation_layouts
events.key_dates
events.greeters
```

#### Guest Status State Machine
```
PENDING → INVITED → ACCEPTED → CHECKED_IN
         ↘ DECLINED
         ↘ UNSUBSCRIBED
```

#### API Endpoints (selected)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/events` | Yes | List events |
| POST | `/api/events` | Yes | Create event |
| GET | `/api/events/:id` | Yes | Get event |
| PATCH | `/api/events/:id` | Yes | Update event |
| GET | `/api/events/:id/guests` | Yes | List guests |
| POST | `/api/events/:id/guests` | Yes | Add guest |
| PATCH | `/api/events/:id/guests/:gid` | Yes | Update guest |
| PATCH | `/api/events/:id/guests/:gid/attendance` | Yes | Update attendance |
| PATCH | `/api/events/:id/guests/:gid/check-in` | Yes | Check in guest |
| GET | `/api/events/:id/lists` | Yes | List guest lists |
| POST | `/api/events/:id/lists` | Yes | Create list |
| GET | `/api/events/:id/forms` | Yes | List forms |
| POST | `/api/events/:id/forms` | Yes | Create form |
| GET | `/api/public/events/:slug` | No | Get public event page |
| POST | `/api/public/events/:slug/submit` | No | Submit form response |
| GET | `/api/door/:greeterToken/guests` | Greeter | Check-in list |

#### Non-functional Requirements
- Guest list query: < 100ms p99
- Public event page load: < 50ms p99 (heavily cached in CloudFront)
- Check-in throughput: 500 simultaneous check-ins/minute
- 99.9% availability SLO

---

### Service 4: Messaging Service

**Language:** TypeScript / Fastify  
**Deployment:** ECS Fargate  
**Port:** 3004  
**Database schema:** `messaging.*`

#### Purpose
Message creation, design, scheduling, and dispatch. Manages recipient population, release scheduling, and automated trigger evaluation. Delegates actual sending to the Delivery Service via SQS.

#### Owns
```
messaging.messages
messaging.message_recipients
messaging.message_releases
messaging.triggers
messaging.trigger_executions
messaging.sender_profiles
messaging.labels
```

#### Key Flows

**Send flow:**
1. User creates `message` (draft)
2. User adds recipients (`message_recipients`)
3. User schedules release → creates `message_release`
4. At release time: populate recipients → enqueue to `delivery-{channel}` SQS queue
5. Delivery Service processes queue, updates `message_deliveries`

**Trigger flow:**
1. Trigger evaluates event (guest status change, time-based)
2. Creates `trigger_execution`
3. Enqueues personalised message to SQS

#### Non-functional Requirements
- Message creation: < 100ms p99
- Recipient population (10k recipients): < 10 seconds
- Trigger evaluation latency: < 5 seconds from event to queue dispatch
- 99.9% availability SLO

---

### Service 5: Delivery Service

**Language:** Go  
**Deployment:** AWS Lambda (SQS trigger)  
**Database schema:** `delivery.*`

#### Purpose
High-throughput email, SMS, and WhatsApp delivery. Consumes SQS queues per channel, integrates with SendGrid and Twilio, generates tracked links, and records delivery outcomes.

#### Owns
```
delivery.message_deliveries
delivery.message_links
```

#### SQS Queues Consumed

| Queue | Channel | Concurrency |
|---|---|---|
| `delivery-email` | Email (SendGrid) | 100 concurrent Lambda |
| `delivery-sms` | SMS (Twilio) | 50 concurrent Lambda |
| `delivery-whatsapp` | WhatsApp (Twilio) | 50 concurrent Lambda |

#### Processing per message
1. Fetch recipient personalisation data from Contacts/Events Service
2. Render message content (call Design Service for template render)
3. Replace links with tracked URLs (`/track/go/:linkId/:token`)
4. Inject open pixel (`/track/open/:token.png`)
5. Send via SendGrid/Twilio
6. Write `message_delivery` record with status + provider message ID
7. Publish `DeliveryCompleted` event to SNS → Analytics Service

#### Non-functional Requirements
- Throughput: 10,000+ messages/minute across all channels
- Email latency: < 5 seconds from queue receipt to SendGrid API call
- SMS/WhatsApp latency: < 3 seconds from queue receipt to Twilio API call
- DLQ retry: 3 attempts with exponential backoff, then DLQ
- 99.5% delivery attempt success rate (network errors retried; provider rejects counted)

---

### Service 6: Tracking Service

**Language:** Go  
**Deployment:** AWS Lambda (API Gateway trigger)  
**Database schema:** Reads/writes `delivery.message_deliveries`

#### Purpose
Ultra-low-latency open tracking, click redirect, and unsubscribe handling. Must respond before browser/email client times out.

#### Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/track/open/:token.png` | Return 1×1 GIF, async record open |
| GET | `/track/go/:linkId/:token` | 302 redirect, async record click |
| GET | `/track/unsubscribe/:token` | Unsubscribe page, update delivery record |
| POST | `/track/unsubscribe/:token` | Confirm unsubscribe |

#### Implementation notes
- Open pixel: respond with 1×1 transparent GIF in < 10ms; write to DB asynchronously (goroutine)
- Click redirect: respond with 302 in < 20ms; write to DB asynchronously
- Token validation: HMAC-SHA256, verify before any DB access
- Graceful degradation: if token is invalid, still redirect to base domain (don't error)

#### Non-functional Requirements
- Open pixel: p99 < 50ms end-to-end
- Click redirect: p99 < 100ms end-to-end
- Throughput: 5,000 concurrent requests without degradation
- 99.99% availability (email open tracking is latency-sensitive)

---

### Service 7: Chat Service

**Language:** TypeScript / Fastify  
**Deployment:** ECS Fargate  
**Port:** 3007  
**Database schema:** `chat.*`

#### Purpose
Real-time two-way conversation management via Twilio SMS and WhatsApp. Handles inbound messages from the Webhook Service, manages conversation state, and delivers real-time updates to dashboard users via WebSocket.

#### Owns
```
chat.chats
chat.chat_sources
chat.chat_conversations
chat.chat_threads
chat.chat_messages
chat.chat_identities
chat.chat_identity_contactables
```

#### WebSocket API
- Connect: `wss://api.electragram.com/chat/ws?token=<jwt>`
- Subscribe to account conversations: `{ "action": "subscribe", "accountId": "acc_xxx" }`
- Receive new message: `{ "type": "message", "conversationId": "...", "message": {...} }`
- Send message: `POST /api/chat/conversations/:id/messages`

#### Non-functional Requirements
- New message delivery to dashboard: < 500ms p99
- Concurrent WebSocket connections: 1,000+ per ECS instance
- 99.9% availability SLO

---

### Service 8: Integrations Service

**Language:** TypeScript / Fastify  
**Deployment:** ECS Fargate  
**Port:** 3008  
**Database schema:** `integrations.*`

#### Purpose
Manages all third-party CRM and marketing platform integrations. Handles OAuth flows, credential storage, and bi-directional contact/list syncing via the ProviderKit abstraction.

#### Owns
```
integrations.integrations
integrations.account_integrations
integrations.credentials
integrations.provider_refs
integrations.spreadsheets
```

#### Supported Providers
- HubSpot (contacts, companies, lists)
- Mailchimp (contacts, audiences)
- Klaviyo (profiles, lists)
- Customer.io (people, segments)
- Salesforce (contacts, leads)
- Google Sheets (bidirectional sync)
- Google OAuth (contact import)

#### Non-functional Requirements
- OAuth callback: < 2 seconds
- Sync job (1k contacts): < 60 seconds
- 99.5% availability SLO

---

### Service 9: Design Service

**Language:** TypeScript / Fastify  
**Deployment:** ECS Fargate  
**Port:** 3009  
**Database schema:** `design.*`

#### Purpose
Theme, template, and block management. Renders HTML email templates for the Delivery Service. Provides the block-based content editor API.

#### Owns
```
design.themes
design.theme_templates
design.theme_layers
design.color_palettes
design.font_stacks
design.fonts
design.graphics
design.blocks
```

#### Non-functional Requirements
- Template render (for email): < 200ms p99
- Theme CRUD: < 50ms p99
- 99.5% availability SLO

---

### Service 10: Analytics Service

**Language:** TypeScript / Fastify  
**Deployment:** ECS Fargate  
**Port:** 3010  
**Database schema:** `analytics.*`

#### Purpose
Consumes delivery outcome events from SNS, aggregates metrics into snapshots, and serves dashboard insights and activity feeds.

#### Owns
```
analytics.message_analytics_snapshots
analytics.activities
```

#### SNS Topics Consumed
- `delivery.DeliveryCompleted` → update snapshot + activity
- `delivery.EmailOpened` → update snapshot
- `delivery.LinkClicked` → update snapshot
- `delivery.Bounced` → update snapshot
- `delivery.Unsubscribed` → update snapshot + suppress contact

#### Non-functional Requirements
- Event processing lag: < 10 seconds from delivery event to snapshot update
- Insights query: < 500ms p99
- 99.5% availability SLO

---

### Service 11: Media Service

**Language:** TypeScript / Lambda  
**Deployment:** AWS Lambda  
**Database schema:** `media.*`

#### Purpose
Handles file uploads (presigned S3 URLs), CSV import processing, export generation, and image generation via Lambda.

#### Owns
```
media.uploads
media.exports
```

#### Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/media/uploads/presign` | Generate S3 presigned upload URL |
| POST | `/api/media/uploads/:id/process` | Trigger background processing |
| GET | `/api/media/uploads/:id` | Get upload status |
| POST | `/api/media/exports` | Create export job |
| GET | `/api/media/exports/:id` | Get export status + download URL |

#### Non-functional Requirements
- Presigned URL generation: < 50ms p99
- CSV import processing (10k rows): < 30 seconds
- Export generation (10k records): < 60 seconds

---

### Service 12: Webhook Service

**Language:** Go  
**Deployment:** AWS Lambda (API Gateway trigger)  
**Database schema:** Stateless

#### Purpose
Validates and routes incoming webhooks from Twilio (SMS, WhatsApp, status callbacks) to the appropriate internal service via SQS. Isolated to prevent provider credential compromise from impacting other services.

#### Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/hooks/twilio/:token` | Twilio SMS/Voice inbound |
| POST | `/hooks/twilio/whatsapp-senders/:token` | Twilio WhatsApp inbound |

#### Processing
1. Validate `X-Twilio-Signature` header (HMAC-SHA1)
2. Lookup account from `:token` → query Identity Service
3. Route to appropriate SQS queue:
   - Inbound SMS/WhatsApp → `chat-inbound` queue (Chat Service)
   - Delivery status callbacks → `delivery-status` queue (Delivery Service)
4. Return `200 OK` to Twilio within 15 seconds (Twilio timeout requirement)

#### Non-functional Requirements
- Response time: < 500ms p99 (Twilio will retry if > 15s)
- 99.99% availability (missed webhooks = missed messages)

---

## Inter-Service Communication

### Synchronous (REST via internal VPC)

Services call each other directly within the VPC using internal DNS names (`identity.internal:3001`). Not routed through API Gateway (avoids double-auth and latency).

| Caller | Callee | Purpose |
|---|---|---|
| Delivery | Contacts | Fetch personalisation data |
| Delivery | Design | Render email template HTML |
| Messaging | Contacts | Resolve recipient lists |
| Messaging | Events | Resolve event guest lists |
| Webhook | Identity | Validate webhook token |
| Chat | Contacts | Link identity to contact |

### Asynchronous (SQS / SNS / EventBridge)

| Publisher | Channel | Subscriber | Event |
|---|---|---|---|
| Messaging | SQS `delivery-email` | Delivery | Dispatch email |
| Messaging | SQS `delivery-sms` | Delivery | Dispatch SMS |
| Messaging | SQS `delivery-whatsapp` | Delivery | Dispatch WhatsApp |
| Delivery | SNS `delivery-events` | Analytics | Delivery outcomes |
| Webhook | SQS `chat-inbound` | Chat | Inbound Twilio message |
| Webhook | SQS `delivery-status` | Delivery | Status callback |
| Contacts | EventBridge | Integrations | ContactCreated/Updated |
| Events | EventBridge | Messaging | GuestStatusChanged |
| Media | SQS `media-processing` | Media | Upload processing jobs |

---

## Infrastructure Design

### VPC Layout
```
VPC (10.0.0.0/16)
├── Public subnets (3 AZs)  — API Gateway VPC Link, NAT Gateways
├── Private subnets (3 AZs) — ECS Fargate tasks
└── Isolated subnets (3 AZs) — RDS, ElastiCache (no internet route)
```

### ECS Fargate — Per Service
- Task definition: 0.5 vCPU / 1 GB RAM (baseline), auto-scales to 4 vCPU / 8 GB
- Health check: `GET /health` → 200
- Rolling deployment: 100% minimum healthy, 200% maximum
- Service Connect for internal service mesh DNS

### RDS PostgreSQL
- Instance: `db.r6g.xlarge` (4 vCPU, 32 GB RAM)
- Multi-AZ enabled
- Read replica for analytics queries
- Automated backups: 7-day retention
- Encryption at rest: AWS KMS

### ElastiCache Redis
- Cluster mode: 3 shards × 2 replicas
- Instance: `cache.r6g.large`
- Used for: JWT refresh tokens, rate limiting, session cache, SQS deduplication

### Lambda
- Delivery: 512 MB, 30s timeout, reserved concurrency 200
- Tracking: 128 MB, 3s timeout, provisioned concurrency 10 (warm start)
- Webhooks: 256 MB, 10s timeout
- Media: 1 GB, 300s timeout

### CloudFront
- Origins: API Gateway (API), S3 (assets), Public Pages (SSG)
- Cache policy: API = no-cache; static = 1 year; event pages = 5 minutes
- Custom domain SSL: ACM certificates
- WAF rules: rate limiting, SQL injection, XSS protection

---

## Observability

### Logging
- All services: structured JSON logs to CloudWatch Logs
- Log groups: `/electragram/{service}/{environment}`
- Retention: 30 days (production), 7 days (staging)

### Metrics
- ECS: CPU, memory, request count, error rate → CloudWatch
- Lambda: invocations, duration, errors, concurrency → CloudWatch
- Custom metrics: `DeliveryThroughput`, `TrackingLatency`, `AuthLatency`
- CloudWatch dashboards per service + global overview

### Distributed Tracing
- OpenTelemetry SDK in all TypeScript services
- Go services: OTEL Go SDK
- Traces exported to AWS X-Ray
- Trace propagation via `traceparent` header (W3C standard)
- Service map auto-generated in X-Ray console

### Alerting
- CloudWatch Alarms → SNS → PagerDuty (or email)
- Critical alerts: error rate > 1%, p99 > SLO threshold, SQS DLQ depth > 0
- Warning alerts: CPU > 80%, memory > 80%, RDS connections > 80%
