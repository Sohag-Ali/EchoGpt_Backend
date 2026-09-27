# EchoGPT Backend API

EchoGPT Backend is a production-ready REST API built with NestJS, TypeScript, PostgreSQL, Prisma ORM, and Redis. It powers a multi-provider AI assistant application featuring conversational AI chat with Server-Sent Events (SSE) streaming, real-time web search with Redis caching, bKash tokenized payment integration for automated subscription upgrades, multi-tier user role management, and centralized API usage auditing.

---

## 📌 Overview

EchoGPT is an AI-powered assistant system designed to help users interact seamlessly with multiple artificial intelligence models (such as OpenAI GPT-4o, Google Gemini, and Anthropic Claude) and perform live web searches. 

### Key Problems Solved:
* **Multi-Provider AI Access:** Eliminates vendor lock-in by providing a unified interface across OpenAI, Google Gemini, and Anthropic.
* **Cost & Rate Limit Management:** Controls API costs with automated user subscription tiers (`FREE` and `PREMIUM`) and monthly request limits.
* **Low Latency & Fast Search:** Uses Redis caching for web search queries to reduce latency and external API consumption.
* **Secure Payment Integration:** Automates subscription upgrades via seamless bKash tokenized payment processing.

---

## ✨ Features

### 🔑 Authentication
* **Two-Step Registration with OTP:** Email registration requires 6-digit OTP verification dispatched via email and stored temporarily in Redis.
* **Google OAuth2 Sign-In:** Authenticates users via Google ID Tokens, automatically initializing user profiles and default subscriptions.
* **JWT Token Security:** Issues Access Tokens (24h expiry) and Refresh Tokens (7-day expiry) delivered via secure, HttpOnly cookies and JSON payloads.
* **Session Tracking & Revocation:** Persists active sessions in PostgreSQL with the ability to revoke sessions upon logout or password reset.
* **Password Management:** Secure password reset via email OTP and single-use verification links.

### 👤 User & Profile Management
* **Account Control:** Profile retrieval, account deactivation, and password updates.
* **Cloudinary Avatar Uploads:** Direct profile picture uploads (`profileImage` up to 5MB, supporting JPG, PNG, WEBP) hosted on Cloudinary.
* **Rich User Profiles:** Manages personal info, bio, contact details, address, date of birth, and social links (GitHub, LinkedIn, Website).

### 🤖 AI Chat & SSE Streaming
* **Multi-Provider AI Chat:** Supports conversational threads with system prompts and custom titles.
* **Real-time SSE Streaming:** Streams AI responses chunk-by-chunk using Server-Sent Events (`text/event-stream`).
* **Chat Management:** Paginated chat history, pinning key threads, archiving, and message deletion.

### 🔌 AI Providers & Factory Architecture
* **Dynamic Provider Factory:** Automatically selects active default or requested AI providers (OpenAI, Gemini, Anthropic).
* **API Key Encryption:** Encrypts sensitive provider API keys using AES-256-GCM.
* **Provider Health Monitoring:** Automated active health checks for AI providers.

### 💳 Subscriptions & Payments
* **Subscription Tiers:** `FREE` plan (50 requests/month) and `PREMIUM` plan.
* **Automated Limit Enforcement:** Pre-execution check blocks API usage when monthly quota is reached.
* **bKash Tokenized Payment Integration:** Supports subscription upgrade payments via bKash sandbox payment gateway with callback verification and automatic plan activation.

### 🔎 Web Search Engine
* **Web Search Integration:** Live web search querying with structured search results.
* **Redis Caching Layer:** Caches search results in Redis to provide instant cached responses for repetitive queries.
* **Search Analytics:** Tracks user search history and recent queries.

### 👑 Admin Management
* **Admin Dashboard:** High-level metrics for total users, subscriptions, monthly API requests, and active providers.
* **User & Role Administration:** Paginated user directory, role assignment (`USER`, `ADMIN`), active status toggles, and user deletion.
* **Subscription Management:** View user subscription status and manually adjust user plans.
* **Provider Configuration:** Create, update, toggle active status, and monitor AI Provider health.

### 📊 API Usage Audit Logging
* **Centralized Audit Logger:** Automatically logs endpoint, request type (`CHAT`, `CHAT_STREAM`, `WEB_SEARCH`), provider, model, token usage, latency (ms), cost estimation, and status (`SUCCESS`, `FAILED`).

---

## 👤 How the User Uses EchoGPT

```text
1. Registration & OTP Verification
   ↓
2. Login (JWT Token Issued in HttpOnly Cookie)
   ↓
3. Free Subscription Auto-Assigned (50 Requests/Month)
   ↓
4. AI Chat / SSE Streaming / Live Web Search
   ↓
5. Pre-execution Usage Limit Check & Increment
   ↓
6. Upgrade Plan via bKash Payment
   ↓
7. Automatic Premium Subscription Activation
```

1. **Sign Up:** User enters name, email, and password. A 6-digit OTP is sent to their email.
2. **Verify OTP:** User enters the OTP. Upon validation, the user account, profile, and FREE subscription (50 monthly requests) are created in PostgreSQL.
3. **Log In:** User logs in via email/password or Google Sign-In to receive JWT tokens.
4. **Use AI Chat & Web Search:** User sends prompts or search queries. The backend verifies subscription limits, routes requests to AI providers or search engines, and streams real-time responses.
5. **Manage Profile:** User updates profile details and uploads a profile picture stored on Cloudinary.
6. **Upgrade Subscription:** If request limits are reached, the user initiates a bKash payment, completes checkout, and gets automatically upgraded to `PREMIUM`.

---

## 👑 How Admin Uses EchoGPT

```text
Admin Login → Protected by @Roles(ADMIN) Guard
   ↓
├── View Dashboard Metrics (Users, Requests, Subscriptions)
├── Manage Users (Search, Change Roles, Deactivate, Delete)
├── Manage Subscriptions (Monitor Usage, Adjust Limits)
├── Configure AI Providers (Add Keys, Set Defaults, Run Health Checks)
└── Inspect API Usage Logs & System Health
```

---

## 🤖 AI Chat Architecture

```text
   +-----------------------+
   |   Client / Frontend   |
   +-----------------------+
               |
               v  POST /api/v1/chats or /api/v1/chats/stream
   +-----------------------+
               |
               v
   +-----------------------+
   |    SubscriptionsService | --> (Checks & Enforces Monthly Limit)
   +-----------------------+
               |
               v
   +-----------------------+
   |    ProviderFactory    | --> Resolves requested or default provider
   +-----------------------+
               |
     +---------+---------+
     |                   |
     v                   v
+------------------+  +-------------------+
|  OpenAiService   |  |   GeminiService   | (or AnthropicService)
+------------------+  +-------------------+
     |                   |
     +---------+---------+
               |
               v
   +-----------------------+
   | Save Chat & Messages  | --> Persisted in PostgreSQL
   +-----------------------+
               |
               v
   +-----------------------+
   |   UsageLogsService    | --> Audit Log recorded in PostgreSQL
   +-----------------------+
```

---

## 🔐 Authentication Flow

```text
Normal Registration:
User Request -> Generate 6-digit OTP -> Store Hash in Redis (5 min TTL) -> Email Sent
User Enters OTP -> Validate Redis Hash -> Create User + Profile + FREE Subscription -> Revoke OTP

Google Authentication:
Google ID Token -> Verify Token via Google OAuth2 Client -> Extract Email/Name/Picture
Check/Create User + Profile + FREE Subscription -> Set HttpOnly Cookies -> Issue JWT
```

---

## 💳 Subscription & Payment Flow (bKash)

```text
User Request (Upgrade Plan)
  ↓
Create PENDING Payment Record in PostgreSQL
  ↓
Call bKash Payment API (Create Grant Token & Payment)
  ↓
Return bKash Payment URL to Client
  ↓
User Completes Payment on bKash Gateway
  ↓
bKash Callback / Execute Endpoint (`/payments/bkash/execute`)
  ↓
Verify bKash Transaction & Update Payment Status to COMPLETED
  ↓
Automatically Upgrade User Subscription to PREMIUM
```

---

## 🖼️ Profile & Image Management

* **Update Profile:** `PATCH /api/v1/users/me/profile` accepts JSON or `multipart/form-data`.
* **Image Upload:** Uploaded files (`profileImage` parameter, max 5MB) are intercepted by NestJS `FileInterceptor` and uploaded directly to Cloudinary folder `echogpt/profile-images/:userId`.
* **Database Synchronization:** Secure Cloudinary HTTPS URL is stored in `UserProfile` (`profileImageUrl`) and synchronized with `User.avatarUrl`.

---

## 🔎 Web Search Architecture

* **Search API:** `POST /api/v1/search`
* **Redis Caching:** Before calling external search services, the backend checks Redis (`SearchCacheService`).
  * **Cache HIT:** Returns cached search results instantly with latency logging.
  * **Cache MISS:** Fetches live search results, caches the result in Redis with TTL, increments user subscription usage, and logs history.

---

## 📊 API Usage & Analytics

Every AI chat and web search request is audited by `UsageLogsService`:

| Logged Field | Description |
| :--- | :--- |
| `userId` | ID of the authenticated user making the request |
| `endpoint` | API endpoint accessed (e.g., `/api/v1/chats`, `/api/v1/search`) |
| `requestType` | Enum: `CHAT`, `CHAT_STREAM`, or `WEB_SEARCH` |
| `providerId` | ID of the AI provider used (nullable for web search) |
| `modelName` | Model used (e.g., `gpt-4o`, `gemini-3.8-flash`) |
| `promptTokens` | Number of tokens in input prompt |
| `completionTokens` | Number of tokens in AI response |
| `totalTokens` | Total tokens consumed |
| `estimatedCost` | Calculated cost in USD based on provider pricing |
| `latencyMs` | Response latency in milliseconds |
| `status` | Enum: `SUCCESS` or `FAILED` |

---

## 🏗️ Architecture

```text
                         +-----------------------+
                         |   Client / Extension  |
                         +-----------------------+
                                     |
                                     v HTTP / REST / SSE
                         +-----------------------+
                         |     NestJS API        |
                         |   (Global Prefix:     |
                         |     /api/v1)          |
                         +-----------------------+
                                     |
            +------------------------+------------------------+
            |                        |                        |
            v                        v                        v
  +-------------------+    +--------------------+   +-------------------+
  |   PostgreSQL DB   |    |    Redis Cache     |   | Cloudinary / Mail |
  |   (Prisma ORM)    |    |  (ioredis Service) |   | (SMTP / Avatars)  |
  +-------------------+    +--------------------+   +-------------------+
```

---

## 🗄️ Database Schema & Models

Organized multi-file Prisma schema located in `prisma/`:

```text
prisma/
├── schema.prisma (Root Configuration: Generator & Datasource)
├── models/
│   ├── user.prisma         (User, UserProfile models)
│   ├── role.prisma         (Role model & RoleType enum)
│   ├── session.prisma      (Session model)
│   ├── subscription.prisma (Subscription model & SubscriptionPlan, SubscriptionStatus enums)
│   ├── payment.prisma      (Payment model & PaymentProvider, PaymentStatus enums)
│   ├── ai-provider.prisma  (AIProvider model & ProviderType enum)
│   ├── chat.prisma         (Chat, Message models & MessageRole enum)
│   ├── web-search.prisma   (WebSearch model & WebSearchStatus enum)
│   ├── api-usage-log.prisma(ApiUsageLog model & ApiRequestType, ApiUsageStatus enums)
│   └── token.prisma        (EmailVerificationToken, PasswordResetToken models)
├── migrations/             (Prisma migration SQL history)
└── seed.ts                 (Database Seeder & Data Consistency Repair script)
```

---

## 📁 Project Structure

```text
src/
├── admin/                  # Admin management dashboard, analytics & user controls
├── auth/                   # Authentication, OTP, Google OAuth2, JWT & sessions
├── chats/                  # AI Chat threads, SSE streaming & message handling
├── cloudinary/             # Cloudinary image upload module
├── common/                 # Guards, decorators, DTOs & exception filters
├── config/                 # Environment configuration mapping
├── mail/                   # SMTP email service using Nodemailer
├── payments/               # bKash payment gateway integration & execution
├── prisma/                 # Prisma client service wrapper
├── providers/              # AI Provider Factory (OpenAI, Gemini, Anthropic)
├── redis/                  # Redis caching service
├── searches/               # Web search execution & Redis cache service
├── subscriptions/          # Subscription plan limits & quota enforcement
├── usage-logs/             # Centralized API audit logging service
├── users/                  # User profile management & account operations
├── app.controller.ts       # Health check & test endpoints
├── app.module.ts           # Root application module
└── main.ts                 # Bootstrap file, CORS, ValidationPipe & Swagger setup
```

---

## 🛠️ Technology Stack

| Technology | Purpose |
| :--- | :--- |
| **Node.js** | JavaScript Runtime Environment |
| **TypeScript** | Strongly Typed Programming Language |
| **NestJS** | Progressive Node.js Framework |
| **PostgreSQL** | Relational Database Management System |
| **Prisma ORM** | Next-generation Database Toolkit & Query Builder |
| **Redis (ioredis)**| In-memory Cache, Rate-limiting & OTP Store |
| **JWT & Passport** | Authentication & Token Management |
| **bKash Sandbox API** | Mobile Financial Payment Gateway Integration |
| **Cloudinary SDK** | Cloud Image Hosting for User Avatars |
| **Google Auth Library** | Google OAuth2 Token Verification |
| **Nodemailer** | SMTP Email Dispatcher |
| **Swagger / OpenAPI** | Interactive API Documentation |
| **Vitest** | Unit & E2E Testing Framework |

---

## 🚀 Getting Started

### 1. Prerequisites
* **Node.js**: v18 or higher
* **PostgreSQL**: Running instance or Neon PostgreSQL URL
* **Redis**: Running Redis instance

### 2. Clone Repository & Install Dependencies
```bash
git clone https://github.com/Sohag-Ali/EchoGpt_Backend.git
cd echogpt_backend
npm install
```

### 3. Setup Environment Variables
Copy `.env.example` to `.env` and populate your environment variables:
```bash
cp .env.example .env
```

### 4. Database Setup & Seed
Run Prisma commands to generate client and seed default roles/providers:
```bash
npm run prisma:generate
npm run seed
```

### 5. Start Development Server
```bash
npm run start:dev
```
The server will start at `http://localhost:5000/api/v1`.

---

## 🔑 Environment Variables

| Variable | Description | Required |
| :--- | :--- | :---: |
| `PORT` | Server Port (Default: `5000`) | Yes |
| `API_PREFIX` | Global API route prefix (Default: `api/v1`) | Yes |
| `DATABASE_URL` | PostgreSQL Connection String | Yes |
| `JWT_ACCESS_SECRET` | Secret key for signing Access Tokens | Yes |
| `JWT_REFRESH_SECRET` | Secret key for signing Refresh Tokens | Yes |
| `GOOGLE_CLIENT_ID` | Google OAuth2 Client ID | Yes |
| `AI_PROVIDER_ENCRYPTION_KEY` | 32-byte key for AES-256-GCM API key encryption | Yes |
| `REDIS_HOST` | Redis Server Host | Yes |
| `REDIS_PORT` | Redis Server Port | Yes |
| `REDIS_PASSWORD` | Redis Password | Optional |
| `SMTP_HOST` | SMTP Server Host (e.g., `smtp.gmail.com`) | Yes |
| `SMTP_USER` | SMTP Username/Email | Yes |
| `SMTP_PASSWORD` | SMTP Password / App Password | Yes |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary Account Cloud Name | Yes |
| `CLOUDINARY_API_KEY` | Cloudinary API Key | Yes |
| `CLOUDINARY_API_SECRET` | Cloudinary API Secret | Yes |
| `BKASH_BASE_URL` | bKash Sandbox Gateway URL | Yes |
| `BKASH_APP_KEY` | bKash App Key | Yes |
| `BKASH_APP_SECRET` | bKash App Secret | Yes |

---

## 📚 Swagger API Documentation

Interactive Swagger API documentation is automatically generated upon application startup.

* **Swagger UI URL**: `http://localhost:5000/api/docs`
* **OpenAPI JSON Spec**: `http://localhost:5000/api/docs-json`

To authorize requests in Swagger UI:
1. Log in via `/api/v1/auth/login` to obtain an access token.
2. Click **Authorize** at the top right of the Swagger UI page.
3. Enter `Bearer <YOUR_ACCESS_TOKEN>` into the `JWT-auth` input field.

---

## 📮 Postman Collection

A complete Postman collection is included in the root directory:
📁 [`EchoGpt.postman_collection.json`](file:///e:/Project/EchoGPT%20Backend/echogpt_backend/EchoGpt.postman_collection.json)

### Included Request Folders:
* **Auth**: Registration, OTP Verification, Resend OTP, Login, Google Login, Refresh Token, Password Reset, Logout.
* **Users management**: Profile Query, Profile Update, Password Change, Deactivation.
* **Chats API**: AI Response Generation, SSE Streaming (`/chats/stream`), Chat History.
* **Subscriptions API**: Query Active Subscription & Limits, Plan Upgrade.
* **Payments API**: bKash Payment Initiation & Execution.

---

## 🧪 Testing

The repository uses **Vitest** for testing:

```bash
# Run unit tests
npm run test

# Run End-to-End (E2E) tests
npm run test:e2e

# Run test coverage report
npm run test:cov
```

---

## 🔒 Security Implementation

* **Password Hashing:** Passwords hashed with `bcrypt` using configurable salt rounds.
* **Dual-Token JWT Security:** Access Tokens delivered via HttpOnly cookies and JSON payloads.
* **Data Encryption:** Sensitivity-critical data (such as third-party AI provider API keys) encrypted via AES-256-GCM.
* **OTP Rate Limiting & Cooldowns:** 5-minute OTP expiry, 60-second resend cooldowns, and 5-attempt brute-force protection enforced in Redis.
* **Role-Based Access Control (RBAC):** NestJS `@Roles()` decorator and `RolesGuard` enforcing `USER` vs `ADMIN` permissions.
* **Strict Payload Validation:** Global NestJS `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true`.

---

## 👨‍💻 Developer

**Sohag Ali**  
*Senior Software Engineer / Backend Specialist*

* **Portfolio:** [sohag-ali.vercel.app](https://portfolio-sohag-ali.vercel.app/)
* **GitHub:** [github.com/Sohag-Ali](https://github.com/Sohag-Ali)
* **LinkedIn:** [linkedin.com/in/sohag-ali-bd](https://www.linkedin.com/in/sohag-ali-bd)

---

## 📦 Deliverables Included

- ✅ Complete NestJS Source Code (`src/`)
- ✅ Multi-File Prisma Schema (`prisma/schema.prisma` & `prisma/models/`)
- ✅ Database Migration History (`prisma/migrations/`)
- ✅ Database Seeder & Repair Script (`prisma/seed.ts`)
- ✅ Interactive Swagger/OpenAPI Documentation (`/api/docs`)
- ✅ Postman Collection (`EchoGpt.postman_collection.json`)
- ✅ Environment Variable Blueprint (`.env.example`)
- ✅ Comprehensive Technical Documentation (`README.md`)

---

## ⚠️ Security Notice

> **IMPORTANT:** Never commit the `.env` file containing sensitive credentials to public source control. Keep `.env` in `.gitignore` and only share `.env.example`.
