# Styling Patterns

## Table of Contents
1. Tailwind CSS Setup
2. CSS Modules
3. Component Styling Patterns
4. Dark Mode
5. Responsive Design
6. Animation Patterns
7. Design System with shadcn/ui

---

## 1. Tailwind CSS Setup

Tailwind CSS v4 is the recommended styling approach for Next.js.

### Tailwind v4 (CSS-based config)

```css
/* app/globals.css */
@import 'tailwindcss';

@theme {
  --color-primary: #2563eb;
  --color-primary-foreground: #ffffff;
  --color-secondary: #64748b;
  --color-destructive: #dc2626;
  --color-muted: #f1f5f9;
  --color-muted-foreground: #64748b;
  --color-border: #e2e8f0;
  --color-ring: #2563eb;
  --color-background: #ffffff;
  --color-foreground: #0f172a;

  --font-sans: var(--font-inter), system-ui, sans-serif;
  --font-mono: var(--font-jetbrains-mono), monospace;

  --radius-lg: 0.5rem;
  --radius-md: 0.375rem;
  --radius-sm: 0.25rem;
}
```

### Tailwind v3 (JS config — still widely used)

```tsx
// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        border: 'hsl(var(--border))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    require('@tailwindcss/typography'),
  ],
}

export default config
```

### Utility: cn() helper

Combine Tailwind classes conditionally with `clsx` + `tailwind-merge`:

```tsx
// src/lib/utils.ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Usage
<button className={cn(
  'rounded-md px-4 py-2 font-medium',
  variant === 'primary' && 'bg-primary text-primary-foreground',
  variant === 'outline' && 'border border-border bg-transparent',
  disabled && 'opacity-50 cursor-not-allowed',
  className
)}>
```

---

## 2. CSS Modules

Use CSS Modules when Tailwind isn't suitable (complex animations, third-party styling, existing CSS codebase).

```tsx
// src/components/card/card.module.css
.card {
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
  padding: 1.5rem;
  transition: box-shadow 0.2s ease;
}

.card:hover {
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}

.title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}
```

```tsx
// src/components/card/card.tsx
import styles from './card.module.css'

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.card}>
      <h3 className={styles.title}>{title}</h3>
      {children}
    </div>
  )
}
```

Advantages: zero runtime, scoped by default, compatible with Server Components.

---

## 3. Component Styling Patterns

### Variant Pattern with cva

Use `class-variance-authority` for components with multiple variants:

```tsx
// src/components/ui/button.tsx
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  // Base styles
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-white hover:bg-destructive/90',
        outline: 'border border-border bg-background hover:bg-muted',
        ghost: 'hover:bg-muted',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { buttonVariants }
```

---

## 4. Dark Mode

### With next-themes

```bash
npm install next-themes
```

```tsx
// src/components/providers.tsx
'use client'

import { ThemeProvider } from 'next-themes'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  )
}
```

```tsx
// app/layout.tsx
import { Providers } from '@/components/providers'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

```css
/* CSS variables for dark mode */
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
  --border: 214.3 31.8% 91.4%;
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 217.2 91.2% 59.8%;
  --border: 217.2 32.6% 17.5%;
}
```

```tsx
// Theme toggle component
'use client'

import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="rounded-md p-2 hover:bg-muted"
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </button>
  )
}
```

---

## 5. Responsive Design

### Mobile-First with Tailwind

```tsx
<div className="
  grid
  grid-cols-1          // Mobile: 1 column
  sm:grid-cols-2       // ≥640px: 2 columns
  lg:grid-cols-3       // ≥1024px: 3 columns
  gap-4
  p-4 sm:p-6 lg:p-8   // Progressive padding
">
  {items.map(item => <Card key={item.id} item={item} />)}
</div>
```

### Container Queries (Tailwind v4 / plugin)

```tsx
<div className="@container">
  <div className="@sm:flex @sm:gap-4">
    <img className="w-full @sm:w-32" />
    <div>...</div>
  </div>
</div>
```

### Responsive Images

```tsx
<Image
  src="/hero.jpg"
  alt="Hero"
  fill
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
  className="object-cover"
  priority
/>
```

Always provide `sizes` — without it, Next.js generates images for all breakpoints, wasting bandwidth.

---

## 6. Animation Patterns

### CSS Transitions (simple)

```tsx
<button className="
  transition-all duration-200 ease-in-out
  hover:scale-105 hover:shadow-lg
  active:scale-95
">
```

### Framer Motion (complex)

```tsx
'use client'

import { motion, AnimatePresence } from 'framer-motion'

export function FadeInList({ items }: { items: Item[] }) {
  return (
    <AnimatePresence>
      {items.map((item, i) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ delay: i * 0.05, duration: 0.3 }}
        >
          <Card item={item} />
        </motion.div>
      ))}
    </AnimatePresence>
  )
}
```

### Page Transitions

```tsx
// app/template.tsx — re-mounts on navigation (unlike layout.tsx)
'use client'

import { motion } from 'framer-motion'

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  )
}
```

Note: Use `template.tsx` (not `layout.tsx`) for page transitions — it re-mounts on navigation.

### Loading Animation with tailwindcss-animate

```tsx
// Skeleton loading
<div className="animate-pulse space-y-4">
  <div className="h-4 bg-muted rounded w-3/4" />
  <div className="h-4 bg-muted rounded w-1/2" />
  <div className="h-32 bg-muted rounded" />
</div>

// Fade in
<div className="animate-in fade-in duration-500">
  Content
</div>

// Slide up
<div className="animate-in slide-in-from-bottom-4 duration-300">
  Content
</div>
```

---

## 7. Design System with shadcn/ui

shadcn/ui provides copy-paste components that you own. Not a dependency — source code lives in your project.

### Setup

```bash
npx shadcn@latest init
npx shadcn@latest add button card dialog input form
```

### Customization Pattern

Override shadcn components by editing the source directly in `src/components/ui/`:

```tsx
// Extend button with loading state
// src/components/ui/button.tsx (after shadcn init)
interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean
}

export function Button({ className, variant, size, isLoading, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}
```

### Compound Component Pattern

Build complex components from shadcn primitives:

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function ConfirmDialog({
  title,
  description,
  onConfirm,
  trigger,
}: {
  title: string
  description: string
  onConfirm: () => void
  trigger: React.ReactNode
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button variant="destructive" onClick={onConfirm}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```
