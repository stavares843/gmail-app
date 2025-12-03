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
  
Due to API/model usage, each ingest run fetches up to 50 recent emails from the last 30 days by default.

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

## License

MIT

## Notes

- Gmail scopes require OAuth consent approval, test users must be added in Google Cloud Console
- Unsubscribe automation success rate depends on website structure and heuristics
