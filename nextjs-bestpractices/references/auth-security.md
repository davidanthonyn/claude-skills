# Authentication & Security

## Table of Contents
1. Auth Architecture
2. NextAuth.js v5 Setup
3. Session Management
4. Protecting Routes
5. Security Headers
6. CSRF & Input Validation
7. Rate Limiting

---

## 1. Auth Architecture

Core principles:
- Sessions stored in httpOnly cookies — never localStorage or sessionStorage.
- Verify auth in Server Components, Server Actions, Route Handlers, and Middleware.
- Defense in depth — middleware for redirects, server-side checks for data access.
- Never trust client-side auth state for data decisions.

```
Request Flow:
Browser → Middleware (redirect if no session) → Server Component (verify + fetch data)
                                               → Server Action (verify + mutate)
                                               → Route Handler (verify + respond)
```

---

## 2. NextAuth.js v5 Setup

```tsx
// src/lib/auth.ts
import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { db } from '@/lib/db'
import { loginSchema } from '@/validators/auth'
import bcrypt from 'bcryptjs'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error: '/auth/error',
  },
  providers: [
    Google,
    Credentials({
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
        })
        if (!user?.hashedPassword) return null

        const valid = await bcrypt.compare(parsed.data.password, user.hashedPassword)
        if (!valid) return null

        return { id: user.id, email: user.email, name: user.name }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.id as string
      session.user.role = token.role as string
      return session
    },
  },
})
```

```tsx
// app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/lib/auth'
export const { GET, POST } = handlers
```

---

## 3. Session Management

### Getting Session in Different Contexts

```tsx
// Server Component
import { auth } from '@/lib/auth'

export default async function ProfilePage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <h1>{session.user.name}</h1>
}

// Server Action
'use server'
import { auth } from '@/lib/auth'

export async function updateProfile(formData: FormData) {
  const session = await auth()
  if (!session) throw new Error('Unauthorized')
  // ...
}

// Route Handler
import { auth } from '@/lib/auth'

export async function GET() {
  const session = await auth()
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // ...
}

// Client Component (via SessionProvider)
'use client'
import { useSession } from 'next-auth/react'

export function UserMenu() {
  const { data: session } = useSession()
  if (!session) return <LoginButton />
  return <Avatar user={session.user} />
}
```

### Type-Safe Session

```tsx
// types/next-auth.d.ts
import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: 'admin' | 'user'
    } & DefaultSession['user']
  }
}
```

---

## 4. Protecting Routes

### Middleware (Redirect Layer)

```tsx
// middleware.ts
import { auth } from '@/lib/auth'

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isAuthPage = req.nextUrl.pathname.startsWith('/login')
  const isProtected = req.nextUrl.pathname.startsWith('/dashboard')
  const isAdmin = req.nextUrl.pathname.startsWith('/admin')

  // Redirect logged-in users away from auth pages
  if (isAuthPage && isLoggedIn) {
    return Response.redirect(new URL('/dashboard', req.nextUrl))
  }

  // Redirect unauthenticated users to login
  if (isProtected && !isLoggedIn) {
    const callbackUrl = encodeURIComponent(req.nextUrl.pathname)
    return Response.redirect(new URL(`/login?callbackUrl=${callbackUrl}`, req.nextUrl))
  }

  // Role-based access
  if (isAdmin && req.auth?.user?.role !== 'admin') {
    return Response.redirect(new URL('/dashboard', req.nextUrl))
  }
})

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/login', '/register'],
}
```

### Server-Side Verification (Data Layer)

Middleware alone is NOT sufficient. Always verify auth where you access data:

```tsx
// src/lib/auth-utils.ts
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export async function requireAuth() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return session
}

export async function requireAdmin() {
  const session = await requireAuth()
  if (session.user.role !== 'admin') redirect('/dashboard')
  return session
}

// Usage in Server Component
export default async function AdminPage() {
  const session = await requireAdmin()
  // ...
}
```

---

## 5. Security Headers

```tsx
// next.config.ts
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // Tighten for production
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self' https://api.example.com",
    ].join('; '),
  },
]

const config: NextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
}
```

---

## 6. CSRF & Input Validation

### Server Actions are CSRF-Protected

Next.js Server Actions automatically check the `Origin` header. No extra CSRF tokens needed for Server Actions.

### Route Handler Protection

For custom API routes that accept mutations:

```tsx
// app/api/data/route.ts
import { headers } from 'next/headers'

export async function POST(request: Request) {
  // Verify origin for non-Server-Action API routes
  const origin = (await headers()).get('origin')
  if (origin !== process.env.NEXT_PUBLIC_APP_URL) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Validate input
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // Process...
}
```

### Input Sanitization

```tsx
// Never render user input as HTML
// BAD
<div dangerouslySetInnerHTML={{ __html: userContent }} />

// GOOD — use a sanitizer if HTML is required
import DOMPurify from 'isomorphic-dompurify'
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userContent) }} />

// BEST — use React's built-in escaping (default behavior)
<p>{userContent}</p>
```

---

## 7. Rate Limiting

### Using Upstash Rate Limit

```tsx
// src/lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export const rateLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'), // 10 requests per 10 seconds
  analytics: true,
})

// Usage in Route Handler
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') ?? 'anonymous'
  const { success, limit, remaining } = await rateLimiter.limit(ip)

  if (!success) {
    return Response.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
        },
      }
    )
  }

  // Process request...
}
```

### Rate Limiting in Middleware

```tsx
// middleware.ts
import { rateLimiter } from '@/lib/rate-limit'

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const ip = request.headers.get('x-forwarded-for') ?? 'anonymous'
    const { success } = await rateLimiter.limit(ip)
    if (!success) {
      return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
    }
  }
  return NextResponse.next()
}
```
