# Electragram v2 — Architecture & Microservices Catalogue

**Version:** 1.2  
**Date:** February 2026

---

## Implementation Status

| Service | Status | Tests | Key Notes |
|---|---|---|---|
| **Identity** | ✅ Complete | 83+ passing | JWT RS256, Google OAuth, RBAC, refresh tokens |
| **Contacts** | ✅ Complete | 80+ passing | Deduplication, lists, custom fields, full-text search |
| **Events** | ✅ Complete | 83 passing | Guest state machine, forms, pages, bulk add, check-in |
| **Messaging** | ✅ Complete | 82 passing | Templates, scheduling, SQS dispatch, unsubscribes |
| **Delivery** | ✅ Complete | 30 passing | SendGrid + Twilio, partial batch failure, Go/Lambda |
| **Tracking** | ✅ Complete | 57 passing (handler 98%) | Open pixel, click redirect, HMAC-signed tokens, unsubscribe confirm |
| **Chat** | 🔧 Scaffold | — | WebSocket, Twilio inbound |
| **Integrations** | 🔧 Scaffold | — | HubSpot, Mailchimp, Salesforce |
| **Design** | ✅ Complete | 61 passing | Themes, templates, layers, palettes, fonts, graphics, blocks, `RendererService` (CSS vars + interpolation) |
| **Analytics** | 🔧 Scaffold | — | Delivery metrics, activity feed |
| **Webhooks** | ✅ Complete | 47 passing (handler 95.9%) | Twilio HMAC-SHA1 sig validation, SQS routing (no external SDK) |
| **Media** | 🔧 Scaffold | — | S3 presign, CSV import, exports |

**Reference patterns:**
- TypeScript/Fastify ECS service → Identity (auth + RBAC), Events (CRUD + state machine), Messaging (async SQS dispatch)
- Go Lambda — SQS trigger → Delivery (batch processor, partial batch failure, concurrent goroutines)
- Go Lambda — API Gateway trigger → Tracking (sub-100ms HTTP, HMAC tokens, fire-and-forget DB writes) or Webhooks (Twilio sig validation, stdlib Sig V4 SQS)

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

| Path Prefix | Target Service | Auth Required | Notes |
|---|---|---|---|
| `/api/auth/*` | Identity Service | No | Sign-in, sign-up, OAuth, magic link, password reset |
| `/api/accounts/*` | Identity Service | Yes | Account management |
| `/api/users/*` | Identity Service | Yes | User profile |
| `/api/me` | Identity Service | Yes | Current user |
| `/api/contacts/*` | Contacts Service | Yes | Contacts CRUD + search |
| `/api/contact-lists/*` | Contacts Service | Yes | Lists + members |
| `/api/contact-fields/*` | Contacts Service | Yes | Custom fields |
| `/api/events/*` | Events Service | Yes | Events, guests, forms, pages, lists |
| `/api/public/pages/:slug` | Events Service | No | Public event pages |
| `/api/door/*` | Events Service | Greeter token | Check-in app |
| `/api/messages/*` | Messaging Service | Yes | Message lifecycle |
| `/api/templates/*` | Messaging Service | Yes | Reusable templates |
| `/api/unsubscribes/*` | Messaging Service | Yes | Unsubscribe management |
| `/public/unsubscribe` | Messaging Service | No | One-click unsubscribe |
| `/api/chat/*` | Chat Service | Yes | Conversations + messages |
| `/api/integrations/*` | Integrations Service | Yes | CRM connections + sync |
| `/api/themes/*` | Design Service | Yes | Theme management |
| `/api/design/*` | Design Service | Yes | Blocks + templates |
| `/api/analytics/*` | Analytics Service | Yes | Message metrics |
| `/api/activities/*` | Analytics Service | Yes | Activity feed |
| `/api/media/*` | Media Service | Yes | Uploads + exports |
| `/hooks/twilio/*` | Webhook Service | Provider sig | Twilio signature validation |
| `/track/open/*` | Tracking Service | No | Open pixel (1×1 GIF) |
| `/track/go/*` | Tracking Service | No | Click redirect |
| `/track/unsubscribe/*` | Tracking Service | No | Unsubscribe page + confirm |

---

## Monorepo Structure

```
electragram-v2/
├── apps/
│   ├── web/                        # Next.js 15 App Router dashboard
│   └── mobile/                     # React Native (Expo SDK 52)
├── services/
│   ├── identity/                   # TypeScript/Fastify — ECS Fargate  ✅
│   ├── contacts/                   # TypeScript/Fastify — ECS Fargate  ✅
│   ├── events/                     # TypeScript/Fastify — ECS Fargate  ✅
│   ├── messaging/                  # TypeScript/Fastify — ECS Fargate  ✅
│   ├── delivery/                   # Go — Lambda (SQS trigger)         ✅
│   ├── tracking/                   # Go — Lambda (API Gateway trigger) ✅
│   ├── chat/                       # TypeScript/Fastify — ECS Fargate  🔧
│   ├── integrations/               # TypeScript/Fastify — ECS Fargate  🔧
│   ├── design/                     # TypeScript/Fastify — ECS Fargate  ✅
│   ├── analytics/                  # TypeScript/Fastify — ECS Fargate  🔧
│   ├── webhooks/                   # Go — Lambda (API Gateway trigger) ✅
│   └── media/                      # TypeScript — Lambda               🔧
├── packages/
│   ├── types/                      # Shared TypeScript types + Zod schemas
│   ├── test-utils/                 # Shared test factories, DB helpers
│   └── config/                     # ESLint, TSConfig, Vitest presets
├── infra/
│   └── cdk/                        # AWS CDK stacks (TypeScript)
├── .github/
│   └── workflows/                  # GitHub Actions CI/CD pipelines
├── docs/
│   ├── analysis.md                 # Rails → microservices migration analysis
│   └── architecture.md             # This file
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
**Status:** ✅ Complete — 83+ tests passing

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
**Status:** ✅ Complete — 80+ tests passing

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
**Status:** ✅ Complete — 83 unit + integration tests passing

#### Purpose
Full event lifecycle management — from creation through guest RSVP to check-in. Serves both the authenticated dashboard and unauthenticated public event pages.

#### Owns
```
events.events
events.guests                   (account-level guest registry)
events.event_guests             (event↔guest join + status)
events.event_guest_profiles     (per-event profile data)
events.event_lists
events.event_list_members
events.event_forms
events.event_form_fields
events.guest_form_responses
events.event_pages              (public event pages, slug-addressed)
events.event_key_dates
events.event_greeters
```

#### Guest Status State Machine
```
PENDING → INVITED → ACCEPTED → CHECKED_IN
         ↘ DECLINED
         ↘ WAITLISTED
         ↘ UNSUBSCRIBED
```

#### Key Design Decisions
- `guests` is an account-level registry; `event_guests` is the per-event relationship
- Guests are deduplicated by `email_hash` (SHA-256 of lowercased email) within an account
- Full-text search via PostgreSQL `tsvector` column, updated on write
- `event_pages` use auto-generated slugs with conflict detection (`slug`, `slug-2`, `slug-3`, …)
- Bulk-add guests to an event atomically via a single transaction
- `event_greeters` receive short-lived tokens used only for the check-in (`/door`) endpoints

#### API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/events` | Yes | List / search events |
| POST | `/api/events` | Yes | Create event |
| GET | `/api/events/:id` | Yes | Get event |
| PATCH | `/api/events/:id` | Yes | Update event |
| DELETE | `/api/events/:id` | Yes | Archive event |
| GET | `/api/events/:id/guests` | Yes | List guests with filters |
| POST | `/api/events/:id/guests` | Yes | Add guest to event |
| POST | `/api/events/:id/guests/bulk` | Yes | Bulk-add guests |
| GET | `/api/events/:id/guests/:gid` | Yes | Get guest |
| PATCH | `/api/events/:id/guests/:gid` | Yes | Update guest profile |
| PATCH | `/api/events/:id/guests/:gid/status` | Yes | Update RSVP status |
| POST | `/api/events/:id/guests/:gid/check-in` | Yes | Check in guest |
| GET | `/api/events/:id/lists` | Yes | List guest lists |
| POST | `/api/events/:id/lists` | Yes | Create list |
| PATCH | `/api/events/:id/lists/:lid` | Yes | Update list |
| DELETE | `/api/events/:id/lists/:lid` | Yes | Delete list |
| POST | `/api/events/:id/lists/:lid/members` | Yes | Add members to list |
| DELETE | `/api/events/:id/lists/:lid/members` | Yes | Remove members from list |
| GET | `/api/events/:id/forms` | Yes | List forms |
| POST | `/api/events/:id/forms` | Yes | Create form |
| GET | `/api/events/:id/forms/:fid` | Yes | Get form + fields |
| PATCH | `/api/events/:id/forms/:fid` | Yes | Update form |
| DELETE | `/api/events/:id/forms/:fid` | Yes | Delete form |
| PUT | `/api/events/:id/forms/:fid/fields` | Yes | Replace all fields |
| POST | `/api/events/:id/forms/:fid/responses` | Yes | Submit form response |
| GET | `/api/events/:id/pages` | Yes | List pages |
| POST | `/api/events/:id/pages` | Yes | Create page |
| PATCH | `/api/events/:id/pages/:pid` | Yes | Update page |
| POST | `/api/events/:id/pages/:pid/publish` | Yes | Publish page |
| DELETE | `/api/events/:id/pages/:pid` | Yes | Archive page |
| GET | `/api/public/pages/:slug` | No | Public event page |

#### Domain Events (EventBridge)
- `events.GuestStatusChanged` — consumed by Messaging Service for trigger evaluation
- `events.EventCreated` — consumed by Analytics Service
- `events.GuestCheckedIn` — consumed by Analytics Service

#### Non-functional Requirements
- Guest list query: < 100ms p99
- Public event page load: < 50ms p99 (CloudFront cached)
- Check-in throughput: 500 simultaneous check-ins/minute
- 99.9% availability SLO

---

### Service 4: Messaging Service

**Language:** TypeScript / Fastify  
**Deployment:** ECS Fargate  
**Port:** 3004  
**Database schema:** `messaging.*`  
**Status:** ✅ Complete — 82 unit + integration tests passing

#### Purpose
Message creation, design, scheduling, and dispatch. Manages recipient population, release scheduling, and automated trigger evaluation. Delegates actual sending to the Delivery Service via SQS.

#### Owns
```
messaging.message_templates       (reusable templates with {{variable}} interpolation)
messaging.messages                (individual messages per account — draft → scheduled → sent)
messaging.message_recipients      (per-recipient records with delivery status written back by Delivery)
messaging.message_recipient_lists (recipient list snapshots for bulk sends)
messaging.unsubscribes            (global and message-scoped opt-outs)
messaging.dispatch_jobs           (per-dispatch audit records, SQS message ID references)
```

#### Key Design Decisions
- Templates use `{{variable}}` syntax; keys are extracted automatically on save
- A message cannot be edited once it is `dispatching`, `sent`, or `cancelled`
- Recipients are filtered against `unsubscribes` at dispatch time — unsubscribed contacts are silently skipped and not written to SQS
- SQS dispatch uses FIFO queues with `message_id` as the message group; `dispatch_job_id` + `recipient_id` as deduplication key
- `MockSqsDispatcher` satisfies the same `SqsDispatcher` interface, used in unit/integration tests

#### Key Flows

**Send flow:**
1. User creates `message` from template or scratch (status: `draft`)
2. User adds recipients — by contact list, event guest list, or individual email
3. User schedules release (`status → scheduled`)
4. At release time: filter unsubscribes → for each recipient write `message_recipient` record → enqueue `DeliveryPayload` to `delivery-queue` SQS
5. Delivery Lambda processes queue, writes back status to `message_recipients` via DB update

**Template interpolation:**
1. Template stored with `{{first_name}}`, `{{event_name}}`, etc.
2. On dispatch, variables resolved from recipient personalisation data
3. Interpolated body sent in `DeliveryPayload.body`

#### API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/templates` | Yes | List templates |
| POST | `/api/templates` | Yes | Create template |
| GET | `/api/templates/:id` | Yes | Get template |
| PATCH | `/api/templates/:id` | Yes | Update template |
| POST | `/api/templates/:id/publish` | Yes | Publish template |
| DELETE | `/api/templates/:id` | Yes | Archive template |
| GET | `/api/messages` | Yes | List messages |
| POST | `/api/messages` | Yes | Create message |
| GET | `/api/messages/:id` | Yes | Get message |
| PATCH | `/api/messages/:id` | Yes | Update message (draft/scheduled only) |
| POST | `/api/messages/:id/schedule` | Yes | Schedule message |
| POST | `/api/messages/:id/dispatch` | Yes | Immediate dispatch |
| POST | `/api/messages/:id/cancel` | Yes | Cancel scheduled message |
| GET | `/api/messages/:id/recipients` | Yes | List recipients + delivery status |
| PUT | `/api/messages/:id/recipients` | Yes | Replace recipient list |
| GET | `/api/unsubscribes` | Yes | List unsubscribes |
| POST | `/api/unsubscribes` | Yes | Add unsubscribe record |
| DELETE | `/api/unsubscribes/:id` | Yes | Remove unsubscribe |
| POST | `/public/unsubscribe` | No | One-click unsubscribe (from email link) |

#### Non-functional Requirements
- Message creation: < 100ms p99
- Recipient population (10k recipients): < 10 seconds
- Trigger evaluation latency: < 5 seconds from event to queue dispatch
- 99.9% availability SLO

---

### Service 5: Delivery Service

**Language:** Go 1.26  
**Deployment:** AWS Lambda (SQS trigger, batch size 10)  
**Database schema:** Writes to `messaging.*` (owned by Messaging Service)  
**Status:** ✅ Complete — 30 Go tests passing; worker package 100% statement coverage

#### Purpose
High-throughput email, SMS, and WhatsApp delivery. Consumes the `delivery-queue` SQS FIFO queue, dispatches via SendGrid and Twilio, and writes delivery outcomes back to the Messaging Service database.

#### Internal Package Structure
```
services/delivery/
├── main.go                          # Lambda entry, wires all components
├── internal/
│   ├── domain/
│   │   └── payload.go               # DeliveryPayload, DeliveryResult, BatchResult
│   ├── provider/
│   │   ├── provider.go              # Provider interface + Registry
│   │   ├── sendgrid.go              # SendGridProvider (email)
│   │   ├── twilio.go                # TwilioSMSProvider + TwilioWhatsAppProvider
│   │   └── mock.go                  # MockProvider for tests
│   ├── db/
│   │   └── client.go                # PostgreSQL writes (recipients, dispatch_jobs, counters)
│   └── worker/
│       └── worker.go                # SQS batch processor (goroutines, partial failure)
```

#### DeliveryPayload (SQS message body — JSON)
```json
{
  "recipient_id":  "rcp_xxx",
  "message_id":    "msg_xxx",
  "kind":          "email | sms | whatsapp",
  "to":            "user@example.com | +15551234567",
  "from":          "sender@example.com | +15550000001",
  "reply_to":      "reply@example.com",
  "subject":       "Your invitation",
  "body":          "Hi Alice, ...",
  "html_body":     "<p>Hi Alice, ...</p>"
}
```

#### Processing per SQS record
1. Unmarshal `DeliveryPayload` from SQS record body
2. Select provider via `Registry.Get(payload.Kind)`
3. Call `provider.Send(ctx, payload)`
4. On success: `UPDATE messaging.message_recipients SET status='delivered'`
5. On failure: `UPDATE messaging.message_recipients SET status='failed', error=...`; mark as `BatchItemFailure` so Lambda retries only that record
6. Atomically increment `delivered_count` / `failed_count` on `messaging.messages`
7. Update `messaging.dispatch_jobs` final status when batch completes

#### Partial Batch Failure Handling
Provider-level failures are returned as `SQSEventResponse.BatchItemFailures` — only the failed record is retried, not the whole batch. Database update failures are "best-effort" (logged, not retried) to prevent infinite SQS loops on non-transient DB issues.

#### Provider Interfaces
```go
// Provider is implemented by SendGrid, TwilioSMS, TwilioWhatsApp, and Mock
type Provider interface {
    Send(ctx context.Context, p domain.DeliveryPayload) error
}

// SendGridClient and TwilioSMSClient are interfaces wrapping the real SDKs,
// allowing test doubles to be injected without real API calls
```

#### Environment Variables
| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL DSN |
| `SENDGRID_API_KEY` | SendGrid v3 API key |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_FROM_NUMBER` | Default SMS sender number |
| `TWILIO_WHATSAPP_FROM` | WhatsApp sender (format: `whatsapp:+15551234567`) |
| `FROM_EMAIL` | Default email sender address |
| `FROM_NAME` | Default email sender display name |

#### Non-functional Requirements
- Throughput: 10,000+ messages/minute (Lambda concurrency × batch size)
- Email latency: < 5 seconds from SQS receipt to SendGrid API call
- SMS/WhatsApp latency: < 3 seconds from SQS receipt to Twilio API call
- SQS DLQ: after 3 Lambda retries, message moves to DLQ for manual inspection
- 99.5% delivery attempt success rate

---

### Service 6: Tracking Service

**Language:** Go 1.26  
**Deployment:** AWS Lambda (API Gateway trigger)  
**Database schema:** Writes to `messaging.*` (owned by Messaging Service)  
**Status:** ✅ Complete — 57 Go tests passing; handler package 98% coverage

#### Purpose
Ultra-low-latency open tracking, click redirect, and unsubscribe handling for emails sent by the Messaging + Delivery pipeline.

#### Internal Package Structure
```
services/tracking/
├── main.go                            # Lambda entry, wires DB + handler
├── internal/
│   ├── domain/
│   │   └── token.go                   # TrackingToken struct + Kind constants
│   ├── token/
│   │   └── hmac.go                    # Sign / Verify HMAC-SHA256 tokens
│   ├── db/
│   │   └── client.go                  # RecordOpen, RecordClick, RecordUnsubscribe
│   └── handler/
│       └── handler.go                 # Lambda handler; routes all /track/* paths
```

#### Token Format
Tokens are stateless and self-contained — no database lookup needed to serve the pixel or redirect:
```
<base64url(json_payload)>.<base64url(hmac_sha256(payload, TRACKING_HMAC_SECRET))>
```
JSON payload:
```json
{
  "r": "rcp_xxx",                 // recipient ID
  "m": "msg_xxx",                 // message ID
  "k": "o | c | u",              // kind: open | click | unsubscribe
  "u": "https://dest.example"    // destination URL (click tokens only)
}
```

#### Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/track/open/{token}.gif` | Return 1×1 transparent GIF; async record open |
| GET | `/track/go/{token}` | 302 redirect to token URL; async record click |
| GET | `/track/unsubscribe/{token}` | Render HTML confirmation form |
| POST | `/track/unsubscribe/{token}` | Confirm unsubscribe; write DB synchronously |

#### Key Design Decisions
- **Fire-and-forget DB writes** for open/click: Lambda returns the response immediately; a background goroutine writes the DB. Keeps p99 well under 50ms even if RDS is slow.
- **Synchronous DB write** for unsubscribes: user is waiting for the confirmation page; latency tolerance is higher.
- **Graceful degradation**: invalid/expired tokens on open → still return the pixel; on click → redirect to `BASE_URL`. Never reveal token errors to email clients.
- **Idempotent unsubscribe**: guarded by `WHERE status != 'unsubscribed'` so duplicate clicks are safe.
- **`.gif` suffix handling**: the open pixel URL ends in `.gif` (some email clients require a file extension on image URLs). The handler strips it before token verification.
- **Migration on cold start**: adds `open_count`, `click_count`, `opened_at`, `clicked_at` columns to `messaging.message_recipients` via `ALTER TABLE … ADD COLUMN IF NOT EXISTS`.

#### DB Writes

| Event | Table | Operation |
|---|---|---|
| Open | `messaging.message_recipients` | `opened_at = COALESCE(opened_at, NOW()), open_count += 1` |
| Open | `messaging.messages` | `open_count += 1` |
| Click | `messaging.message_recipients` | `clicked_at = COALESCE(clicked_at, NOW()), click_count += 1` |
| Click | `messaging.messages` | `click_count += 1` |
| Unsubscribe | `messaging.message_recipients` | `status = 'unsubscribed'` (once) |
| Unsubscribe | `messaging.unsubscribes` | `INSERT` with account_id, email, message_id |
| Unsubscribe | `messaging.messages` | `unsubscribe_count += 1` |

#### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL DSN |
| `TRACKING_HMAC_SECRET` | Shared secret for signing/verifying tokens (must match Messaging service) |
| `BASE_URL` | Fallback redirect destination (default: `https://electragram.io`) |

#### Non-functional Requirements
- Open pixel: p99 < 50ms end-to-end (Lambda provisioned concurrency = 10)
- Click redirect: p99 < 100ms end-to-end
- Throughput: 5,000 concurrent requests without degradation
- 99.99% availability (provisioned concurrency prevents cold start latency on first open)

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
**Status:** ✅ Complete — 61 tests passing

#### Purpose
Theme, template, and block management. Renders HTML email templates for the Delivery Service. Provides the block-based content editor API. The `RendererService` is the integration point between design assets and outbound email — called by the Delivery service just before sending each message.

#### Owns
```
design.color_palettes
design.fonts
design.font_stacks
design.graphics
design.themes
design.theme_templates
design.theme_layers
design.blocks
```

#### Internal Package Structure

```
services/design/src/
├── db/
│   ├── schema.ts           # Drizzle ORM schema for all 8 tables
│   ├── client.ts           # Pool + drizzle client
│   └── migrate.ts          # Idempotent DDL migration
├── middleware/
│   └── auth.middleware.ts  # JWT RS256 bearer auth (shared pattern)
├── services/
│   ├── themes.service.ts          # CRUD + FTS search + publish/archive lifecycle
│   ├── templates.service.ts       # CRUD + variable key extraction
│   ├── layers.service.ts          # SVG layer CRUD under template
│   ├── color-palettes.service.ts  # CRUD
│   ├── font-stacks.service.ts     # CRUD
│   ├── fonts.service.ts           # CRUD (shared + account-specific)
│   ├── graphics.service.ts        # SVG graphic CRUD
│   ├── blocks.service.ts          # Polymorphic content block CRUD + reorder
│   └── renderer.service.ts        # ← KEY: email HTML rendering for Delivery
└── routes/                        # 8 route files (one per domain)
```

#### Renderer Pipeline (`RendererService.render`)

Called by Delivery service at `POST /templates/:templateId/render`:

1. Load `theme_template` record by ID
2. Load associated `theme` → `color_palette` + `font_stack` → `fonts`
3. Build CSS custom properties (`--color-primary`, `--font-primary`, etc.) from palette/stack
4. Wrap `body_html` in a 600px-max email skeleton with inline CSS variables
5. If `preview: false`: interpolate `{{variable}}` placeholders with provided values
6. Return `{ html, subject, preheader, bodyText, fromName, fromEmail, missingVariables }`

Preview mode (`preview: true`) preserves `{{placeholders}}` visibly — used by the editor.

#### Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/themes` | List themes (search, filter by kind/status/shared) |
| POST | `/themes` | Create theme |
| GET/PATCH/DELETE | `/themes/:themeId` | Get / update / delete theme |
| POST | `/themes/:themeId/publish` | Activate theme |
| POST | `/themes/:themeId/archive` | Archive theme |
| GET/POST | `/themes/:themeId/templates` | List / create templates |
| GET/PATCH/DELETE | `/themes/:themeId/templates/:templateId` | Get / update / delete template |
| POST | `/themes/:themeId/templates/:templateId/render` | Render template HTML |
| POST | `/templates/:templateId/render` | **Shortcut for Delivery service** (no themeId required) |
| GET/POST | `/themes/:themeId/templates/:templateId/layers` | List / create SVG layers |
| GET/PATCH/DELETE | `/themes/:themeId/templates/:templateId/layers/:layerId` | Layer CRUD |
| GET/POST/PATCH/DELETE | `/color-palettes[/:paletteId]` | Color palette CRUD |
| GET/POST/PATCH/DELETE | `/font-stacks[/:stackId]` | Font stack CRUD |
| GET/POST/PATCH/DELETE | `/fonts[/:fontId]` | Font CRUD |
| GET/POST/PATCH/DELETE | `/graphics[/:graphicId]` | Graphic CRUD |
| GET/POST/PATCH/DELETE | `/blocks[/:blockId]` | Block CRUD |
| POST | `/blocks/reorder` | Reorder blocks by position |

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

**Language:** Go 1.26  
**Deployment:** AWS Lambda (API Gateway trigger)  
**Database schema:** Stateless (no DB — pure pass-through)  
**Status:** ✅ Complete — 47 tests passing (handler 95.9%, twilio 100%, parser 100%)

#### Purpose
Validates and routes incoming webhooks from Twilio (SMS, WhatsApp, status callbacks) to the appropriate internal SQS queue. Isolated to prevent provider credential compromise from impacting other services. Designed for 99.99% availability — a missed webhook is a missed message.

#### Internal Package Structure

```
services/webhooks/
├── main.go                          # Lambda entry, credential wiring
├── webhooks_test.go
└── internal/
    ├── twilio/
    │   ├── signature.go             # Validate/Compute HMAC-SHA1 sig
    │   └── signature_test.go        # 14 tests — 100% coverage
    ├── parser/
    │   ├── parser.go                # Decode Twilio form body → WebhookEvent
    │   └── parser_test.go           # 13 tests — 100% coverage
    ├── sqs/
    │   ├── publisher.go             # Publisher interface + stdlib Sig V4 client + Mock
    │   └── publisher_test.go        # 9 tests
    └── handler/
        ├── handler.go               # TokenResolver, Handler, routing
        └── handler_test.go          # 20 tests — 95.9% coverage
```

#### Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/hooks/twilio/{webhookToken}` | Inbound SMS or status callback |
| POST | `/hooks/twilio/whatsapp-senders/{webhookToken}` | Inbound WhatsApp or status callback |

#### Processing Pipeline

1. Extract `{webhookToken}` from path (last segment).
2. Resolve the Twilio auth token for that webhook registration via `TokenResolver`.
   - Current implementation: `MapTokenResolver` — static map populated from env at cold start.
   - Extension point: swap for an HTTP-based resolver that calls Identity Service for multi-tenant deployments.
3. Validate `X-Twilio-Signature` header using HMAC-SHA1 over the full URL + sorted POST params (Twilio webhook security spec). Handles both `X-Twilio-Signature` and `x-twilio-signature` (API Gateway may lowercase headers).
4. Parse the `application/x-www-form-urlencoded` body into a `WebhookEvent`. Classify as:
   - `inbound_sms` — `MessageStatus` absent, no `whatsapp:` prefix
   - `inbound_whatsapp` — `From` or `To` starts with `whatsapp:`
   - `status_callback` — `MessageStatus` present (takes precedence)
5. Serialize to JSON and publish to the appropriate SQS queue.
6. Return an empty TwiML `<Response/>` with `Content-Type: text/xml` — Twilio requires a 200 within 15 seconds.

#### SQS Message Format

All messages share the same JSON schema:

```json
{
  "kind": "inbound_sms | inbound_whatsapp | status_callback",
  "accountSid": "ACxxx",
  "messageSid": "SMxxx",
  "from": "+15551234567",
  "to": "+15550000001",
  "body": "Message text",
  "messageStatus": "delivered",
  "numMedia": "0"
}
```

Queue routing:
- `inbound_sms` / `inbound_whatsapp` → `CHAT_INBOUND_QUEUE_URL`
- `status_callback` → `DELIVERY_STATUS_QUEUE_URL`

#### SQS Client (stdlib only, no external SDK)

The real `sqs.Client` publishes to SQS using the HTTP API with AWS Signature V4, implemented entirely in the standard library (`crypto/hmac`, `crypto/sha256`, `net/http`). Credentials are read from Lambda environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`). This eliminates the `aws-sdk-go-v2` dependency.

#### Environment Variables

| Variable | Description |
|---|---|
| `TWILIO_WEBHOOK_TOKEN` | Webhook URL registration token (used in the URL path) |
| `TWILIO_AUTH_TOKEN` | Twilio account auth token (for HMAC-SHA1 signature validation) |
| `TWILIO_WEBHOOK_BASE_URL` | Full base URL used for Twilio signature reconstruction, e.g. `https://api.electragram.io` |
| `CHAT_INBOUND_QUEUE_URL` | SQS URL for inbound SMS/WhatsApp messages |
| `DELIVERY_STATUS_QUEUE_URL` | SQS URL for Twilio delivery status callbacks |
| `AWS_REGION` | AWS region (defaults to `us-east-1`) |

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

| Publisher | Channel | Subscriber | Event / Purpose |
|---|---|---|---|
| Messaging | SQS `delivery-queue` (FIFO) | Delivery Lambda | `DeliveryPayload` per recipient (email, sms, whatsapp — `kind` field differentiates) |
| Delivery | SNS `delivery-events` | Analytics | Delivery outcomes (`delivered`, `failed`, `bounced`) |
| Tracking | SNS `tracking-events` | Analytics | Open / click events |
| Webhook | SQS `chat-inbound` | Chat | Inbound Twilio message |
| Webhook | SQS `delivery-status` | Delivery | Twilio/SendGrid status callbacks |
| Contacts | EventBridge `contacts.ContactCreated` | Integrations | Trigger CRM sync |
| Contacts | EventBridge `contacts.ContactUpdated` | Integrations | Trigger CRM sync |
| Contacts | EventBridge `contacts.ContactUnsubscribed` | Delivery | Update suppression list |
| Events | EventBridge `events.GuestStatusChanged` | Messaging | Trigger evaluation |
| Events | EventBridge `events.EventCreated` | Analytics | Activity feed |
| Media | SQS `media-processing` | Media Lambda | Upload processing jobs |

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
- **Delivery** (Go 1.26): 512 MB, 30s timeout, reserved concurrency 200, SQS trigger batch size 10, partial batch failure enabled
- **Tracking** (Go 1.26): 128 MB, 3s timeout, provisioned concurrency 10 (warm — latency sensitive), API Gateway trigger
- **Webhooks** (Go 1.26): 256 MB, 10s timeout, provisioned concurrency 5 (Twilio retries on cold-start delay), API Gateway trigger
- **Media** (TypeScript): 1 GB, 300s timeout, API Gateway trigger

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
