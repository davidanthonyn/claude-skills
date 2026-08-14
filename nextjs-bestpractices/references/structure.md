# Project Structure & Conventions

## Table of Contents
1. Directory Structure
2. File Naming Conventions
3. Module Organization
4. Import Aliases
5. Barrel Exports
6. Feature-Based Architecture

---

## 1. Directory Structure

```
project-root/
├── app/                        # App Router — routes and layouts only
│   ├── (auth)/                 # Route group: auth-related pages
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── layout.tsx
│   ├── (main)/                 # Route group: main app
│   │   ├── dashboard/
│   │   │   ├── page.tsx
│   │   │   ├── loading.tsx
│   │   │   ├── error.tsx
│   │   │   └── _components/    # Route-specific components (underscore = private)
│   │   │       ├── metrics-card.tsx
│   │   │       └── activity-feed.tsx
│   │   └── layout.tsx
│   ├── api/
│   │   └── webhooks/
│   │       └── stripe/route.ts
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Home page
│   ├── not-found.tsx
│   ├── error.tsx
│   ├── global-error.tsx
│   ├── robots.ts
│   ├── sitemap.ts
│   └── manifest.ts
├── src/                        # All non-route application code
│   ├── actions/                # Server Actions
│   │   ├── user.ts
│   │   └── post.ts
│   ├── components/             # Shared UI components
│   │   ├── ui/                 # Primitive/design system components
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   └── dialog.tsx
│   │   ├── forms/              # Form components
│   │   │   └── profile-form.tsx
│   │   └── layouts/            # Layout building blocks
│   │       ├── header.tsx
│   │       ├── sidebar.tsx
│   │       └── footer.tsx
│   ├── hooks/                  # Custom React hooks
│   │   ├── use-debounce.ts
│   │   └── use-media-query.ts
│   ├── lib/                    # Core utilities and configurations
│   │   ├── auth.ts             # Auth configuration
│   │   ├── db.ts               # Database client singleton
│   │   ├── utils.ts            # Generic utility functions
│   │   └── constants.ts        # App-wide constants
│   ├── services/               # Business logic / data access layer
│   │   ├── user-service.ts
│   │   └── post-service.ts
│   ├── types/                  # Shared TypeScript types
│   │   ├── user.ts
│   │   └── api.ts
│   └── validators/             # Zod schemas (shared between client/server)
│       ├── user.ts
│       └── post.ts
├── public/                     # Static assets
│   ├── fonts/
│   └── images/
├── tests/                      # Test files (or colocate with src/)
│   ├── e2e/
│   └── unit/
├── .env                        # Non-sensitive defaults
├── .env.local                  # Secrets (gitignored)
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

Key principles:
- `app/` contains ONLY route segments, layouts, and loading/error states. No business logic.
- `src/` contains all shared application code. Enable with `srcDir` or just colocate.
- `_components/` inside route folders for route-specific components (underscore prefix makes them private to the router — they won't be treated as route segments).
- Route groups `(groupName)` organize routes without affecting URL structure.

## 2. File Naming Conventions

| Type | Convention | Example |
|---|---|---|
| Components | kebab-case | `metrics-card.tsx` |
| Hooks | kebab-case, `use-` prefix | `use-debounce.ts` |
| Utils/lib | kebab-case | `format-date.ts` |
| Types | kebab-case | `user.ts` (exports `User`, `UserRole`) |
| Constants | kebab-case, UPPER_SNAKE values | `constants.ts` → `MAX_RETRIES` |
| Server Actions | kebab-case or domain name | `user.ts` with `'use server'` |
| Route files | Next.js convention | `page.tsx`, `layout.tsx`, `loading.tsx` |

Use `.tsx` for files with JSX, `.ts` for pure logic. Never `.jsx` or `.js` in a TypeScript project.

## 3. Module Organization

Each module file should follow this order:

```tsx
// 1. Directives
'use client' // or 'use server'

// 2. External imports
import { useState } from 'react'
import { z } from 'zod'

// 3. Internal imports (alias)
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// 4. Types
interface Props {
  title: string
  children: React.ReactNode
}

// 5. Constants
const MAX_ITEMS = 10

// 6. Component / function
export default function MyComponent({ title, children }: Props) {
  // ...
}

// 7. Sub-components (if small and tightly coupled)
function ItemCard({ item }: { item: Item }) {
  // ...
}
```

## 4. Import Aliases

Configure in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/app/*": ["./app/*"]
    }
  }
}
```

Always use aliases instead of relative paths for cross-directory imports:

```tsx
// GOOD
import { Button } from '@/components/ui/button'

// BAD
import { Button } from '../../../components/ui/button'
```

Relative imports are fine within the same feature directory.

## 5. Barrel Exports — Use Sparingly

Barrel files (`index.ts`) can cause tree-shaking issues and slow HMR. Use them only for
public API surfaces of well-defined modules:

```tsx
// src/components/ui/index.ts — OK for a design system
export { Button } from './button'
export { Input } from './input'
export { Dialog } from './dialog'
```

Don't create barrel files for every directory. Direct imports are preferred for most cases.

## 6. Feature-Based Architecture (Alternative)

For larger applications, consider organizing by feature instead of by type:

```
src/
├── features/
│   ├── auth/
│   │   ├── components/
│   │   │   ├── login-form.tsx
│   │   │   └── auth-provider.tsx
│   │   ├── hooks/
│   │   │   └── use-auth.ts
│   │   ├── actions/
│   │   │   └── login.ts
│   │   ├── validators/
│   │   │   └── login-schema.ts
│   │   ├── types.ts
│   │   └── index.ts          # Public API of this feature
│   ├── billing/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── index.ts
│   └── posts/
│       ├── components/
│       ├── actions/
│       └── index.ts
├── components/                 # Truly shared components only
├── lib/                        # Shared utilities
└── types/                      # Shared types
```

Rules for feature-based architecture:
- Features should not import from other features directly — use shared modules.
- Each feature exports a clean public API via `index.ts`.
- Route pages in `app/` import from features: `import { LoginForm } from '@/features/auth'`.
- Shared components remain in `src/components/`.
