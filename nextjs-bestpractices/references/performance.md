# Performance & Core Web Vitals

## Table of Contents
1. Core Web Vitals Targets
2. Bundle Optimization
3. Image Optimization
4. Font Optimization
5. Script Loading
6. Rendering Strategies
7. React Performance Patterns

---

## 1. Core Web Vitals Targets

| Metric | Good | Description |
|---|---|---|
| LCP | < 2.5s | Largest Contentful Paint — main content visible |
| INP | < 200ms | Interaction to Next Paint — responsiveness |
| CLS | < 0.1 | Cumulative Layout Shift — visual stability |

### Measuring Performance

```tsx
// next.config.ts — enable experimental metrics
const config: NextConfig = {
  experimental: {
    webVitalsAttribution: ['CLS', 'LCP'],
  },
}
```

```tsx
// app/layout.tsx — report Web Vitals
export function reportWebVitals(metric: NextWebVitalsMetric) {
  // Send to analytics
  console.log(metric)
}
```

Use tools: Lighthouse, PageSpeed Insights, Chrome DevTools Performance tab, Vercel Analytics.

---

## 2. Bundle Optimization

### Analyze Bundle

```bash
# Install analyzer
npm install @next/bundle-analyzer

# next.config.ts
import withBundleAnalyzer from '@next/bundle-analyzer'

const config = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})({
  // next config
})

# Run
ANALYZE=true npm run build
```

### Dynamic Imports

Lazy-load heavy components that aren't needed for initial render:

```tsx
import dynamic from 'next/dynamic'

// Heavy chart library — only loaded when component renders
const Chart = dynamic(() => import('@/components/chart'), {
  loading: () => <ChartSkeleton />,
  ssr: false, // Skip SSR if component needs browser APIs
})

// Modal — loaded only when opened
const EditModal = dynamic(() => import('@/components/edit-modal'))
```

### Tree Shaking

```tsx
// GOOD — named import, tree-shakable
import { format } from 'date-fns'

// BAD — imports entire library
import _ from 'lodash'

// GOOD — import specific lodash function
import debounce from 'lodash/debounce'
```

### Barrel File Warnings

Barrel files (`index.ts` re-exporting everything) can prevent tree shaking.
Next.js has `optimizePackageImports` for known libraries:

```tsx
// next.config.ts
const config: NextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', '@heroicons/react'],
  },
}
```

---

## 3. Image Optimization

Always use `next/image` — it provides automatic WebP/AVIF conversion, lazy loading,
responsive sizing, and prevents CLS.

```tsx
import Image from 'next/image'

// Fixed dimensions (known size)
<Image
  src="/hero.jpg"
  alt="Hero banner"
  width={1200}
  height={630}
  priority              // Preload for LCP images
  quality={85}
  placeholder="blur"    // Show blur while loading (static imports only)
  blurDataURL={blurHash} // Or provide base64 blur for remote images
/>

// Fill container (unknown/responsive size)
<div className="relative aspect-video">
  <Image
    src={post.coverImage}
    alt={post.title}
    fill
    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
    className="object-cover"
  />
</div>
```

Key rules:
- Add `priority` to the LCP image (typically hero/banner above the fold). Maximum 2 per page.
- Always provide `sizes` when using `fill` — prevents downloading oversized images.
- Configure `remotePatterns` in `next.config.ts` for external image domains.
- Use `placeholder="blur"` for better perceived performance.

```tsx
// next.config.ts
const config: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.example.com' },
      { protocol: 'https', hostname: '*.cloudinary.com' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
}
```

---

## 4. Font Optimization

Use `next/font` to self-host fonts with zero layout shift.

```tsx
// app/layout.tsx
import { Inter, JetBrains_Mono } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',           // Prevent FOIT
  variable: '--font-inter',  // CSS variable for Tailwind
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  )
}
```

```tsx
// tailwind.config.ts
const config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
    },
  },
}
```

For local fonts:

```tsx
import localFont from 'next/font/local'

const calSans = localFont({
  src: '../public/fonts/CalSans-SemiBold.woff2',
  variable: '--font-cal',
  display: 'swap',
})
```

---

## 5. Script Loading

Use `next/script` for third-party scripts:

```tsx
import Script from 'next/script'

// Analytics — load after page is interactive
<Script
  src="https://analytics.example.com/script.js"
  strategy="afterInteractive"
/>

// Non-critical — load when browser is idle
<Script
  src="https://widget.example.com/embed.js"
  strategy="lazyOnload"
/>

// Must load before page hydrates (rare)
<Script
  src="https://polyfill.io/v3/polyfill.min.js"
  strategy="beforeInteractive"
/>
```

Strategies:
- `afterInteractive` (default) — most third-party scripts
- `lazyOnload` — chat widgets, social embeds, non-critical
- `beforeInteractive` — polyfills, critical dependencies
- `worker` (experimental) — offload to web worker

---

## 6. Rendering Strategies

Choose the right rendering strategy per route:

| Strategy | When to Use | How |
|---|---|---|
| Static (SSG) | Content doesn't change per request | Default for routes with no dynamic data |
| ISR | Content changes periodically | `export const revalidate = 60` |
| Dynamic (SSR) | Personalized or real-time data | `export const dynamic = 'force-dynamic'` |
| Streaming | Mix of fast and slow data | `<Suspense>` boundaries |
| Client-side | After hydration, user interactions | `'use client'` + hooks |

### Partial Prerendering (PPR) — Next.js 15+

PPR combines static shell with dynamic streaming holes:

```tsx
// next.config.ts
const config: NextConfig = {
  experimental: {
    ppr: 'incremental',
  },
}

// app/products/page.tsx
export const experimental_ppr = true

export default function ProductsPage() {
  return (
    <div>
      <StaticHeader />          {/* Pre-rendered static shell */}
      <Suspense fallback={<ProductsSkeleton />}>
        <DynamicProducts />     {/* Streamed dynamically */}
      </Suspense>
    </div>
  )
}
```

---

## 7. React Performance Patterns

### Avoid Unnecessary Client-Side State

```tsx
// BAD — unnecessary client component with state
'use client'
export function UserGreeting() {
  const [user, setUser] = useState(null)
  useEffect(() => { fetchUser().then(setUser) }, [])
  return <h1>Hello, {user?.name}</h1>
}

// GOOD — Server Component, no client JS
export default async function UserGreeting() {
  const user = await getUser()
  return <h1>Hello, {user.name}</h1>
}
```

### Memoization

```tsx
'use client'

import { memo, useMemo, useCallback } from 'react'

// Memoize expensive computations
const sortedItems = useMemo(
  () => items.sort((a, b) => a.name.localeCompare(b.name)),
  [items]
)

// Memoize callbacks passed to child components
const handleClick = useCallback((id: string) => {
  // ...
}, [])

// Memoize components that receive stable props
const ExpensiveList = memo(function ExpensiveList({ items }: Props) {
  return items.map(item => <ComplexItem key={item.id} item={item} />)
})
```

Use memoization when:
- A computation is genuinely expensive (sorting large lists, complex transforms).
- A callback is passed to a memoized child or appears in a dependency array.
- A component re-renders often with the same props.

Don't memoize everything — premature optimization adds complexity.

### Virtualization for Large Lists

```tsx
'use client'

import { useVirtualizer } from '@tanstack/react-virtual'

export function VirtualList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
    overscan: 5,
  })

  return (
    <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(vItem => (
          <div
            key={vItem.key}
            style={{
              position: 'absolute',
              top: vItem.start,
              height: vItem.size,
              width: '100%',
            }}
          >
            {items[vItem.index].name}
          </div>
        ))}
      </div>
    </div>
  )
}
```

Use virtualization when rendering > 100 items in a scrollable list.
