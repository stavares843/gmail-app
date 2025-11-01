# Gmail AI Sorting App

Automatically sort, summarize, and archive Gmail messages using AI, with one-click unsubscribe automation.

## Features

-  **Multi-account Gmail OAuth**: Connect multiple Gmail accounts
-  **AI-powered categorization**: Google Gemini (gemini-flash-latest) automatically categorizes and summarizes incoming emails
-  **Custom categories**: Create your own categories with descriptions for precise sorting
-  **Auto-archive**: Ingested emails are automatically archived in Gmail
-  **Unsubscribe automation**: Playwright-powered worker automatically clicks unsubscribe links
-  **Token refresh**: Automatic OAuth token refresh keeps Gmail access active
-  **History-ready cursors**: Stores Gmail History API cursors to enable incremental sync (future-ready)
-  **Bulk actions**: Select multiple emails to delete or unsubscribe in batch
-  **Account-aware filtering**: Filter the dashboard by connected inbox; category counts respect the selected account
-  **Status badges**: Unsubscribe status (pending/success/failed) shown inline next to each email
  
Note on quotas & defaults: To respect API/model usage, each ingest run fetches up to 50 recent emails from the last 30 days by default.

## Architecture

**Monorepo structure:**
- `apps/web`: Next.js 14 (App Router) + Tailwind CSS frontend
- `apps/api`: Express + TypeScript + Prisma backend with Gmail API and Google Gemini integration
- `packages/db`: Shared Prisma schema and client
- `packages/config`: Shared TypeScript config

**Tech stack:**
- **Frontend**: Next.js 14, React, Tailwind CSS, Axios
- **Backend**: Node.js, Express, Passport (Google OAuth 2.0), Prisma ORM
- **Database**: PostgreSQL
- **AI**: Google Gemini (gemini-flash-latest) for categorization and summarization
- **Automation**: Playwright (Chromium) for unsubscribe link processing
- **APIs**: Gmail API (read, modify, history)

## Prerequisites

- Node.js 18+ and pnpm 9+
- Docker (for local Postgres) or a cloud Postgres instance
- [Google Cloud Console project](https://console.cloud.google.com/) with Gmail API enabled
- [Google AI Studio / Gemini API key](https://aistudio.google.com/app/apikey)
- Vercel account (for web deployment)
- Render account (for API + DB deployment)

## Local Development Setup

### 1. Clone and install dependencies

```bash
git clone <your-repo-url>
cd gmail-app
pnpm install
```

### 2. Start local Postgres (Docker)

```bash
docker run --name gmail-ai-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=gmail_ai \
  -p 5432:5432 \
  -d postgres:15
```

Verify container is running:
```bash
docker ps --filter name=gmail-ai-pg
```

### 3. Configure environment variables

Create `.env` files from examples:

**Root `.env`:**
```bash
cp .env.example .env
```

Edit `.env`:
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gmail_ai?schema=public
WEB_URL=http://localhost:3000
API_URL=http://localhost:4000
GEMINI_API_KEY=your-gemini-api-key
```

**`apps/api/.env`:**
```bash
cd apps/api
cp .env.example .env
```

Edit `apps/api/.env`:
```bash
PORT=4000
WEB_URL=http://localhost:3000
SESSION_SECRET=dev-secret-change-for-production
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:4000/auth/google/callback
GEMINI_API_KEY=your-gemini-api-key
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gmail_ai?schema=public
```

**`apps/web/.env`:**
```bash
cd apps/web
cp .env.example .env
```

Edit `apps/web/.env`:
```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
```

**`packages/db/.env`:**
```bash
cd packages/db
echo "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gmail_ai?schema=public" > .env
```

### 4. Set up Google OAuth credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project or select existing
3. Enable **Gmail API** in "APIs & Services" > "Library"
4. Create OAuth 2.0 Client ID:
   - Application type: **Web application**
   - Authorized redirect URIs: `http://localhost:4000/auth/google/callback`
   - Copy **Client ID** and **Client Secret** to `apps/api/.env`
5. Configure OAuth consent screen:
   - Add your Gmail account as a **Test User**
   - Scopes: `openid`, `profile`, `email`, `https://www.googleapis.com/auth/gmail.modify`, `https://www.googleapis.com/auth/gmail.readonly`

### 5. Generate Prisma client and push schema

```bash
pnpm db:generate
pnpm db:push
```

Verify tables were created:
```bash
docker exec -it gmail-ai-pg psql -U postgres -d gmail_ai -c "\dt"
```

You should see: `User`, `Account`, `Category`, `Email`, `IngestCursor`

### 6. Build packages

```bash
pnpm --filter @pkg/db build
pnpm --filter @app/api build
```

### 7. Install Playwright browsers

```bash
cd apps/api
pnpm playwright:install
```

### 8. Start dev servers

**Terminal 1 (API):**
```bash
pnpm --filter @app/api dev
```

API runs on `http://localhost:4000`

**Terminal 2 (Web):**
```bash
pnpm --filter @app/web dev
```

Web runs on `http://localhost:3000`

Quick API health check (optional):

```bash
curl -s http://localhost:4000/health
```

Expected response:

```json
{"ok":true}
```

### 9. Test the app

1. Open `http://localhost:3000`
2. Click "Connect Google account" (redirects to `/auth/google`)
3. Sign in with your test Google account
4. You'll be redirected to `/dashboard`
5. Create a category (e.g., "Newsletters", "Promotions")
6. Click "Ingest Emails Now" to fetch and categorize recent emails
7. Select emails and try bulk delete or bulk unsubscribe
8. Use the "Filter by connected inbox" dropdown to scope categories and email lists by account
   - The Unsubscribe button appears only when selected emails contain unsubscribe links
   - Each email shows an inline status badge after unsubscribe attempts

## Scripts

- `pnpm install` – Install all dependencies
- `pnpm db:generate` – Generate Prisma client
- `pnpm db:push` – Push Prisma schema to database
- `pnpm --filter @pkg/db build` – Build database package
- `pnpm --filter @app/api build` – Build API
- `pnpm --filter @app/web build` – Build web app
- `pnpm --filter @app/api dev` – Start API dev server
- `pnpm --filter @app/web dev` – Start web dev server

## Production Deployment

### Database (Render Postgres)

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Create a new **PostgreSQL** instance
3. Copy the **External Connection String** (starts with `postgresql://`)
4. Use this as `DATABASE_URL` in API environment variables

### API (Render Web Service)

1. Create a new **Web Service** on Render
2. Connect your GitHub repository
3. Configure:
   - **Root Directory**: `apps/api` (or leave blank and use build command with filter)
   - **Build Command**: `pnpm install --frozen-lockfile && pnpm --filter @pkg/db build && pnpm --filter @app/api build`
   - **Start Command**: `pnpm --filter @app/api start`
   - **Environment**: Node 18+
4. Add environment variables:
   ```
   DATABASE_URL=<Render Postgres External Connection String>
   WEB_URL=https://your-vercel-app.vercel.app
   SESSION_SECRET=<generate-strong-random-string>
   GOOGLE_CLIENT_ID=<your-google-client-id>
   GOOGLE_CLIENT_SECRET=<your-google-client-secret>
   GOOGLE_REDIRECT_URI=https://your-api.onrender.com/auth/google/callback
   GEMINI_API_KEY=your-gemini-api-key
   PORT=4000
   ```
5. Deploy and note the API URL (e.g., `https://your-api.onrender.com`)
6. Update Google Cloud Console OAuth redirect URI to include production callback

### Web (Vercel)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Import your GitHub repository
3. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `apps/web`
   - **Build Command**: `pnpm install --frozen-lockfile && pnpm --filter @app/web build`
4. Add environment variables:
   ```
   NEXT_PUBLIC_API_URL=https://your-api.onrender.com
   ```
5. Deploy and note the web URL (e.g., `https://your-app.vercel.app`)

### Cron Job for Email Ingestion (Render)

1. In Render, go to your API Web Service
2. Add a **Cron Job**:
   - **Schedule**: `*/5 * * * *` (every 5 minutes)
   - **Command**: `curl -X POST https://your-api.onrender.com/tasks/ingest`

Alternatively, use an external service like [cron-job.org](https://cron-job.org/) to call the endpoint.

### Update OAuth redirect URIs

Go back to Google Cloud Console and add production redirect URI:
```
https://your-api.onrender.com/auth/google/callback
```

## Environment Variables Reference

### Root `.env`
| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/gmail_ai` |
| `WEB_URL` | Frontend URL | `http://localhost:3000` |
| `API_URL` | Backend URL | `http://localhost:4000` |
| `GEMINI_API_KEY` | Google Gemini API key | `AIza...` |

### `apps/api/.env`
| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | API server port | No (default: 4000) |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `WEB_URL` | Frontend URL for CORS and redirects | Yes |
| `SESSION_SECRET` | Express session secret | Yes |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Yes |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Yes |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL | Yes |
| `GEMINI_API_KEY` | Gemini API key for categorization | Yes |

### `apps/web/.env`
| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | Yes |

## API Endpoints

### Auth
- `GET /auth/google` – Start Google OAuth flow
- `GET /auth/google/callback` – OAuth callback handler
- `GET /auth/me` – Get current user
- `GET /auth/logout` – Sign out

### Health
- `GET /health` – Simple health check (`{"ok":true}`)

### Categories
- `GET /categories` – List user's categories
- `POST /categories` – Create category (`{ name, description }`)
- `GET /categories/:id` – Get category by ID
- `GET /categories/with-counts?accountId=<id>` – List categories with email counts (optionally filtered by account)

### Emails
- `GET /emails/uncategorized?accountId=<id>` – List uncategorized emails (optionally filtered by account)
- `GET /emails/by-category/:categoryId?accountId=<id>` – List emails in a category (optionally filtered by account)
- `GET /emails/:id` – Get email detail
- `POST /emails/bulk-delete` – Delete emails (`{ emailIds: string[] }`)
- `POST /emails/bulk-unsubscribe` – Queue unsubscribe (`{ emailIds: string[] }`) – placeholder in this MVP

### Tasks
- `POST /tasks/ingest` – Fetch new Gmail messages, categorize, summarize, archive
- `POST /tasks/unsubscribe` – Process unsubscribe URLs for emails (`{ emailIds: string[] }`)
- `POST /tasks/recategorize` – Re-run AI categorization and summaries for recent emails

## Database Schema

```prisma
model User {
  id         String     @id @default(cuid())
  email      String     @unique
  name       String?
  image      String?
  accounts   Account[]
  categories Category[]
  emails     Email[]
}

model Account {
  id                String    @id @default(cuid())
  userId            String
  provider          String
  providerAccountId String
  accessToken       String
  refreshToken      String
  tokenExpiresAt    DateTime?
  emailAddress      String
  emails            Email[]
  ingestCursors     IngestCursor[]
  @@unique([provider, providerAccountId])
}

model Category {
  id          String  @id @default(cuid())
  userId      String
  name        String
  description String
  emails      Email[]
  @@unique([userId, name])
}

model Email {
  id                String    @id @default(cuid())
  userId            String
  accountId         String
  gmailId           String
  threadId          String
  subject           String?
  fromAddress       String?
  toAddress         String?
  receivedAt        DateTime
  snippet           String?
  rawBody           String?
  htmlBody          String?
  unsubscribeUrls   String[]
  categoryId        String?
  aiCategory        String?
  aiSummary         String?
  archived          Boolean   @default(false)
  deleted           Boolean   @default(false)
  unsubscribedAt    DateTime?
  unsubscribeStatus String?
  @@unique([accountId, gmailId])
}

model IngestCursor {
  id            String   @id @default(cuid())
  accountId     String
  historyId     String?
  lastCheckedAt DateTime @default(now())
  @@unique([accountId])
}
```

## Troubleshooting

### "OAuth2Strategy requires a clientID option"
- Ensure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set in `apps/api/.env`

### "Cannot find module '@pkg/db'"
- Run `pnpm --filter @pkg/db build` to generate the package dist output

### Playwright "Executable doesn't exist" error
- Run `cd apps/api && pnpm playwright:install` to install Chromium

### CORS blocked from web during local dev
- Ensure `WEB_URL` is set to `http://localhost:3000` and `PORT` is `4000` in `apps/api/.env`
- The API allows origins `http://localhost:3000` and `http://localhost:3001` by default

### Gmail API quota exceeded
- Reduce ingestion frequency or implement History API incremental sync
- Check [Gmail API quotas](https://developers.google.com/gmail/api/reference/quota)

### Database connection refused
- Verify Postgres container is running: `docker ps`
- Check `DATABASE_URL` matches your Postgres instance

## License

MIT

## Notes

- Gmail scopes require OAuth consent approval; add test users in Google Cloud Console
- Unsubscribe automation success rate depends on website structure and heuristics
- For production, consider rate limiting, error monitoring (Sentry), and DB backups
