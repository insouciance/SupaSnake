# Environment Setup Guide

Complete guide for setting up environment variables and third-party services for your project.

---

## Quick Start

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Open in your editor
code .env  # or vim .env

# 3. Fill in values for services you're using
# See detailed instructions below
```

---

## Table of Contents

1. [Database Setup](#database-setup)
2. [Authentication Setup](#authentication-setup)
3. [Payments Setup](#payments-setup)
4. [Deployment Setup](#deployment-setup)
5. [Error Tracking Setup](#error-tracking-setup)
6. [Email Setup](#email-setup)
7. [Storage Setup](#storage-setup)
8. [Security Best Practices](#security-best-practices)

---

## Database Setup

### Supabase (Recommended for Full-Stack Apps)

**Why Supabase:** Database + Auth + Storage + Realtime in one platform.

**Setup Steps:**

1. **Create Project**
   - Go to https://supabase.com
   - Click "New Project"
   - Choose organization, name, region, password

2. **Get Connection Details**
   - Project Settings → API
   - Copy these values:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...  # Public anon key
   SUPABASE_SERVICE_ROLE_KEY=eyJhbG...     # Secret service role key
   ```

   - Project Settings → Database
   - Copy connection string:

   ```bash
   DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
   ```

3. **Initialize Schema**

   SupaSnake develops against the isolated local stack, never against a hosted
   project. `supabase/migrations/` is applied by bringing the local stack up:

   ```bash
   bash scripts/isolated-supabase.sh start   # applies every migration
   bash scripts/run-local-sql-contracts.sh   # the SQL contracts CI runs
   ```

   Hosted schema changes are the release workflow's job alone
   (`docs/ops/RELEASE_RUNBOOK.md`); do not run `supabase db push` by hand.

   **Pin the CLI to 2.109.1.** The version is not cosmetic: 2.65.5 refuses to
   parse `supabase/config.toml` over its `local_smtp` key and cannot apply
   migration 061, and both failures look like repository bugs rather than a
   stale tool. CI installs 2.109.1 via `supabase/setup-cli`, and the scripts
   above resolve the same version through `scripts/supabase-cli.sh` — they use
   an installed 2.109.1 if you have one and otherwise fall back to
   `npx supabase@2.109.1`, so no global install has to be kept in sync.

   Invoking the CLI directly, use the pin explicitly:

   ```bash
   npx supabase@2.109.1 status
   npx supabase@2.109.1 migration list --local
   ```

**Security Notes:**
- ✅ `NEXT_PUBLIC_SUPABASE_URL` - Safe for client
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Safe for client (RLS protected)
- ❌ `SUPABASE_SERVICE_ROLE_KEY` - NEVER expose to client (bypasses RLS)
- ❌ `DATABASE_URL` - Backend only

---

### PostgreSQL (Self-Hosted)

**Setup Steps:**

1. **Install PostgreSQL**
   ```bash
   # macOS
   brew install postgresql@15
   brew services start postgresql@15

   # Ubuntu
   sudo apt install postgresql postgresql-contrib
   sudo systemctl start postgresql
   ```

2. **Create Database**
   ```bash
   # Connect to PostgreSQL
   psql postgres

   # Create user and database
   CREATE USER myuser WITH PASSWORD 'mypassword';
   CREATE DATABASE mydb OWNER myuser;
   GRANT ALL PRIVILEGES ON DATABASE mydb TO myuser;
   ```

3. **Set Environment Variable**
   ```bash
   DATABASE_URL=postgresql://myuser:mypassword@localhost:5432/mydb
   ```

---

## Authentication Setup

### Supabase Auth (Recommended if using Supabase)

**Already configured!** If you set up Supabase above, auth is included.

**Enable Providers:**
1. Authentication → Providers
2. Enable: Email, Google, GitHub, etc.
3. Add OAuth credentials for each provider

**Example - Google OAuth:**
```bash
# Add to .env after setting up Google Cloud Console
NEXT_PUBLIC_SUPABASE_URL=...  # Already set
NEXT_PUBLIC_SUPABASE_ANON_KEY=...  # Already set
```

---

### NextAuth.js (Alternative)

**Setup Steps:**

1. **Generate Secret**
   ```bash
   openssl rand -base64 32
   ```

2. **Add to .env**
   ```bash
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=your-generated-secret
   ```

3. **Add OAuth Providers**
   ```bash
   # Google
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret

   # GitHub
   GITHUB_ID=your-github-id
   GITHUB_SECRET=your-github-secret
   ```

---

## Payments Setup

### Stripe (Recommended)

**Setup Steps:**

1. **Create Account**
   - Go to https://stripe.com
   - Create account
   - Complete business verification (for production)

2. **Get API Keys**
   - Dashboard → Developers → API Keys
   - Use test keys for development:

   ```bash
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
   STRIPE_SECRET_KEY=sk_test_xxxxx
   ```

3. **Set Up Webhooks** (for production)
   - Dashboard → Developers → Webhooks
   - Add endpoint: `https://yourdomain.com/api/webhooks/stripe`
   - Copy webhook signing secret:

   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_xxxxx
   ```

4. **Test Webhook Locally**
   ```bash
   # Install Stripe CLI
   brew install stripe/stripe-cli/stripe

   # Forward webhooks to local
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

**Security Notes:**
- ✅ `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Safe for client
- ❌ `STRIPE_SECRET_KEY` - Backend only
- ❌ `STRIPE_WEBHOOK_SECRET` - Backend only

**Test Cards:**
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3D Secure: `4000 0027 6000 3184`

---

## Deployment Setup

### Vercel (Recommended for Next.js)

**Setup Steps:**

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   vercel login
   ```

2. **Link Project**
   ```bash
   vercel link
   ```

3. **Add Environment Variables**
   ```bash
   # Option 1: CLI
   vercel env add SUPABASE_SERVICE_ROLE_KEY production

   # Option 2: Dashboard
   # Project Settings → Environment Variables
   # Add each variable for production/preview/development
   ```

4. **Auto-Set Variables** (already in .env)
   ```bash
   VERCEL_URL=auto-set-by-vercel
   NEXT_PUBLIC_VERCEL_URL=${VERCEL_URL}
   ```

5. **Deploy**
   ```bash
   vercel --prod
   ```

**Important:**
- Set `NODE_ENV=production` for production
- Use different keys for preview vs production
- Enable "Automatically expose System Environment Variables"

---

### Railway (Alternative)

**Setup Steps:**

1. **Create Project**
   - Go to https://railway.app
   - "New Project" → "Deploy from GitHub"

2. **Add Environment Variables**
   - Project → Variables
   - Copy all variables from your `.env`

3. **Add Domains**
   - Settings → Domains
   - Generate domain or add custom

---

## Error Tracking Setup

### Sentry (Recommended)

**Setup Steps:**

1. **Create Account**
   - Go to https://sentry.io
   - Create project (choose your framework)

2. **Get DSN**
   - Project Settings → Client Keys (DSN)
   - Copy DSN:

   ```bash
   NEXT_PUBLIC_SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
   ```

3. **Get Auth Token** (for source maps)
   - User Settings → Auth Tokens
   - Create token with `project:releases` scope:

   ```bash
   SENTRY_AUTH_TOKEN=sntrys_xxxxx
   SENTRY_ORG=your-org-slug
   SENTRY_PROJECT=your-project-slug
   ```

4. **Initialize in Code**
   ```typescript
   // sentry.client.config.ts
   import * as Sentry from "@sentry/nextjs";

   Sentry.init({
     dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
     tracesSampleRate: 1.0,
     environment: process.env.NODE_ENV,
   });
   ```

**Test Error:**
```typescript
// Trigger test error
throw new Error("Sentry test error");
```

---

## Email Setup

### Resend (Recommended - Modern API)

**Setup Steps:**

1. **Create Account**
   - Go to https://resend.com
   - Verify your domain (for production)

2. **Get API Key**
   - API Keys → Create API Key
   - Copy key:

   ```bash
   RESEND_API_KEY=re_xxxxx
   ```

3. **Send Test Email**
   ```typescript
   import { Resend } from 'resend';

   const resend = new Resend(process.env.RESEND_API_KEY);

   await resend.emails.send({
     from: 'noreply@yourdomain.com',
     to: 'user@example.com',
     subject: 'Test Email',
     html: '<p>Hello World</p>'
   });
   ```

**Development:** Use `onboarding@resend.dev` as from address (no domain needed)

---

### SendGrid (Alternative)

**Setup Steps:**

1. **Create Account**
   - Go to https://sendgrid.com

2. **Create API Key**
   - Settings → API Keys → Create API Key
   - Full Access permissions

   ```bash
   SENDGRID_API_KEY=SG.xxxxx
   SENDGRID_FROM_EMAIL=noreply@yourdomain.com
   ```

3. **Verify Domain** (for production)
   - Settings → Sender Authentication
   - Authenticate your domain

---

## Storage Setup

### Supabase Storage (Recommended if using Supabase)

**Already configured!** If you set up Supabase, storage is included.

**Create Bucket:**
1. Storage → Create Bucket
2. Set policies for public/private access
3. Upload files via SDK:

```typescript
const { data, error } = await supabase.storage
  .from('avatars')
  .upload('public/avatar1.png', file);
```

---

### AWS S3 (Alternative)

**Setup Steps:**

1. **Create IAM User**
   - AWS Console → IAM → Users → Add User
   - Attach policy: `AmazonS3FullAccess`
   - Create access key

2. **Add to .env**
   ```bash
   AWS_ACCESS_KEY_ID=AKIAXXXXX
   AWS_SECRET_ACCESS_KEY=xxxxx
   AWS_REGION=us-east-1
   AWS_S3_BUCKET=your-bucket-name
   ```

3. **Create Bucket**
   - S3 Console → Create Bucket
   - Configure CORS if needed

---

## Security Best Practices

### Environment Variables Checklist

**DO ✅:**
- Use `.env.local` for local development (not committed)
- Use `.env.example` for documentation (committed)
- Use different keys for dev/staging/production
- Rotate secrets regularly (quarterly)
- Store production secrets in deployment platform
- Use `NEXT_PUBLIC_` prefix ONLY for client-exposed values
- Encrypt sensitive values at rest
- Use service role/admin keys only on backend

**DON'T ❌:**
- Commit `.env` files to git
- Share secrets via email/Slack
- Use production keys in development
- Expose backend keys to client
- Use same password across services
- Store secrets in code
- Log sensitive values

---

### Key Naming Conventions

**Client-Safe (NEXT_PUBLIC_):**
```bash
NEXT_PUBLIC_SUPABASE_URL=...          # ✅ Public
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=... # ✅ Public
NEXT_PUBLIC_API_URL=...                # ✅ Public
```

**Backend-Only (NO prefix):**
```bash
SUPABASE_SERVICE_ROLE_KEY=...  # ❌ Never expose
STRIPE_SECRET_KEY=...          # ❌ Never expose
DATABASE_URL=...               # ❌ Never expose
JWT_SECRET=...                 # ❌ Never expose
```

---

### Verifying Environment Variables

**Create verification script:**

```bash
# scripts/verify-env.sh
#!/bin/bash

required_vars=(
  "DATABASE_URL"
  "NEXT_PUBLIC_SUPABASE_URL"
  "STRIPE_SECRET_KEY"
)

missing=()

for var in "${required_vars[@]}"; do
  if [[ -z "${!var}" ]]; then
    missing+=("$var")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "❌ Missing required environment variables:"
  printf '  - %s\n' "${missing[@]}"
  exit 1
fi

echo "✅ All required environment variables present"
```

**Run before deploy:**
```bash
chmod +x scripts/verify-env.sh
./scripts/verify-env.sh
```

---

### Hook Protection

**Already built-in!** The platform's security hook blocks:
- Hard-coded API keys
- Hard-coded passwords
- Database credentials in code

**Example - This would be BLOCKED:**
```typescript
// ❌ BLOCKED by hooks
const apiKey = "sk_test_12345";
```

**Correct approach:**
```typescript
// ✅ Allowed
const apiKey = process.env.STRIPE_SECRET_KEY;
```

---

## Service-Specific Setup Guides

### Full-Stack SaaS Stack (Recommended)

```bash
# Core Infrastructure
NEXT_PUBLIC_SUPABASE_URL=...        # Database + Auth + Storage
SUPABASE_SERVICE_ROLE_KEY=...       # Backend operations

# Payments
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...

# Deployment
VERCEL_URL=...                      # Auto-set

# Monitoring
NEXT_PUBLIC_SENTRY_DSN=...          # Error tracking

# Email
RESEND_API_KEY=...                  # Transactional emails
```

**Setup Time:** ~30 minutes
**Cost:** Free tier covers most MVP development

---

### E-Commerce Stack

```bash
# Database
DATABASE_URL=...

# Payments (Required)
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...

# Storage (Product Images)
AWS_S3_BUCKET=...
CLOUDINARY_API_KEY=...

# Email (Order Confirmations)
SENDGRID_API_KEY=...

# Analytics
NEXT_PUBLIC_GA_MEASUREMENT_ID=...
```

---

### Mobile App Backend Stack

```bash
# Backend
DATABASE_URL=...
REDIS_URL=...                       # Session management

# Auth
AUTH0_DOMAIN=...
AUTH0_CLIENT_SECRET=...

# Push Notifications
FIREBASE_SERVER_KEY=...
APNS_KEY_ID=...

# SMS (2FA)
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
```

---

## Troubleshooting

### "Environment variable not found"

**Symptom:** App crashes with missing env var

**Solutions:**
1. Check `.env` file exists: `ls -la .env`
2. Verify variable name matches exactly (case-sensitive)
3. Restart dev server: `npm run dev`
4. Check `.env.local` takes precedence over `.env`
5. For Next.js: Variables must exist at build time

---

### "API key invalid"

**Symptom:** Service returns 401/403

**Solutions:**
1. Verify you copied the full key (no truncation)
2. Check you're using correct environment (test vs production)
3. Verify key hasn't been rotated/revoked
4. Check key has necessary permissions
5. For Stripe: Use test key with test mode enabled

---

### Variables not updating

**Symptom:** Changed `.env` but app still uses old value

**Solutions:**
1. Restart development server
2. Clear Next.js cache: `rm -rf .next`
3. For Vercel: Redeploy after changing variables
4. Check `.env.local` isn't overriding

---

### "Cannot read property of undefined"

**Symptom:** `process.env.MY_VAR` is undefined

**Solutions:**
1. Add `NEXT_PUBLIC_` prefix if needed in browser
2. Verify variable in correct .env file
3. Check build-time vs runtime requirements
4. Restart dev server

---

## Resources

**Official Docs:**
- [Supabase](https://supabase.com/docs)
- [Stripe](https://stripe.com/docs)
- [Vercel](https://vercel.com/docs)
- [Sentry](https://docs.sentry.io)
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)

**Templates:**
- See `.env.example` in project root
- Copy and customize for your needs

---

**Ready to configure your services!**

*Remember: Security first. Never commit secrets.*
