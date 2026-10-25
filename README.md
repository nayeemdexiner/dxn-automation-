# Nayeem AI Desk — Smart Personal AI Admin Panel

A production-oriented full-stack web application serving as a secure Smart Personal AI Admin Panel for **Muhammad Nayeem** (Senior CNC Programmer & Designer at Chittagong Door in Hajiganj, Chandpur, Bangladesh).

---

## Architecture & Technology Stack

- **Frontend**: React 19 + TypeScript, Tailwind CSS, Lucide Icons, monochromatic premium dashboard design.
- **Backend**: Node.js + TypeScript + Express full-stack server running on port 3000.
- **Database**: PostgreSQL with schema migrations (`migrations/001_initial_schema.sql`), with seamless fallback to an in-memory/JSON store when PostgreSQL is disconnected.
- **AI Core**: Google Gemini 3.8 Flash accessed strictly server-side using the modern `@google/genai` TypeScript SDK with prompt injection quarantining and language matching (Bangla, Banglish, English).
- **Messaging Integrations**:
  - **Meta WhatsApp Cloud API**: Webhook verification (GET challenge), payload processing (POST), HMAC SHA-256 signature verification (`X-Hub-Signature-256`), idempotency, and 24-hour service-window compliance.
  - **Telegram Bot API**: Push notifications to Muhammad Nayeem's Telegram chat with inline callback actions (`Approve`, `Reject`).
- **Safety Policy**:
  - Automated replies allowed strictly for verified low-risk `faq_business` inquiries.
  - Personal, romantic, emotional, sensitive, financial, or uncertain messages strictly generate drafts held for personal admin approval.

---

## File Structure

```
├── .env.example                     # Environment template with placeholders
├── README.md                        # Documentation & setup guides
├── index.html                       # HTML entry point with metadata
├── metadata.json                    # AI Studio metadata
├── package.json                     # Dependencies and npm scripts
├── server.ts                        # Full-stack Express server with Vite middleware
├── tsconfig.json                    # TypeScript compiler configuration
├── vite.config.ts                   # Vite configuration with Tailwind CSS plugin
├── migrations/
│   └── 001_initial_schema.sql       # PostgreSQL initial schema definition
├── tests/
│   └── run-tests.ts                 # 23 Automated unit tests
└── src/
    ├── App.tsx                      # Primary dashboard controller & state
    ├── index.css                    # Tailwind CSS v4 entry point
    ├── main.tsx                     # React root mount
    ├── components/
    │   ├── LoginModal.tsx           # Secure admin authentication screen
    │   ├── Navbar.tsx               # Top bar with operational indicators
    │   ├── Sidebar.tsx              # Navigation bar with live badges
    │   └── views/
    │       ├── OverviewView.tsx     # Metrics, status pills, pending cards
    │       ├── InboxView.tsx        # Contact stream, message composer & details
    │       ├── PendingApprovalsView.tsx # Approve, Edit, Reject, Regenerate deck
    │       ├── KnowledgeBaseView.tsx# Profile facts, education, services, policies
    │       ├── AISettingsView.tsx   # Rules, categories, language, prompt editor
    │       ├── MemoryView.tsx       # Isolated contact memories & JSON export
    │       ├── IntegrationsView.tsx # WhatsApp, Gemini, Postgres, Telegram health
    │       ├── SimulatorView.tsx    # Live WhatsApp inbound webhook simulator
    │       └── AuditLogsView.tsx    # Immutable security and action logs
    ├── db/
    │   ├── migrate.ts               # Database migration script runner
    │   ├── postgres.ts              # pg.Pool manager & connection tester
    │   └── store.ts                 # Storage repository & verified profile knowledge
    ├── middleware/
    │   └── auth.ts                  # Admin token session validator & rate limiter
    ├── routes/
    │   └── api.ts                   # Express REST API endpoints & webhooks
    ├── services/
    │   ├── gemini.ts                # Server-side Gemini 3.8 Flash service
    │   ├── replyPolicy.ts           # Safety policy & classification logic
    │   ├── telegram.ts              # Telegram bot notifications & callbacks
    │   └── whatsapp.ts              # Meta WhatsApp Graph API & HMAC verification
    └── types/
        └── index.ts                 # Shared TypeScript interfaces
```

---

## Local Setup & Development

### 1. Prerequisites
- Node.js 20+ installed
- npm or pnpm

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your credentials:
- `ADMIN_PASSWORD`: Strong master password for admin login (default for demo: `ChangeMe_NayeemAdmin2026!`).
- `GEMINI_API_KEY`: Your Google Gemini API key.
- `DATABASE_URL`: (Optional) PostgreSQL database connection URL (e.g. `postgresql://postgres:password@localhost:5432/nayeem_ai_desk`).
- `WHATSAPP_VERIFY_TOKEN`: Verification token defined in your Meta Developer App.
- `WHATSAPP_ACCESS_TOKEN`: Meta WhatsApp Cloud API access token.
- `WHATSAPP_PHONE_NUMBER_ID`: WhatsApp sender phone number ID.
- `META_APP_SECRET`: Meta App Secret for HMAC SHA-256 webhook validation.
- `TELEGRAM_BOT_TOKEN`: Bot token from @BotFather.
- `TELEGRAM_ADMIN_CHAT_ID`: Your numerical Telegram user/chat ID.

### 4. Run Automated Unit Tests
```bash
npm test
```
Executes 23 tests validating reply classification, prompt injection quarantining, approval safety gates, WhatsApp GET/POST webhook verification, idempotency duplicate prevention, and contact memory isolation.

### 5. Start Development Server
```bash
npm run dev
```
Launches the full-stack server on `http://localhost:3000`.

---

## Supabase Free-Tier Setup (Beginner Friendly — No Terminal Needed)

You can set up your free PostgreSQL database entirely through your web browser without touching a command line:

### Step 1: Create a Free Project on Supabase
1. Open [https://supabase.com](https://supabase.com) in your browser and sign in (or create a free account).
2. Click **"New Project"**.
3. Enter a Project Name (for example: `nayeem-ai-desk`).
4. Set a strong **Database Password** and **copy/save it somewhere safe** (you will need it for your connection string).
5. Choose the region closest to your users and click **"Create new project"** (free tier includes 500 MB of storage, which is more than enough).

### Step 2: Run the Schema in Supabase SQL Editor
1. In the left-hand sidebar of your Supabase dashboard, click the **SQL Editor** icon (looks like `>_`).
2. Click **"New query"**.
3. Open the file `supabase_schema.sql` from this repository (or click **"1-Click Copy Supabase SQL"** in your app's **Integrations** dashboard).
4. Paste the entire SQL script into the Supabase SQL editor.
5. Click **"Run"** (green button). You will see `"Success. No rows returned"`. All 9 tables, indexes, and initial verified profile facts for Muhammad Nayeem are now created!

### Step 3: Copy Your Supabase Connection String
1. In your Supabase project, click the **Project Settings** icon (gear icon at the bottom of the left sidebar).
2. Click **Database** under Configuration.
3. Scroll down to the **Connection string** section.
4. Select the **URI** tab.
5. In the dropdown, choose **Connection pooling (Session or Transaction mode)**.
6. Copy the connection string. It will look like:
   ```
   postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
   ```
7. Replace `[YOUR-PASSWORD]` in that string with the real database password you chose in Step 1.

---

## Configuring DATABASE_URL in Render

1. Open your [Render Dashboard](https://dashboard.render.com).
2. Click on your **Nayeem AI Desk** Web Service.
3. In the left menu, click **Environment**.
4. Scroll down to the **Environment Variables** section.
5. Click **Add Environment Variable**:
   - **Key**: `DATABASE_URL`
   - **Value**: Paste the Supabase connection string you prepared in Step 3.
6. Click **Save Changes**. Render will automatically redeploy your app.
7. Once deployed, open your app's **Integrations** tab in the admin panel and click **"Test Connection Now"** to verify that your Supabase database is active.

---

## Render Deployment Settings Summary

When creating your Web Service in Render:
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm run start`
- **Environment Variables**:
  - `NODE_ENV` = `production`
  - `PORT` = `3000`
  - `ADMIN_USERNAME` = `nayeem`
  - `ADMIN_PASSWORD` = `[YourStrongPassword]`
  - `DATABASE_URL` = `postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@...` (from Supabase)
  - `GEMINI_API_KEY` = `[Your Gemini Key]`
  - `WHATSAPP_VERIFY_TOKEN` = `[Your Verify Token]`
  - `WHATSAPP_ACCESS_TOKEN` = `[Your WhatsApp System Token]`
  - `WHATSAPP_PHONE_NUMBER_ID` = `[Your Phone Number ID]`
  - `META_APP_SECRET` = `[Your App Secret]`
  - `TELEGRAM_BOT_TOKEN` = `[Your Bot Token]`
  - `TELEGRAM_ADMIN_CHAT_ID` = `[Your Telegram Chat ID]`
6. Click **Deploy Web Service**.

---

## Meta WhatsApp Webhook Setup Guide

1. Go to the **Meta for Developers** portal > **WhatsApp** > **Configuration**.
2. Under **Webhook**, click **Edit**.
3. **Callback URL**: Enter `https://your-domain.com/api/webhooks/whatsapp`.
4. **Verify Token**: Enter the exact string set in `WHATSAPP_VERIFY_TOKEN`.
5. Click **Verify and Save**. Meta will send a GET challenge which Nayeem AI Desk automatically verifies and acknowledges.
6. Under **Webhook fields**, subscribe to `messages`.

---

## Built-in Test Simulator

If you do not have active Meta WhatsApp credentials yet, you can test the entire pipeline using the built-in **Inbound Simulator**:
1. Open the Admin Panel.
2. Click **Inbound Simulator** in the sidebar.
3. Select a preset (e.g. *FAQ / Business in Bangla*, *Personal in Banglish*, *Romantic Safety Gate*, or *Prompt Injection Defense*).
4. Click **Simulate Inbound Webhook Event**.
5. Observe the server-side classification, confidence score, policy gate decision, generated draft, memory extraction, and approval queue update in real-time.
