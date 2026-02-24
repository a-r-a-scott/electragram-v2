# Running Electragram locally

This guide walks you through getting a fully working copy of Electragram running on your own computer, including all databases, queues, and mock AWS services. No AWS account is required for local development.

Estimated time: **15–20 minutes** (most of which is Docker downloading images the first time).

Non-technical step-by-step local guide covering: prerequisites (Docker Desktop, Node.js 22, pnpm, Git) with download links, git clone, running the setup script, creating the first account, the port reference table, optional third-party credentials (SendGrid / Twilio / Google OAuth), stopping/wiping, and a detailed troubleshooting section.

---

## Before you start — what you'll need

You need four free tools installed on your computer.

### 1. Docker Desktop
Docker is the system that runs all of the Electragram services inside isolated containers. Think of it like a very lightweight virtual machine manager.

- Download from **https://www.docker.com/products/docker-desktop**
- Install and open the app — you should see a green "Engine running" status in the menu bar

> **Windows users:** Make sure WSL 2 integration is enabled in Docker Desktop → Settings → Resources → WSL Integration.

### 2. Node.js 22
Node.js is the JavaScript runtime used to build the project.

- Download the **LTS** release from **https://nodejs.org** (version 22 or later)
- Run the installer and follow the prompts

To check it installed correctly, open a terminal (Terminal on macOS, Command Prompt on Windows) and type:
```
node --version
```
You should see something like `v22.x.x`.

### 3. pnpm (package manager)
pnpm manages the project's JavaScript libraries. Once Node.js is installed, run this in your terminal:

```
npm install -g pnpm
```

### 4. Git
Git downloads the code from GitHub. It is usually pre-installed on macOS and Linux. On Windows you can install it from **https://git-scm.com**.

To check: `git --version`

---

## Step 1 — Download the code

Open a terminal and run:

```bash
git clone https://github.com/a-r-a-scott/electragram-v2.git
cd electragram-v2
```

This creates a folder called `electragram-v2` and moves you into it. All subsequent commands should be run from inside this folder.

---

## Step 2 — Run the one-command setup

```bash
bash scripts/setup-local.sh
```

This single script does everything for you:

| What it does | Details |
|---|---|
| Checks prerequisites | Verifies Docker, Node.js, pnpm, and openssl are available |
| Creates your configuration file | Copies `.env.example` → `.env.local` |
| Generates security keys | Creates an RSA-2048 key pair used to sign login tokens, writes them into `.env.local` |
| Generates an encryption key | Creates a random 64-character key used to securely store third-party integration credentials |
| Installs dependencies | Runs `pnpm install` |
| Starts all services | Runs `docker compose up` — downloads images (first run only) and waits until every service passes its health check |

**First run:** Docker needs to download ~2 GB of images. This can take 5–15 minutes depending on your internet connection. Subsequent starts take under 30 seconds.

When the script finishes you will see a port reference table like this:

```
┌──────────────────────┬───────────────────────────┐
│ Service              │ URL                       │
├──────────────────────┼───────────────────────────┤
│ Web app              │ http://localhost:3000      │
│ Identity API         │ http://localhost:3001      │
│ ...                  │ ...                       │
└──────────────────────┴───────────────────────────┘
```

---

## Step 3 — Create your first account

```bash
bash scripts/create-first-user.sh
```

The script asks you for:

| Field | Description |
|---|---|
| **First name** | Your first name |
| **Last name** | Your last name |
| **Email address** | The email you'll use to log in |
| **Organisation / account name** | The name of your company or workspace (e.g. "Acme Corp") |
| **Password** | At least 8 characters |

After you submit, the script prints a confirmation and a short-lived access token.

You can then open **http://localhost:3000** in your browser and sign in with the email and password you just provided.

> **Already have an account?** You can also sign up directly in the web app at http://localhost:3000/signup — no script needed.

---

## Service ports reference

| Service | URL | What it does |
|---|---|---|
| Web app (Next.js) | http://localhost:3000 | Main browser UI |
| Identity | http://localhost:3001 | Login, signup, user management |
| Contacts | http://localhost:3002 | Contact database, lists, segments |
| Events | http://localhost:3003 | Event tracking and triggers |
| Messaging | http://localhost:3004 | Campaign scheduling and dispatch |
| Chat | http://localhost:3007 | Real-time 2-way SMS/WhatsApp inbox |
| Integrations | http://localhost:3008 | HubSpot, Mailchimp, Klaviyo sync |
| Design | http://localhost:3009 | Email/SMS template designer |
| Analytics | http://localhost:3010 | Delivery reports and engagement stats |
| PostgreSQL database | localhost:5432 | Relational database (all services) |
| Redis cache | localhost:6379 | Session cache and job queues |
| LocalStack (fake AWS) | http://localhost:4566 | SQS, SNS, S3, Secrets Manager in local mode |

---

## Optional: third-party credentials

The application works fully without these — you just won't be able to send real emails or SMS messages in local development.

Edit `.env.local` and fill in any of the following:

### SendGrid (email delivery)
Sign up free at **https://sendgrid.com** → Settings → API Keys → Create API Key.
```
SENDGRID_API_KEY=SG.xxxxxxxxxxxx
SENDGRID_FROM_EMAIL=you@yourdomain.com
```

### Twilio (SMS and WhatsApp)
Sign up free at **https://www.twilio.com** → Account → API Keys.
```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+15551234567
```

### Google OAuth (social login + Google Contacts/Sheets integration)
Create a project at **https://console.cloud.google.com** → APIs & Services → Credentials → Create OAuth 2.0 Client.
Set the authorised redirect URI to `http://localhost:3008/api/integrations/oauth/callback`.
```
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
```

After editing `.env.local`, restart the affected services:
```bash
docker compose restart integrations identity
```

---

## Stopping and resetting

**Stop all services (data is preserved):**
```bash
docker compose down
```

**Restart after stopping:**
```bash
docker compose up -d
```

**Wipe all data and start completely fresh:**
```bash
docker compose down -v
bash scripts/setup-local.sh
```
> The `-v` flag deletes the database volumes. All contacts, campaigns, and messages will be erased.

---

## Troubleshooting

### "Docker is not running"
Open Docker Desktop and wait for the status bar to show "Engine running", then try again.

### "Port already in use" / "address already in use"
Another application on your computer is using one of the required ports. Find and stop it, or change the port mapping in `docker-compose.yml`.

Common culprits:
- Port 5432 — another PostgreSQL installation
- Port 6379 — another Redis installation
- Port 3000 — another development server (Next.js, React, etc.)

To find what is using a port on macOS/Linux:
```bash
lsof -i :5432
```

### Services fail to start / keep restarting
Check the logs for the specific service:
```bash
docker compose logs identity --tail 50
docker compose logs contacts --tail 50
```

### "JWT_PUBLIC_KEY is not set" error in service logs
The `.env.local` file is missing or the JWT keys were not generated. Run:
```bash
bash scripts/setup-local.sh
```
The script is safe to run multiple times — it will not overwrite existing keys.

### LocalStack healthcheck keeps failing
LocalStack can take up to 60 seconds to initialise on slow machines. Wait a moment and check:
```bash
docker compose ps
```
If LocalStack shows as unhealthy after 2 minutes, restart it:
```bash
docker compose restart localstack
```

### Changes to .env.local not taking effect
After editing `.env.local` you need to restart the services:
```bash
docker compose down && docker compose up -d
```

### Database migration errors on first start
Each service runs its own database migrations automatically on startup. If a service crashes on first run, it usually means the database is not yet ready. Wait 10 seconds and restart the service:
```bash
docker compose restart identity
```

### "pnpm: command not found" after installing Node.js
Close your terminal completely, open a new one, then try again. The `PATH` update from the Node.js installer sometimes requires a fresh shell session.

---

## What's running under the hood

When everything is started, your machine is running:

- **PostgreSQL 16** — stores all application data across 10 separate schemas (one per service)
- **Redis 7** — used for session caching, rate limiting, and background job queues
- **LocalStack** — a local emulator of AWS services; the application uses it exactly like real AWS (SQS for message queues, S3 for file storage, Secrets Manager for JWT keys)
- **9 application microservices** — each a separate Node.js process, communicating over HTTP and through message queues

All of this runs entirely on your local machine. No data is sent anywhere external (unless you configure real SendGrid/Twilio credentials).
