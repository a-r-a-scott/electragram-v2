# Deploying Electragram to AWS

This guide walks you through deploying Electragram to your own AWS account. The entire infrastructure is defined as code — you run a few commands and GitHub does the rest automatically on every future code change.

Estimated time: **60–90 minutes** for a first deployment.

Non-technical AWS deployment guide covering: what gets created and rough monthly cost estimates, prerequisites, forking the repo, creating an IAM deploy user, every GitHub Secret that needs to be added (with generation commands for JWT keys and encryption key), CDK bootstrap, how to trigger the deploy, what the CDK stacks create, one-time post-deploy seeding (Secrets Manager entries), creating the first account, staging vs production environments, monitoring/logs, updating the app, and teardown instructions.

---

## Before you start

### What this creates in AWS

The deployment sets up a production-ready environment:

| AWS Service | Purpose |
|---|---|
| **ECS Fargate** | Runs the 9 application microservices as containers (no servers to manage) |
| **RDS PostgreSQL 16** | Managed database with automatic backups |
| **ElastiCache Redis 7** | Managed cache and session store |
| **API Gateway** | Single entry point for all API traffic |
| **CloudFront** | Global CDN for the web app and static assets |
| **S3** | File storage for media uploads and exports |
| **SQS + SNS + EventBridge** | Message queues and event routing between services |
| **Secrets Manager** | Secure storage for passwords, API keys, and JWT signing keys |
| **Lambda** | Runs the Go-based Delivery, Tracking, and Webhooks services; the TypeScript Media service |
| **WAF** | Web Application Firewall protecting the API |
| **CloudWatch + X-Ray** | Logs and distributed tracing |
| **VPC** | Isolated network with private subnets for all services |

### Rough monthly cost estimates

These are estimates for `us-east-1` at typical usage. Actual costs vary.

| Environment | Approximate monthly cost | Suitable for |
|---|---|---|
| **Staging** (minimal sizes) | $80–$150 / month | Testing, demos, development |
| **Production** (standard sizes) | $400–$800 / month | Real users, production traffic |

> AWS offers a **free tier** that covers some services for 12 months. A staging deployment may cost significantly less for the first year.

---

## Prerequisites

### 1. AWS account
Sign up at **https://aws.amazon.com** — a credit card is required but you won't be charged until you exceed free tier limits.

Once logged in, note your **AWS Account ID** — a 12-digit number found in the top-right dropdown menu of the AWS Console.

### 2. AWS CLI v2
The AWS Command Line Interface lets you configure credentials and run deployment commands.

Download and install from **https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html**

After installing, run:
```bash
aws configure
```

You will be prompted for:
```
AWS Access Key ID:     (from Step 2 below)
AWS Secret Access Key: (from Step 2 below)
Default region name:   us-east-1
Default output format: json
```

### 3. Node.js 22 and pnpm
Required to run the CDK deployment tool locally.
- Node.js: **https://nodejs.org** (version 22 LTS)
- pnpm: `npm install -g pnpm`

### 4. GitHub account
The CI/CD pipeline runs on GitHub Actions. Fork the repository to your own account (Step 1 below).

---

## Step 1 — Fork the repository

1. Go to **https://github.com/a-r-a-scott/electragram-v2**
2. Click the **Fork** button in the top-right corner
3. Choose your personal GitHub account as the destination
4. Clone your fork to your computer:
   ```bash
   git clone https://github.com/YOUR-GITHUB-USERNAME/electragram-v2.git
   cd electragram-v2
   ```

---

## Step 2 — Create an AWS IAM user for deployments

> **Why?** You should never use your AWS root account credentials for automated deployments. Creating a dedicated IAM user limits the blast radius if credentials are ever exposed.

1. Log into the **AWS Console** → search for **IAM** → click **Users** → **Create user**
2. Username: `electragram-deploy` (or any name you prefer)
3. Select **"Provide user access to the AWS Management Console"**: No
4. Permissions: Attach **AdministratorAccess** directly

   > For a production environment you would use a more restricted policy. AdministratorAccess is acceptable for initial setup as CDK needs broad permissions to create infrastructure.

5. Click **Create user**
6. Click the user you just created → **Security credentials** tab → **Create access key**
7. Choose "**Application running outside AWS**" → Next
8. **Copy both the Access Key ID and Secret Access Key** — you will need them in the next step. The secret key is only shown once.

---

## Step 3 — Add GitHub Secrets

GitHub Secrets are encrypted variables that the CI/CD pipeline reads during deployment. Nothing in them is ever logged or exposed.

Go to your forked repository on GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

Add each of the following:

### Required — AWS credentials

| Secret name | Value | Where to find it |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | Your IAM user's access key ID | Step 2 above |
| `AWS_SECRET_ACCESS_KEY` | Your IAM user's secret access key | Step 2 above |
| `AWS_ACCOUNT_ID` | Your 12-digit AWS account number | AWS Console top-right dropdown |
| `AWS_REGION` | `us-east-1` | Or whichever region you prefer |

### Required — Application secrets

| Secret name | Value | How to generate |
|---|---|---|
| `JWT_PRIVATE_KEY` | RSA-2048 private key (PEM, newlines as `\n`) | See below |
| `JWT_PUBLIC_KEY` | Matching RSA-2048 public key (PEM, newlines as `\n`) | See below |
| `ENCRYPTION_KEY` | Random 64-character hex string | See below |

**Generating the JWT keys** (run this in your terminal):
```bash
# Generate the private key
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private.pem

# Generate the matching public key
openssl rsa -pubout -in private.pem -out public.pem

# Print the private key with literal \n (paste the output as the secret value)
awk 'NF{printf "%s\\n", $0}' private.pem; echo

# Print the public key with literal \n
awk 'NF{printf "%s\\n", $0}' public.pem; echo

# Clean up — keep these files safe or delete them
rm private.pem public.pem
```

**Generating the encryption key:**
```bash
openssl rand -hex 32
```

### Optional — Third-party integrations

Add these only if you want email/SMS delivery and OAuth integrations to work. The application deploys and runs without them.

| Secret name | Value | Purpose |
|---|---|---|
| `SENDGRID_API_KEY` | `SG.xxxx` | Sending emails |
| `SENDGRID_FROM_EMAIL` | `noreply@yourdomain.com` | From address for emails |
| `TWILIO_ACCOUNT_SID` | `ACxxxx` | Sending SMS / WhatsApp |
| `TWILIO_AUTH_TOKEN` | `xxxx` | Twilio authentication |
| `TWILIO_FROM_NUMBER` | `+15551234567` | Your Twilio phone number |
| `GOOGLE_CLIENT_ID` | `xxxxx.apps.googleusercontent.com` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | `xxxxx` | Google OAuth |

### Required — Deployment targets (fill in after first deploy)

These are only needed for the CDK invalidation and asset upload steps. Leave them blank initially and fill them in after your first deployment completes.

| Secret name | Value |
|---|---|
| `CLOUDFRONT_DISTRIBUTION_ID` | Found in AWS Console → CloudFront after first deploy |
| `ASSETS_BUCKET` | S3 bucket name created by CDK |

---

## Step 4 — Bootstrap CDK

AWS CDK (Cloud Development Kit) is the tool that translates the infrastructure code into real AWS resources. Before it can deploy anything it needs to create a small S3 bucket in your account to store deployment artefacts.

Run these commands in your terminal (from inside the `electragram-v2` folder):

```bash
# Install CDK globally
npm install -g aws-cdk

# Install CDK dependencies
cd infra/cdk
pnpm install

# Bootstrap CDK in your AWS account (one-time, per account/region)
cdk bootstrap aws://YOUR_AWS_ACCOUNT_ID/us-east-1
```

Replace `YOUR_AWS_ACCOUNT_ID` with your 12-digit account number.

You should see output ending in:
```
✅  Environment aws://123456789012/us-east-1 bootstrapped.
```

---

## Step 5 — Deploy infrastructure

The deployment is triggered automatically by GitHub Actions when you push to the `main` branch. You can also trigger it manually.

### Option A — Trigger manually (recommended for first deploy)

1. Go to your repository on GitHub
2. Click the **Actions** tab
3. Click **"Deploy"** in the left sidebar
4. Click **"Run workflow"** → choose branch `main` → click the green **"Run workflow"** button

The workflow will:
1. Run all tests
2. Build Docker images for each service
3. Push images to Amazon ECR (Elastic Container Registry)
4. Run `cdk deploy` to create or update all AWS infrastructure
5. Roll out the new container images to ECS Fargate
6. Run database migrations (each service does this automatically on startup)

First deployment takes approximately **20–30 minutes**.

### Option B — Push to main

Any push to the `main` branch automatically triggers the deployment pipeline:

```bash
git add .
git commit -m "Initial deployment"
git push origin main
```

### What the CDK stacks create

The deployment creates these stacks in order:

| Stack | What it creates |
|---|---|
| `ElectragramNetwork` | VPC, subnets, NAT gateway, security groups |
| `ElectragramDatabase` | RDS PostgreSQL 16, ElastiCache Redis 7, Secrets Manager entries |
| `ElectragramMessaging` | SQS queues, SNS topics, EventBridge rules |
| `ElectragramServices` | ECS cluster, Fargate task definitions, IAM roles, auto-scaling |
| `ElectragramApiGateway` | REST API Gateway, WebSocket API, Lambda authoriser |
| `ElectragramFrontend` | S3 bucket, CloudFront distribution, WAF |

---

## Step 6 — Seed required data (one time, post-deploy)

After the first successful deployment, you need to store the JWT keys in AWS Secrets Manager so the services can read them at startup.

### Store JWT keys in Secrets Manager

```bash
# Set your region
REGION=us-east-1

# Store the private key (paste the PEM contents when prompted, or use --secret-string)
aws secretsmanager create-secret \
  --name "electragram/staging/jwt-private-key" \
  --secret-string "$(cat private.pem)" \
  --region "$REGION"

# Store the public key
aws secretsmanager create-secret \
  --name "electragram/staging/jwt-public-key" \
  --secret-string "$(cat public.pem)" \
  --region "$REGION"

# Store the encryption key
aws secretsmanager create-secret \
  --name "electragram/staging/encryption-key" \
  --secret-string "$(openssl rand -hex 32)" \
  --region "$REGION"
```

> If you already deleted `private.pem` and `public.pem`, generate a new pair (Step 3 above) and update the GitHub secrets to match.

### Restart services to pick up the new secrets

After storing the secrets, trigger a fresh deployment or restart the ECS services from the AWS Console:
- Go to **ECS** → **Clusters** → `electragram-staging` → **Services** → select each service → **Update service** → check "Force new deployment" → **Update**

### What seeds automatically

You do **not** need to run any SQL scripts or import data. Everything seeds itself:

| Data | How |
|---|---|
| Database schemas | Created by `infra/db/init.sql` when RDS starts (CDK runs this via a custom resource) |
| All application tables | Each service runs `runMigrations()` automatically on first startup |
| Integration provider catalog (7 providers) | Integrations service seeds this on first startup — no action needed |
| Design themes, fonts, templates | Created by users via the web app |
| Your first user account | Created in the next step |

---

## Step 7 — Create your first account

Once the deployment is complete, find your API Gateway URL:
- AWS Console → **API Gateway** → **APIs** → `electragram-api` → **Stages** → `v1`
- Copy the **Invoke URL** (looks like `https://abc123.execute-api.us-east-1.amazonaws.com/v1`)

Then run:
```bash
ELECTRAGRAM_API_URL=https://abc123.execute-api.us-east-1.amazonaws.com/v1 \
  bash scripts/create-first-user.sh
```

You can also open the CloudFront URL in your browser and sign up through the web interface:
- AWS Console → **CloudFront** → copy the **Distribution domain name** (looks like `d123.cloudfront.net`)
- Open `https://d123.cloudfront.net` in your browser → click **Sign up**

---

## Environments

The deployment pipeline supports two environments.

| Environment | Trigger | AWS account | Purpose |
|---|---|---|---|
| **Staging** | Push to `main` | Same account, `-staging` suffix | Testing features before release |
| **Production** | Push to `production` branch | Same account, `-production` suffix | Live users |

To promote a change to production:
```bash
git checkout -b production
git merge main
git push origin production
```

> You can also use separate AWS accounts for staging and production by adding a second set of `AWS_ACCESS_KEY_ID_PROD` / `AWS_SECRET_ACCESS_KEY_PROD` secrets and updating the workflow.

---

## Monitoring and logs

### Viewing logs
- AWS Console → **CloudWatch** → **Log groups** → `/ecs/electragram-staging/identity` (one group per service)
- Or use the CLI: `aws logs tail /ecs/electragram-staging/identity --follow`

### Distributed tracing
- AWS Console → **X-Ray** → **Traces** — see request flows across services

### Health checks
Each service exposes a `/health` endpoint. You can check all of them:
```bash
API=https://abc123.execute-api.us-east-1.amazonaws.com/v1
curl $API/identity/health
curl $API/contacts/health
```

### Alarms
CloudWatch alarms are created automatically by CDK for:
- Service error rate > 1%
- Database CPU > 80%
- Memory utilisation > 85%

Configure alarm notifications by adding an SNS email subscription in the AWS Console → **SNS** → `electragram-alerts`.

---

## Updating the application

After the initial deployment, every push to `main` automatically:
1. Runs tests
2. Builds and pushes new Docker images
3. Updates infrastructure if it changed
4. Rolls out new containers with zero downtime (ECS rolling deployment)

No manual steps are required for updates.

---

## Troubleshooting

### CDK bootstrap fails with "insufficient permissions"
Make sure your IAM user has `AdministratorAccess`. CDK needs broad permissions for the initial bootstrap.

### ECS service fails to start (shows "STOPPED" tasks)
Check the service's CloudWatch logs. Common causes:
- Missing Secrets Manager entries (JWT keys not stored) → run Step 6 again
- Database not yet ready → wait 5 minutes and force a new deployment
- Environment variable missing → check the task definition in ECS console

### "UnauthorizedException" from API Gateway
The JWT public key stored in Secrets Manager doesn't match the private key being used to sign tokens. Re-generate a fresh key pair, update both Secrets Manager and GitHub Secrets, then redeploy.

### CloudFront returns "403 Forbidden"
The S3 bucket policy may not have been applied correctly. Re-run the CDK deploy:
```bash
cd infra/cdk && cdk deploy ElectragramFrontend
```

### Database migrations fail on startup
Force a new deployment of just the affected service from the ECS console. If it continues failing, check the RDS instance is in `available` state (AWS Console → RDS → Databases).

### Costs higher than expected
- Check the **AWS Cost Explorer** (AWS Console → Billing → Cost Explorer)
- Common culprits: NAT Gateway data transfer, RDS storage, CloudWatch log retention
- To reduce costs for staging: scale ECS tasks to 0 when not in use (ECS → Services → Update service → desired count = 0)

---

## Tearing down

To delete all AWS resources and stop incurring costs:

```bash
cd infra/cdk
cdk destroy --all
```

> This permanently deletes the RDS database. Make sure you have a backup first if you need the data.

RDS automated snapshots are retained for 7 days by default. You can restore from a snapshot in the RDS console.
