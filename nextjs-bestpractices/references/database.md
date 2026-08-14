# Database & ORM Patterns

## Table of Contents
1. Database Client Singleton
2. Prisma Patterns
3. Drizzle Patterns
4. MongoDB / Mongoose
5. Connection Pooling
6. Migrations & Seeding
7. Query Optimization

---

## 1. Database Client Singleton

In development, Next.js hot reloads create new module instances. Without a singleton, you leak database connections.

### Prisma Singleton

```tsx
// src/lib/db.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
```

### Drizzle Singleton

```tsx
// src/lib/db.ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const globalForDb = globalThis as unknown as {
  pool: Pool | undefined
}

const pool = globalForDb.pool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
})

if (process.env.NODE_ENV !== 'production') globalForDb.pool = pool

export const db = drizzle(pool, { schema })
```

### MongoDB Singleton

```tsx
// src/lib/mongodb.ts
import { MongoClient, Db } from 'mongodb'

const uri = process.env.MONGODB_URI!
const options = {}

let client: MongoClient
let clientPromise: Promise<MongoClient>

const globalForMongo = globalThis as unknown as {
  _mongoClientPromise?: Promise<MongoClient>
}

if (process.env.NODE_ENV === 'development') {
  if (!globalForMongo._mongoClientPromise) {
    client = new MongoClient(uri, options)
    globalForMongo._mongoClientPromise = client.connect()
  }
  clientPromise = globalForMongo._mongoClientPromise
} else {
  client = new MongoClient(uri, options)
  clientPromise = client.connect()
}

export default clientPromise

export async function getDb(): Promise<Db> {
  const client = await clientPromise
  return client.db()
}
```

---

## 2. Prisma Patterns

### Schema Best Practices

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  role      Role     @default(USER)
  posts     Post[]
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("users")  // Map to snake_case table name
}

model Post {
  id          String   @id @default(cuid())
  title       String
  content     String?
  published   Boolean  @default(false)
  author      User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
  authorId    String   @map("author_id")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@index([authorId])           // Index foreign keys
  @@index([published, createdAt]) // Composite index for common queries
  @@map("posts")
}

enum Role {
  USER
  ADMIN
}
```

### Query Patterns

```tsx
// Select only needed fields
const users = await db.user.findMany({
  select: {
    id: true,
    name: true,
    email: true,
    _count: { select: { posts: true } },
  },
})

// Pagination
const page = 1
const pageSize = 20
const [users, total] = await Promise.all([
  db.user.findMany({
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { createdAt: 'desc' },
  }),
  db.user.count(),
])

// Transactions
const [post, notification] = await db.$transaction([
  db.post.create({ data: postData }),
  db.notification.create({ data: notifData }),
])

// Interactive transactions
await db.$transaction(async (tx) => {
  const user = await tx.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('User not found')
  await tx.user.update({
    where: { id: userId },
    data: { credits: user.credits - 1 },
  })
})
```

---

## 3. Drizzle Patterns

### Schema Definition

```tsx
// src/lib/schema.ts
import { pgTable, text, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { createId } from '@paralleldrive/cuid2'

export const users = pgTable('users', {
  id: text('id').$defaultFn(() => createId()).primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  role: text('role', { enum: ['user', 'admin'] }).default('user').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const posts = pgTable('posts', {
  id: text('id').$defaultFn(() => createId()).primaryKey(),
  title: text('title').notNull(),
  content: text('content'),
  published: boolean('published').default(false).notNull(),
  authorId: text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('posts_author_idx').on(table.authorId),
  index('posts_published_idx').on(table.published, table.createdAt),
])
```

### Query Patterns

```tsx
import { eq, desc, and, sql } from 'drizzle-orm'

// Basic query with relations
const userPosts = await db.query.users.findFirst({
  where: eq(users.id, userId),
  with: { posts: { orderBy: [desc(posts.createdAt)] } },
})

// Pagination
const results = await db
  .select()
  .from(posts)
  .where(eq(posts.published, true))
  .orderBy(desc(posts.createdAt))
  .limit(20)
  .offset(0)

// Transaction
await db.transaction(async (tx) => {
  await tx.insert(posts).values(postData)
  await tx.insert(notifications).values(notifData)
})
```

---

## 4. MongoDB / Mongoose

### Indexing

Create indexes for fields you query frequently:

```tsx
// Ensure indexes exist (run once at startup or via migration)
const db = await getDb()
await db.collection('products').createIndexes([
  { key: { slug: 1 }, unique: true },
  { key: { category: 1, createdAt: -1 } },
  { key: { name: 'text', description: 'text' } },  // Text search
])
```

Always check slow queries with `.explain()`:

```tsx
const explained = await db
  .collection('products')
  .find({ category: 'electronics' })
  .explain('executionStats')

// Look for: totalDocsExamined vs totalKeysExamined
// If totalDocsExamined >> results, you need an index
```

---

## 5. Connection Pooling

### Serverless Environments (Vercel, AWS Lambda)

Serverless functions can exhaust database connections. Use a connection pooler.

**Prisma + PgBouncer / Supabase Pooler:**

```env
# Direct connection for migrations
DATABASE_URL_DIRECT="postgresql://user:pass@host:5432/db"

# Pooled connection for application
DATABASE_URL="postgresql://user:pass@pooler-host:6543/db?pgbouncer=true"
```

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DATABASE_URL_DIRECT")  // For migrations
}
```

**Prisma Accelerate** (managed pooling):

```tsx
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

export const db = new PrismaClient().$extends(withAccelerate())
```

**Neon Serverless Driver:**

```tsx
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql)
```

---

## 6. Migrations & Seeding

### Prisma

```bash
# Generate migration
npx prisma migrate dev --name add_user_role

# Apply in production
npx prisma migrate deploy

# Reset database (dev only)
npx prisma migrate reset

# Seed
npx prisma db seed
```

```tsx
// prisma/seed.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      name: 'Admin',
      role: 'ADMIN',
    },
  })
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    prisma.$disconnect()
    process.exit(1)
  })
```

### Drizzle

```bash
# Generate migration
npx drizzle-kit generate

# Apply migration
npx drizzle-kit migrate

# Push schema directly (dev only)
npx drizzle-kit push
```

---

## 7. Query Optimization

General rules:
- Always add indexes on columns used in `WHERE`, `ORDER BY`, and `JOIN`.
- Use `select` to fetch only needed columns — avoid `SELECT *`.
- Use pagination — never fetch unbounded result sets.
- Use `count` for totals instead of fetching all records.
- Profile with query analyzers (`EXPLAIN ANALYZE` in PostgreSQL, `.explain()` in MongoDB).
- Cache expensive queries with `unstable_cache` or React `cache()`.

```tsx
// Cache expensive database query
import { unstable_cache } from 'next/cache'

export const getPopularPosts = unstable_cache(
  async () => {
    return db.post.findMany({
      where: { published: true },
      orderBy: { viewCount: 'desc' },
      take: 10,
      select: { id: true, title: true, slug: true, viewCount: true },
    })
  },
  ['popular-posts'],
  { revalidate: 300, tags: ['posts'] }
)
```

N+1 Query Prevention:
- Use `include` (Prisma) or `with` (Drizzle) for relations.
- Use DataLoader pattern for batching in complex resolvers.
- Never query inside a `.map()` loop — batch first.
