---
name: nextjs-bestpractices
description: >
  Comprehensive best practices for building production-grade Next.js applications.
  Use this skill whenever the user asks to create, scaffold, review, or improve a
  Next.js project — including App Router architecture, Server/Client Components,
  data fetching, caching, authentication, database access, API design, performance
  optimization, testing, deployment, and project structure. Also trigger when the
  user mentions Next.js patterns like RSC, Server Actions, middleware, route handlers,
  parallel/intercepting routes, or asks about React Server Components best practices.
  Trigger even for partial tasks like "add auth to my Next.js app" or "optimize my
  Next.js performance". If the user is working on a Next.js project, consult this skill.
---

# Next.js Best Practices

This skill provides battle-tested patterns and conventions for building production-grade
Next.js applications using the App Router (Next.js 14/15+). Follow these guidelines when
scaffolding new projects, reviewing existing code, or advising on architecture decisions.

For deeper dives on specific topics, read the corresponding file in `references/`:

| Topic | File | When to read |
|---|---|---|
| Project structure & conventions | `references/structure.md` | Scaffolding or reorganizing a project |
| Data fetching & caching | `references/data-fetching.md` | Working with APIs, databases, or Server Actions |
| Performance & Core Web Vitals | `references/performance.md` | Optimizing speed, bundle size, INP, LCP |
| Authentication & security | `references/auth-security.md` | Adding auth, middleware, CSRF, headers |
| Database & ORM patterns | `references/database.md` | Prisma, Drizzle, MongoDB, connection pooling |
| Testing strategy | `references/testing.md` | Setting up or improving tests |
| Deployment & DevOps | `references/deployment.md` | Vercel, Docker, self-hosted, CI/CD |
| Styling patterns | `references/styling.md` | Tailwind, CSS Modules, design systems |

---

## Core Principles

### 1. Server-First by Default

Think server-first. Every component is a Server Component unless it needs interactivity.

```
# Decision tree for component type:
Does it use useState, useEffect, event handlers, or browser APIs?
  → YES → Add "use client" directive
  → NO  → Keep as Server Component (default, no directive needed)
```

Key rules:
- Never add `"use client"` preemptively. Start as Server Component, convert only when needed.
- Push `"use client"` boundaries as deep as possible in the component tree.
- Extract interactive parts into small Client Components; keep the parent as Server Component.
- Server Components can import Client Components, but NOT vice versa. Pass Server Component content to Client Components via `children` or props.

```tsx
// GOOD — Server Component wrapping a Client island
import { InteractiveCounter } from './counter' // Client Component

export default async function Dashboard() {
  const data = await fetchMetrics() // runs on server
  return (
    <section>
      <h1>Dashboard</h1>
      <MetricsTable data={data} />       {/* Server Component */}
      <InteractiveCounter />              {/* Client island */}
    </section>
  )
}
```

### 2. Colocation over Convention

Keep related files together. A feature's components, hooks, types, utils, and tests live in the same directory — not scattered across top-level folders.

### 3. Progressive Enhancement

Forms and navigation should work without JavaScript where possible. Use Server Actions for mutations. Use `<Link>` for navigation. Provide `loading.tsx` and `error.tsx` at every meaningful layout boundary.

### 4. Type Safety End-to-End

TypeScript everywhere. Validate at boundaries (API routes, Server Actions, external data) with Zod or similar. Never trust `any`.

---

## Quick Reference: Common Patterns

### Route Organization (App Router)

```
app/
├── (marketing)/          # Route group — no URL impact
│   ├── layout.tsx        # Shared marketing layout
│   ├── page.tsx          # Home page
│   └── about/page.tsx
├── (dashboard)/
│   ├── layout.tsx        # Dashboard layout with sidebar
│   ├── dashboard/page.tsx
│   └── settings/page.tsx
├── api/
│   └── webhooks/
│       └── route.ts      # API route handler
├── layout.tsx            # Root layout (html, body, providers)
├── loading.tsx           # Global loading UI
├── error.tsx             # Global error boundary
├── not-found.tsx         # 404 page
└── global-error.tsx      # Root error boundary (wraps layout)
```

### Server Actions

```tsx
// app/actions/user.ts
'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100),
  bio: z.string().max(500).optional(),
})

export async function updateProfile(formData: FormData) {
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorized')

  const parsed = updateProfileSchema.safeParse({
    name: formData.get('name'),
    bio: formData.get('bio'),
  })

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  await db.user.update({
    where: { id: session.user.id },
    data: parsed.data,
  })

  revalidatePath('/profile')
  return { success: true }
}
```

Rules for Server Actions:
- Always validate input with Zod — never trust FormData directly.
- Always check authentication/authorization inside the action.
- Return structured results `{ error }` or `{ success }` — don't throw for validation errors.
- Use `revalidatePath` or `revalidateTag` after mutations.
- Place in separate `'use server'` files, not inline in Client Components.

### Data Fetching

```tsx
// Fetch in Server Components — no useEffect needed
export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const product = await getProduct(id) // direct async call
  if (!product) notFound()

  return <ProductDetail product={product} />
}
```

Key data fetching rules:
- Fetch data in Server Components, pass to Client Components as props.
- Use `fetch()` with Next.js caching extensions or use `unstable_cache` for non-fetch data.
- Deduplicate requests — Next.js auto-deduplicates `fetch()` calls with the same URL in a single render pass.
- Use Suspense boundaries for streaming: wrap slow data fetches in `<Suspense fallback={...}>`.
- For more patterns, read `references/data-fetching.md`.

### Error Handling

```tsx
// app/dashboard/error.tsx
'use client' // Error boundaries MUST be Client Components

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div role="alert">
      <h2>Something went wrong</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  )
}
```

Place `error.tsx` at meaningful layout boundaries. Use `global-error.tsx` at the root to catch layout-level errors (it replaces `<html>` and `<body>`).

### Metadata & SEO

```tsx
// Static metadata
export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Manage your account',
}

// Dynamic metadata
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = await getPost(slug)
  return {
    title: post.title,
    openGraph: { images: [post.coverImage] },
  }
}
```

- Use the Metadata API — never manual `<head>` tags.
- Provide `generateStaticParams` for static routes to enable SSG.
- Add `robots.ts`, `sitemap.ts`, and `opengraph-image.tsx` in the `app/` root.

### Middleware

```tsx
// middleware.ts (project root)
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Auth check, redirects, headers, geolocation, A/B tests
  const token = request.cookies.get('session')

  if (!token && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}
```

Middleware rules:
- Keep middleware lightweight — it runs on every matched request (Edge runtime).
- Don't do heavy computation or database queries in middleware.
- Use `matcher` to limit which routes trigger middleware.
- Middleware is for cross-cutting concerns: auth redirects, headers, geo-routing, rate limiting.

---

## Environment Variables

```
# .env.local (never committed)
DATABASE_URL=postgresql://...
AUTH_SECRET=...

# .env (committed, non-sensitive defaults)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- Prefix with `NEXT_PUBLIC_` only if the value must be available in the browser.
- Never expose secrets with `NEXT_PUBLIC_`.
- Validate env vars at build time with `@t3-oss/env-nextjs` or a Zod schema.
- Use `.env.local` for secrets, `.env` for non-sensitive defaults.

---

## Common Anti-Patterns to Avoid

| Anti-Pattern | Why It's Bad | Do This Instead |
|---|---|---|
| `"use client"` on every component | Kills SSR benefits, bloats JS bundle | Only add when interactivity is needed |
| `useEffect` for data fetching | Waterfalls, loading spinners, no SSR | Fetch in Server Components |
| Wrapping entire app in context providers | Forces everything to Client Components | Keep providers in a `providers.tsx` Client Component, wrap only in root layout |
| `fetch` in `useEffect` + `useState` | Race conditions, no caching | Use Server Components or React Query for client data |
| Storing auth tokens in localStorage | XSS vulnerability | Use httpOnly cookies |
| Giant `page.tsx` files | Unreadable, hard to test | Extract into composable components |
| Not using `loading.tsx` | Blank screen during navigation | Add `loading.tsx` at route segment level |
| Ignoring TypeScript errors | Runtime crashes in production | Fix all type errors, use `strict: true` |
| Direct database calls in Client Components | Exposes credentials, insecure | Use Server Actions or Route Handlers |
| Not validating Server Action input | Injection attacks, data corruption | Always validate with Zod |

---

## Recommended Stack

When the user doesn't have preferences, suggest this well-tested combination:

| Layer | Tool | Notes |
|---|---|---|
| Framework | Next.js 15+ (App Router) | Always App Router unless maintaining Pages Router legacy |
| Language | TypeScript (strict) | `strict: true` in tsconfig |
| Styling | Tailwind CSS v4 | Utility-first, great DX with Next.js |
| UI Components | shadcn/ui | Copy-paste components, full control |
| Forms | React Hook Form + Zod | `useForm` + `zodResolver` |
| Auth | NextAuth.js v5 / Lucia / Better Auth | Session-based with httpOnly cookies |
| ORM | Prisma / Drizzle | Type-safe database access |
| Validation | Zod | Shared schemas between client and server |
| State (client) | Zustand / Jotai | Only for true client-side state |
| Data fetching (client) | TanStack Query | For Client Component data needs |
| Testing | Vitest + Playwright | Unit + E2E |
| Linting | ESLint + `eslint-config-next` | Includes Next.js specific rules |
| Formatting | Prettier + `prettier-plugin-tailwindcss` | Auto-sort Tailwind classes |

---

## Checklist: Before Shipping

Use this as a final review checklist:

- [ ] All pages have `metadata` or `generateMetadata`
- [ ] `loading.tsx` and `error.tsx` at key route segments
- [ ] Server Actions validate input with Zod
- [ ] Auth checks in every protected Server Action and Route Handler
- [ ] No secrets exposed via `NEXT_PUBLIC_`
- [ ] Images use `<Image>` component with proper `width`/`height` or `fill`
- [ ] `next.config.ts` has security headers configured
- [ ] Bundle analyzed — no unexpected large client-side dependencies
- [ ] Lighthouse score > 90 on all metrics
- [ ] `robots.ts` and `sitemap.ts` present
- [ ] Error monitoring configured (Sentry, etc.)
- [ ] Rate limiting on public API routes
