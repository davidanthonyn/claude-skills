# Deployment & DevOps

## Table of Contents
1. Vercel Deployment
2. Docker / Self-Hosted
3. CI/CD Pipeline
4. Environment Configuration
5. Monitoring & Observability
6. next.config.ts Production Settings

---

## 1. Vercel Deployment

Vercel is the zero-config path for Next.js.

### Key Configuration

```tsx
// next.config.ts
const config: NextConfig = {
  // Output standalone for smaller Docker images (not needed on Vercel)
  // output: 'standalone',

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.example.com' },
    ],
  },

  // Redirect www to non-www (or vice versa)
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.example.com' }],
        destination: 'https://example.com/:path*',
        permanent: true,
      },
    ]
  },
}
```

### Vercel-Specific Tips

- Set environment variables in Vercel dashboard — not in `.env` files in the repo.
- Use Vercel's Edge Config for feature flags and configuration.
- Set `VERCEL_REGION` to closest region to your database.
- Use Vercel Cron for scheduled tasks (`vercel.json`):

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup",
      "schedule": "0 2 * * *"
    }
  ]
}
```

- Protect cron endpoints:

```tsx
// app/api/cron/cleanup/route.ts
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Run cleanup...
}
```

---

## 2. Docker / Self-Hosted

### Production Dockerfile (Multi-Stage)

```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Generate Prisma client if using Prisma
RUN npx prisma generate

RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

Requires `output: 'standalone'` in `next.config.ts`.

### docker-compose.yml

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - '3000:3000'
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/myapp
      - AUTH_SECRET=${AUTH_SECRET}
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: myapp
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U user -d myapp']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

volumes:
  pgdata:
```

### Self-Hosted with PM2

```bash
# ecosystem.config.js
module.exports = {
  apps: [{
    name: 'nextjs-app',
    script: 'node_modules/.bin/next',
    args: 'start',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
  }],
}
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Cache static assets
    location /_next/static {
        proxy_pass http://localhost:3000;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location /public {
        proxy_pass http://localhost:3000;
        add_header Cache-Control "public, max-age=86400";
    }
}
```

---

## 3. CI/CD Pipeline

### GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-and-type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit

  test:
    runs-on: ubuntu-latest
    needs: lint-and-type-check
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run test:run -- --coverage
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage
          path: coverage/

  e2e:
    runs-on: ubuntu-latest
    needs: lint-and-type-check
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run build
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/

  build:
    runs-on: ubuntu-latest
    needs: [test, e2e]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run build
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

---

## 4. Environment Configuration

### Validation with @t3-oss/env-nextjs

```tsx
// src/env.ts
import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    AUTH_SECRET: z.string().min(32),
    STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
    RESEND_API_KEY: z.string(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },
})
```

Import `env` instead of accessing `process.env` directly — build fails if required vars are missing.

---

## 5. Monitoring & Observability

### Error Tracking (Sentry)

```bash
npx @sentry/wizard@latest -i nextjs
```

```tsx
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,        // 10% of transactions
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0, // 100% of error sessions
  integrations: [
    Sentry.replayIntegration(),
  ],
})
```

### Structured Logging

```tsx
// src/lib/logger.ts
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty' }
    : undefined,
})

// Usage
logger.info({ userId: session.user.id }, 'User logged in')
logger.error({ err, postId }, 'Failed to create post')
```

### Health Check Endpoint

```tsx
// app/api/health/route.ts
import { db } from '@/lib/db'

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`
    return Response.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    })
  } catch {
    return Response.json(
      { status: 'unhealthy' },
      { status: 503 }
    )
  }
}
```

---

## 6. next.config.ts Production Settings

```tsx
// next.config.ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  // Enable standalone output for Docker
  output: 'standalone',

  // Strict React mode
  reactStrictMode: true,

  // Type checking during build
  typescript: {
    // Don't skip in CI — catch errors
    ignoreBuildErrors: false,
  },

  // Lint during build
  eslint: {
    ignoreDuringBuilds: false,
  },

  // Trailing slashes (pick one and be consistent)
  trailingSlash: false,

  // Powered by header (remove for security)
  poweredByHeader: false,

  // Image optimization
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.example.com' },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  // Optimize imports
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@heroicons/react',
      'date-fns',
    ],
    // typedRoutes: true,  // Experimental: type-safe links
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },

  // Redirects
  async redirects() {
    return []
  },

  // Rewrites (API proxy, etc.)
  async rewrites() {
    return []
  },

  // Webpack customization (if needed)
  webpack: (config, { isServer }) => {
    // Custom webpack config here
    return config
  },
}

export default config
```
