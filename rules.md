# Coding Rules & Standards

## 1. Project Structure

### Backend (server/)
```
server/
├── db.ts                    # Database connection (single source)
├── index.ts                 # Express app bootstrap (do not modify)
├── routes.ts                # Route registration hub (thin, delegates to route modules)
├── storage.ts               # IStorage interface + DatabaseStorage class
├── static.ts                # Static file serving
├── vite.ts                  # Vite dev server setup
├── middleware/
│   ├── auth.ts              # Authentication middleware (session, partner auth)
│   └── validation.ts        # Request validation middleware (zod-based)
├── routes/
│   ├── admin.ts             # Admin-only API routes
│   ├── partner.ts           # Partner portal API routes
│   └── webhook.ts           # Webhook handler routes
├── services/
│   ├── license.service.ts   # License key generation, lifecycle logic
│   ├── partner.service.ts   # Partner CRUD, stats
│   └── webhook.service.ts   # Webhook processing, HMAC validation
└── utils/
    ├── crypto.ts            # HMAC, hashing helpers
    ├── csv.ts               # CSV generation helpers
    └── errors.ts            # Custom error classes
```

### Frontend (client/src/)
```
client/src/
├── App.tsx                  # Route definitions only
├── main.tsx                 # Entry point (do not modify)
├── index.css                # CSS variables (do not modify)
├── components/
│   ├── ui/                  # Shadcn primitives (do not modify)
│   ├── layout/
│   │   ├── partner-layout.tsx   # Partner portal shell (sidebar + content)
│   │   └── admin-layout.tsx     # Admin portal shell
│   └── shared/
│       ├── stats-card.tsx       # Reusable stat card
│       ├── data-table.tsx       # Reusable data table with pagination
│       ├── status-badge.tsx     # License status badge
│       └── empty-state.tsx      # Empty state placeholder
├── hooks/
│   ├── use-toast.ts         # Toast hook (do not modify)
│   ├── use-mobile.tsx       # Mobile detection (do not modify)
│   └── use-auth.ts          # Partner/admin auth hook
├── lib/
│   ├── queryClient.ts       # TanStack Query setup (do not modify)
│   ├── utils.ts             # cn() helper (do not modify)
│   └── constants.ts         # App-wide constants (statuses, tiers, etc.)
└── pages/
    ├── partner/
    │   ├── login.tsx
    │   ├── dashboard.tsx
    │   ├── licenses.tsx
    │   ├── license-detail.tsx
    │   ├── generate.tsx
    │   └── reports.tsx
    ├── admin/
    │   ├── login.tsx
    │   ├── dashboard.tsx
    │   ├── partners.tsx
    │   └── partner-detail.tsx
    └── not-found.tsx
```

### Shared (shared/)
```
shared/
└── schema.ts               # ALL Drizzle tables, relations, Zod schemas, types
```

## 2. Naming Conventions

### Files
- Use kebab-case for all file names: `license-detail.tsx`, `partner.service.ts`
- Suffix services with `.service.ts`
- Suffix route modules with `.ts` inside `routes/`
- Suffix middleware with `.ts` inside `middleware/`

### Variables & Functions
- Use camelCase for variables and functions: `getLicenseByKey`, `partnerUser`
- Use PascalCase for types, interfaces, components, and classes: `PartnerUser`, `LicenseStatus`
- Use UPPER_SNAKE_CASE for constants: `LICENSE_STATUSES`, `MAX_BATCH_SIZE`

### Database
- Use snake_case for table and column names: `partner_license_keys`, `license_key`
- Table names are plural: `partners`, `users`, `partner_license_keys`
- Foreign keys end with `_id`: `partner_id`, `user_id`
- Timestamps use `_at` suffix: `created_at`, `consumed_at`

### API Routes
- Prefix all routes with `/api`
- Use kebab-case for multi-word segments: `/api/partner/license-keys`
- Use RESTful naming: `GET /api/partner/licenses`, `POST /api/partner/licenses/generate`

## 3. TypeScript Rules

### General
- Enable strict mode; never use `any` unless absolutely unavoidable
- Define all types in `shared/schema.ts` using Drizzle `$inferSelect` / `$inferInsert`
- Use Zod schemas (via `drizzle-zod`) for request validation
- Always type function parameters and return values
- Prefer `interface` for object shapes, `type` for unions/intersections

### Import Order
1. Node built-ins (`crypto`, `path`)
2. External packages (`express`, `drizzle-orm`)
3. Internal aliases (`@shared/schema`, `@/components/ui/button`)
4. Relative imports (`./utils`, `../services`)

### Avoid
- Default exports for non-components (use named exports)
- Barrel files (`index.ts` re-exporting everything)
- Circular imports
- Magic numbers (use named constants)

## 4. Backend Rules

### Route Handlers
- Keep route handlers thin: validate → call service → respond
- Always return consistent JSON shape: `{ data }` for success, `{ message, error? }` for errors
- Use proper HTTP status codes: 200, 201, 400, 401, 403, 404, 500
- Validate all request bodies with Zod before passing to services

```typescript
app.post("/api/partner/licenses/generate", requirePartnerAuth, async (req, res) => {
  const parsed = generateLicensesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input", error: parsed.error.flatten() });
  }
  const result = await storage.generateLicenseKeys(req.partnerId!, parsed.data);
  return res.status(201).json(result);
});
```

### Storage Interface
- All database operations go through `IStorage` interface in `storage.ts`
- Never import `db` directly in route handlers
- Each method should handle one logical operation
- Use transactions for multi-step operations

### Error Handling
- Throw typed errors from services
- Catch and format in route handlers
- Never expose raw database errors to clients
- Log errors with context (userId, licenseKey, etc.)

### Security
- Validate HMAC signatures on all webhook requests
- Hash passwords with bcrypt (cost factor 12)
- Use express-session with PostgreSQL store
- Rate limit authentication endpoints
- Never log secrets, tokens, or passwords

## 5. Frontend Rules

### Components
- One component per file (except tightly coupled sub-components)
- Props interfaces defined at the top of the file
- Use Shadcn UI components for all interactive elements
- Always add `data-testid` attributes to interactive elements
- Handle loading, error, and empty states for every data-fetching component

### Data Fetching
- Use TanStack Query v5 object syntax: `useQuery({ queryKey, queryFn })`
- Use `apiRequest` from `@/lib/queryClient` for mutations
- Invalidate cache after mutations using `queryClient.invalidateQueries`
- Use array-style query keys: `['/api/partner/licenses', id]`

```typescript
const { data, isLoading } = useQuery<License[]>({
  queryKey: ['/api/partner/licenses'],
});

const mutation = useMutation({
  mutationFn: (data: GeneratePayload) => apiRequest("POST", "/api/partner/licenses/generate", data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['/api/partner/licenses'] });
    toast({ title: "Keys generated" });
  },
});
```

### Forms
- Use `react-hook-form` with `zodResolver` for all forms
- Derive form schemas from Drizzle insert schemas using `.extend()` or `.pick()`
- Always provide default values to `useForm`

### Styling
- Use Tailwind utility classes exclusively (no inline styles, no CSS modules)
- Use CSS variables from `index.css` via Tailwind config
- Follow spacing scale: 1, 2, 3, 4, 6, 8, 12, 16, 24
- Use `cn()` utility for conditional class merging

### Routing
- Use `wouter` for all navigation (`Link`, `useLocation`)
- Never use `window.location` directly
- Define all routes in `App.tsx`

## 6. Database Rules

### Schema
- Define all tables in `shared/schema.ts`
- Always define Drizzle `relations()` for foreign keys
- Use `serial` for auto-increment IDs
- Use `uuid` type for license keys
- Add indexes for frequently queried columns
- Use `.notNull()` for required fields
- Use `.default()` for server-generated values

### Migrations
- Never write raw SQL migrations
- Use `npm run db:push` to sync schema changes
- Check data existence before seeding to avoid duplicates

### Queries
- Use Drizzle query builder (not raw SQL) for all operations
- Use `eq()`, `and()`, `or()` from `drizzle-orm` for conditions
- Use `.returning()` on inserts/updates to get the result
- Use transactions for multi-table operations

## 7. Security Rules

- Never expose API keys, secrets, or tokens in client code
- Store all secrets in environment variables
- Validate all external input (webhooks, OAuth callbacks, form data)
- Use HMAC SHA-256 for webhook signature verification
- Use `crypto.timingSafeEqual` for signature comparison (prevent timing attacks)
- Session cookies must be httpOnly and secure in production
- Partner users can only access their own partner's data (scope enforcement)

## 8. Testing Checklist

Before considering a feature complete:
- [ ] Happy path works end-to-end
- [ ] Error states handled gracefully (toast, inline error, redirect)
- [ ] Loading states shown during async operations
- [ ] Empty states displayed when no data exists
- [ ] Input validation works (frontend + backend)
- [ ] Unauthorized access returns 401/403
- [ ] Cross-partner data isolation verified
