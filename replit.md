# Partner License Management Platform

## Overview

This is a **Partner License Management Platform** — a full-stack web application that lets software vendors manage license keys distributed through partner channels. It provides two distinct portals:

- **Partner Portal**: Partners log in to view, generate, and manage license keys assigned to them, plus download reports.
- **Admin Portal**: Administrators manage all partners, generate bulk license keys, and monitor usage across all partners.

The system also handles incoming **webhook events** from partners (purchase, activate, upgrade, downgrade, deactivate) and supports **OAuth-based license assignment flows**.

The app is a monorepo with a React/TypeScript frontend, an Express/TypeScript backend, and a PostgreSQL database accessed through Drizzle ORM.

---

## User Preferences

Preferred communication style: Simple, everyday language.

---

## System Architecture

### Project Layout

The repo has three main zones:
- `client/` — React SPA (frontend)
- `server/` — Express API server (backend)
- `shared/` — Shared TypeScript types and database schema

Both frontend and backend use TypeScript. The `shared/schema.ts` file is the single source of truth for data shapes, used by both sides.

### Frontend Architecture

- **Framework**: React 18 with TypeScript, bundled by Vite
- **Routing**: `wouter` (lightweight client-side router)
- **State/Data Fetching**: TanStack Query (React Query v5) — all API calls go through this
- **UI Components**: shadcn/ui on top of Radix UI primitives, styled with Tailwind CSS
- **Forms**: React Hook Form + `@hookform/resolvers` with Zod validation
- **Charts**: Recharts (via shadcn chart wrapper)
- **Theme**: CSS variables for light/dark mode, custom Tailwind config extending shadcn's "new-york" style

**Key frontend patterns:**
- `App.tsx` contains only route definitions — no logic
- Layout shells (`partner-layout.tsx`, `admin-layout.tsx`) wrap authenticated pages, check auth state, and redirect to login if unauthenticated
- Shared components (`stats-card`, `data-table`, `status-badge`, `empty-state`) are reused across both portals
- Auth state is managed via TanStack Query hitting `/api/partner/auth/me` and `/api/admin/auth/me`
- `client/src/components/ui/` — shadcn primitives; **do not modify these files**

### Backend Architecture

- **Framework**: Express 5 (TypeScript), bootstrapped in `server/index.ts`
- **Database ORM**: Drizzle ORM with PostgreSQL (`drizzle-orm/node-postgres`)
- **Session Management**: `express-session` with `connect-pg-simple` (sessions stored in PostgreSQL)
- **Password Hashing**: Node.js `crypto.scryptSync` with salt (no bcrypt)
- **HMAC Validation**: For webhook signature verification using `crypto.createHmac`
- **API Key Generation**: `crypto.randomBytes`

**Route structure** (all under `/api`):
- `/api/partner/*` — Partner-facing endpoints (login, license CRUD, reports, CSV export)
- `/api/admin/*` — Admin-only endpoints (partner management, bulk key generation)
- `/api/webhooks/*` — Inbound webhook handler from partner systems
- `/api/auth/*` — OAuth callback handler

Routes are split into separate files in `server/routes/` and registered through `server/routes.ts`.

**Service/Storage pattern:**
- `server/storage.ts` defines an `IStorage` interface and a `DatabaseStorage` class — all DB access goes through this abstraction
- Business logic helpers live in `server/services/` (license, partner, webhook services)
- Utility functions in `server/utils/` (crypto, CSV generation, error classes)

**Auth middleware** (`server/middleware/auth.ts`):
- `requirePartnerAuth` — checks session for `partnerUserId` and `partnerId`
- `requireAdminAuth` — additionally checks `isAdmin` flag on session
- Sessions have a 24-hour cookie lifetime

### Database Schema

Defined in `shared/schema.ts` using Drizzle's PostgreSQL table builders. Key tables:

| Table | Purpose |
|---|---|
| `users` | End-users who redeem licenses (linked to partners) |
| `partners` | Partner organizations with API keys, OAuth config, webhook secrets |
| `partner_users` | Portal users (staff of partners or admins) |
| `partner_license_keys` | Individual license keys with status tracking |
| `partner_license_events` | Audit log of all license lifecycle events |
| `key_generation_batches` | Tracks bulk key generation jobs |
| `session` | Auto-created by connect-pg-simple for session storage |

License key statuses: `generated`, `consumed`, `redeemed`, `upgraded`, `downgraded`, `deactivated`

Validation schemas for API inputs are derived from the Drizzle schema using `drizzle-zod`.

### Build System

- **Dev**: `tsx server/index.ts` runs the server; Vite middleware serves the frontend with HMR
- **Production build**: Custom `script/build.ts` runs Vite for the client and esbuild for the server, bundling a curated allowlist of server dependencies to reduce cold-start time
- **DB migrations**: `drizzle-kit push` via `npm run db:push`

---

## External Dependencies

### Database
- **PostgreSQL** — primary data store; required via `DATABASE_URL` environment variable
- Sessions are also stored in PostgreSQL (the `session` table is auto-created)

### Key Environment Variables
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `SESSION_SECRET` | Express session signing secret (falls back to a default in dev) |
| `NODE_ENV` | Controls secure cookies and dev/prod behavior |
| `REPL_ID` | Detected to enable Replit-specific Vite plugins |

### npm Packages (Notable)
| Package | Role |
|---|---|
| `drizzle-orm` + `drizzle-kit` | ORM and schema migrations |
| `drizzle-zod` | Auto-generates Zod schemas from Drizzle tables |
| `express` v5 | HTTP server |
| `express-session` + `connect-pg-simple` | Server-side sessions backed by Postgres |
| `@tanstack/react-query` | Client-side data fetching and caching |
| `wouter` | Lightweight React router |
| `@radix-ui/*` | Accessible UI primitives |
| `recharts` | Charting library |
| `react-hook-form` + `zod` | Form state and validation |
| `nanoid` | Short unique ID generation |
| `date-fns` | Date formatting |

### Replit-Specific Integrations
- `@replit/vite-plugin-runtime-error-modal` — shows runtime errors as an overlay in dev
- `@replit/vite-plugin-cartographer` — Replit source map tooling (dev only)
- `@replit/vite-plugin-dev-banner` — dev environment banner (dev only)

### OAuth / External HTTP
- The OAuth callback route (`server/routes/oauth.ts`) makes outbound HTTP calls to partner systems to exchange auth codes and fetch license info. This is partner-specific and uses `fetch` with dynamic partner URLs constructed from the partner's `name` field.

### Webhook Security
- Inbound webhooks from partners are verified using HMAC-SHA256 signatures. The partner's `webhookSecret` is stored in the database and used to validate `x-webhook-signature` and `x-webhook-timestamp` headers.