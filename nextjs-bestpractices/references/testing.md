# Testing Strategy

## Table of Contents
1. Testing Pyramid
2. Vitest Setup
3. Component Testing
4. Server Action Testing
5. E2E with Playwright
6. API Route Testing
7. Testing Patterns

---

## 1. Testing Pyramid

| Level | Tool | What to Test | Coverage Target |
|---|---|---|---|
| Unit | Vitest | Utils, validators, services, hooks | High |
| Component | Vitest + Testing Library | UI components, forms | Medium |
| Integration | Vitest | Server Actions, API routes, data flow | Medium |
| E2E | Playwright | Critical user flows, multi-page journeys | Key paths |

Focus effort on:
- Unit tests for business logic and validators (cheap, fast, reliable).
- Component tests for interactive UI with complex state.
- E2E tests for the most critical user journeys (login, checkout, core CRUD).

---

## 2. Vitest Setup

```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

```tsx
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/types/**', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

```tsx
// tests/setup.ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
```

```json
// package.json scripts
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test"
  }
}
```

---

## 3. Component Testing

### Basic Component Test

```tsx
// src/components/ui/__tests__/button.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '../button'

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument()
  })

  it('calls onClick handler', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    render(<Button onClick={handleClick}>Click me</Button>)
    await user.click(screen.getByRole('button'))

    expect(handleClick).toHaveBeenCalledOnce()
  })

  it('is disabled when loading', () => {
    render(<Button disabled>Loading...</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
```

### Form Component Test

```tsx
// src/components/forms/__tests__/login-form.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginForm } from '../login-form'

// Mock the server action
vi.mock('@/actions/auth', () => ({
  login: vi.fn(),
}))

import { login } from '@/actions/auth'

describe('LoginForm', () => {
  it('shows validation errors for empty submission', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument()
    })
  })

  it('submits valid data', async () => {
    const user = userEvent.setup()
    vi.mocked(login).mockResolvedValue({ success: true })

    render(<LoginForm />)

    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(FormData)
      )
    })
  })
})
```

### Testing Hooks

```tsx
// src/hooks/__tests__/use-debounce.test.ts
import { renderHook, act } from '@testing-library/react'
import { useDebounce } from '../use-debounce'

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 500))
    expect(result.current).toBe('hello')
  })

  it('debounces value changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: 'hello' } }
    )

    rerender({ value: 'world' })
    expect(result.current).toBe('hello') // not yet updated

    act(() => { vi.advanceTimersByTime(500) })
    expect(result.current).toBe('world') // updated after delay
  })
})
```

---

## 4. Server Action Testing

```tsx
// src/actions/__tests__/post.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    post: {
      create: vi.fn(),
    },
  },
}))

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

import { createPost } from '../post'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

describe('createPost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects unauthenticated users', async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const formData = new FormData()
    formData.set('title', 'Test')
    formData.set('content', 'Content')

    const { redirect } = await import('next/navigation')
    await createPost({}, formData)

    expect(redirect).toHaveBeenCalledWith('/login')
  })

  it('returns validation errors for invalid input', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: '1', role: 'user' },
    } as any)

    const formData = new FormData()
    formData.set('title', '')  // empty title
    formData.set('content', 'Content')

    const result = await createPost({}, formData)

    expect(result.errors?.title).toBeDefined()
    expect(db.post.create).not.toHaveBeenCalled()
  })

  it('creates post with valid data', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-1', role: 'user' },
    } as any)
    vi.mocked(db.post.create).mockResolvedValue({ id: 'post-1' } as any)

    const formData = new FormData()
    formData.set('title', 'My Post')
    formData.set('content', 'Great content')

    await createPost({}, formData)

    expect(db.post.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'My Post',
        content: 'Great content',
        authorId: 'user-1',
      }),
    })
  })
})
```

---

## 5. E2E with Playwright

```bash
npm init playwright@latest
```

```tsx
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

### E2E Test Example

```tsx
// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('user can log in and access dashboard', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Email').fill('test@example.com')
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByText(/welcome/i)).toBeVisible()
  })

  test('invalid credentials show error', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Email').fill('wrong@example.com')
    await page.getByLabel('Password').fill('wrong')
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect(page.getByText(/invalid credentials/i)).toBeVisible()
    await expect(page).toHaveURL('/login')
  })
})
```

### Page Object Pattern

```tsx
// tests/e2e/pages/login-page.ts
import { Page, Locator } from '@playwright/test'

export class LoginPage {
  readonly page: Page
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly submitButton: Locator

  constructor(page: Page) {
    this.page = page
    this.emailInput = page.getByLabel('Email')
    this.passwordInput = page.getByLabel('Password')
    this.submitButton = page.getByRole('button', { name: /sign in/i })
  }

  async goto() {
    await this.page.goto('/login')
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
  }
}
```

---

## 6. API Route Testing

```tsx
// src/app/api/products/__tests__/route.test.ts
import { describe, it, expect, vi } from 'vitest'
import { GET, POST } from '../route'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

import { auth } from '@/lib/auth'

describe('GET /api/products', () => {
  it('returns 401 without auth', async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const response = await GET()
    expect(response.status).toBe(401)
  })

  it('returns products for authenticated user', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: '1' },
    } as any)

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(Array.isArray(data)).toBe(true)
  })
})
```

---

## 7. Testing Patterns

### What to Test

| Layer | Test | Don't Test |
|---|---|---|
| Validators | All schemas with valid/invalid data | — |
| Utils | Pure functions, edge cases | Trivial wrappers |
| Server Actions | Auth, validation, DB calls, revalidation | Internal implementation |
| Components | User interactions, conditional rendering | CSS classes, exact markup |
| API Routes | Auth, input/output, error codes | — |
| E2E | Login, CRUD, payment, critical paths | Every possible UI state |

### Testing Principles

- Test behavior, not implementation — don't test internal state directly.
- Use `screen.getByRole` and `getByLabelText` over `getByTestId` — more accessible, more resilient.
- Mock at module boundaries (database, auth, external APIs) — not inside functions.
- Each test should be independent — no shared mutable state between tests.
- Name tests by user intent: "user can create a post" not "handleSubmit calls createPost".
