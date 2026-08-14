# Data Fetching & Caching

## Table of Contents
1. Server Component Data Fetching
2. Caching Strategies
3. Server Actions (Mutations)
4. Client-Side Data Fetching
5. Streaming & Suspense
6. Parallel & Sequential Fetching
7. Revalidation Patterns

---

## 1. Server Component Data Fetching

Fetch data directly in Server Components — no hooks, no `useEffect`, no loading state management.

```tsx
// app/products/page.tsx
import { getProducts } from '@/services/product-service'

export default async function ProductsPage() {
  const products = await getProducts()

  return (
    <ul>
      {products.map(p => (
        <li key={p.id}>{p.name}</li>
      ))}
    </ul>
  )
}
```

### Data Access Layer Pattern

Abstract data access into a service layer. This centralizes auth checks, caching, and error handling.

```tsx
// src/services/product-service.ts
import { cache } from 'react'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'

// React cache() deduplicates within a single render pass
export const getProduct = cache(async (id: string) => {
  const session = await auth()
  if (!session) throw new Error('Unauthorized')

  return db.product.findUnique({
    where: { id, organizationId: session.user.orgId },
  })
})

export const getProducts = cache(async () => {
  const session = await auth()
  if (!session) throw new Error('Unauthorized')

  return db.product.findMany({
    where: { organizationId: session.user.orgId },
    orderBy: { createdAt: 'desc' },
  })
})
```

Benefits of this pattern:
- Single place to enforce authorization.
- `React.cache()` deduplicates calls within the same render — safe to call `getProduct(id)` in both `page.tsx` and `generateMetadata` without double-fetching.
- Easy to add caching, logging, or error handling later.

### Using fetch() with Next.js Extensions

```tsx
// Default: cached indefinitely (equivalent to SSG)
const data = await fetch('https://api.example.com/data')

// Revalidate every 60 seconds (ISR)
const data = await fetch('https://api.example.com/data', {
  next: { revalidate: 60 },
})

// Never cache (SSR on every request)
const data = await fetch('https://api.example.com/data', {
  cache: 'no-store',
})

// Tag-based revalidation
const data = await fetch('https://api.example.com/products', {
  next: { tags: ['products'] },
})
```

### Using unstable_cache for Non-Fetch Data

For database queries or other non-fetch data sources:

```tsx
import { unstable_cache } from 'next/cache'

const getCachedProducts = unstable_cache(
  async (orgId: string) => {
    return db.product.findMany({ where: { organizationId: orgId } })
  },
  ['products'],         // cache key parts
  {
    revalidate: 60,     // seconds
    tags: ['products'], // for on-demand revalidation
  }
)
```

---

## 2. Caching Strategies

Next.js has multiple caching layers. Understanding them prevents stale data bugs.

### Cache Layers (Next.js 15+)

| Layer | What | Default (v15) | Control |
|---|---|---|---|
| Request Memoization | `React.cache()` / same fetch in one render | Enabled | `React.cache()` wrapper |
| Data Cache | `fetch()` results | NOT cached by default | `next: { revalidate }` or `cache: 'force-cache'` |
| Full Route Cache | Pre-rendered HTML/RSC payload | Static routes cached | `export const dynamic = 'force-dynamic'` |
| Router Cache | Client-side RSC payload | 0s dynamic, 5min static | `staleTimes` in next.config |

Important: In Next.js 15+, `fetch()` is NOT cached by default (changed from 14). You must opt into caching explicitly.

### Route Segment Config

```tsx
// Force dynamic rendering (no cache)
export const dynamic = 'force-dynamic'

// Force static rendering
export const dynamic = 'force-static'

// Set revalidation interval for the entire route
export const revalidate = 60

// Choose runtime
export const runtime = 'nodejs' // or 'edge'
```

---

## 3. Server Actions (Mutations)

Server Actions are the primary way to mutate data in App Router.

### Pattern: Form with Validation and Feedback

```tsx
// src/actions/post.ts
'use server'

import { z } from 'zod'
import { revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

const createPostSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  content: z.string().min(1, 'Content is required'),
  published: z.coerce.boolean().default(false),
})

export type CreatePostState = {
  errors?: Record<string, string[]>
  message?: string
}

export async function createPost(
  prevState: CreatePostState,
  formData: FormData
): Promise<CreatePostState> {
  // 1. Auth check
  const session = await auth()
  if (!session?.user) redirect('/login')

  // 2. Validate
  const parsed = createPostSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
    published: formData.get('published'),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  // 3. Mutate
  try {
    await db.post.create({
      data: { ...parsed.data, authorId: session.user.id },
    })
  } catch {
    return { message: 'Failed to create post' }
  }

  // 4. Revalidate and redirect
  revalidateTag('posts')
  redirect('/posts')
}
```

```tsx
// Client Component consuming the action
'use client'

import { useActionState } from 'react'
import { createPost, type CreatePostState } from '@/actions/post'

export function CreatePostForm() {
  const [state, formAction, isPending] = useActionState<CreatePostState, FormData>(
    createPost,
    {}
  )

  return (
    <form action={formAction}>
      <input name="title" />
      {state.errors?.title && <p className="text-red-500">{state.errors.title[0]}</p>}

      <textarea name="content" />
      {state.errors?.content && <p className="text-red-500">{state.errors.content[0]}</p>}

      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Post'}
      </button>

      {state.message && <p className="text-red-500">{state.message}</p>}
    </form>
  )
}
```

### Optimistic Updates

```tsx
'use client'

import { useOptimistic } from 'react'
import { toggleLike } from '@/actions/post'

export function LikeButton({ liked, count }: { liked: boolean; count: number }) {
  const [optimistic, setOptimistic] = useOptimistic(
    { liked, count },
    (state, newLiked: boolean) => ({
      liked: newLiked,
      count: state.count + (newLiked ? 1 : -1),
    })
  )

  return (
    <form
      action={async () => {
        setOptimistic(!optimistic.liked)
        await toggleLike()
      }}
    >
      <button type="submit">
        {optimistic.liked ? '❤️' : '🤍'} {optimistic.count}
      </button>
    </form>
  )
}
```

---

## 4. Client-Side Data Fetching

Use TanStack Query for Client Components that need real-time data, polling, or pagination.

```tsx
'use client'

import { useQuery } from '@tanstack/react-query'

export function Notifications() {
  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/notifications').then(r => r.json()),
    refetchInterval: 30_000, // Poll every 30s
  })

  if (isLoading) return <Skeleton />
  return <NotificationList items={data} />
}
```

When to use client-side fetching vs Server Components:
- Real-time/polling data → TanStack Query
- User-triggered searches → TanStack Query with `enabled: false`
- Infinite scroll → TanStack Query `useInfiniteQuery`
- Initial page data → Server Component
- Static/rarely changing data → Server Component with cache

### TanStack Query Setup

```tsx
// src/components/providers.tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,  // 1 minute
            gcTime: 5 * 60 * 1000, // 5 minutes (previously cacheTime)
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
```

---

## 5. Streaming & Suspense

Use Suspense to stream parts of the page as they become ready.

```tsx
import { Suspense } from 'react'

export default function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>

      {/* Renders immediately */}
      <WelcomeBanner />

      {/* Streams when ready */}
      <Suspense fallback={<MetricsSkeleton />}>
        <SlowMetrics />
      </Suspense>

      <Suspense fallback={<ActivitySkeleton />}>
        <SlowActivityFeed />
      </Suspense>
    </div>
  )
}

// This component fetches its own data — the Suspense boundary handles loading
async function SlowMetrics() {
  const metrics = await getMetrics() // slow API call
  return <MetricsGrid data={metrics} />
}
```

Rules:
- Wrap each independent async data source in its own `<Suspense>`.
- Create meaningful skeleton components for `fallback` — not generic spinners.
- `loading.tsx` is equivalent to wrapping `page.tsx` in a Suspense boundary.
- Nest Suspense boundaries for progressive loading — outer content appears first.

---

## 6. Parallel & Sequential Fetching

### Parallel (independent data — use Promise.all)

```tsx
export default async function DashboardPage() {
  // Both fetch simultaneously — no waterfall
  const [user, metrics, notifications] = await Promise.all([
    getUser(),
    getMetrics(),
    getNotifications(),
  ])

  return (/* ... */)
}
```

### Sequential (dependent data)

```tsx
export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const post = await getPost(id)                    // must complete first
  const comments = await getComments(post.id)       // depends on post

  return (/* ... */)
}
```

### Parallel with Suspense (best of both worlds)

```tsx
export default async function DashboardPage() {
  // Start all fetches simultaneously, stream as each completes
  return (
    <>
      <Suspense fallback={<UserSkeleton />}>
        <UserProfile />       {/* fetches getUser() internally */}
      </Suspense>
      <Suspense fallback={<MetricsSkeleton />}>
        <Metrics />           {/* fetches getMetrics() internally */}
      </Suspense>
    </>
  )
}
```

This is the preferred pattern — each component fetches its own data and streams independently.

---

## 7. Revalidation Patterns

### Time-Based Revalidation (ISR)

```tsx
// Route-level
export const revalidate = 3600 // revalidate every hour

// Per-fetch
const data = await fetch(url, { next: { revalidate: 3600 } })
```

### On-Demand Revalidation

```tsx
// In a Server Action or Route Handler
import { revalidatePath, revalidateTag } from 'next/cache'

// Revalidate specific path
revalidatePath('/products')
revalidatePath('/products/[id]', 'page')

// Revalidate by tag
revalidateTag('products')
```

### Webhook-Triggered Revalidation

```tsx
// app/api/webhooks/cms/route.ts
import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const secret = request.headers.get('x-webhook-secret')
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  revalidateTag(body.collection) // e.g., 'posts', 'products'

  return NextResponse.json({ revalidated: true })
}
```
