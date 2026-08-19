---
name: keystatic-astro
description: >-
  Keystatic + Astro Content Layer: config locations, dual-file CMS schemas, content
  collection structure, glob loaders, MDX blocks, and remote/fetched collections. Use
  when scaffolding or changing Keystatic collections, Astro content.config.ts,
  keystatic.config, MDX blocks, or build-time API-backed content.
disable-model-invocation: true
---

# Keystatic + Astro

Keystatic writes Git-tracked files; Astro reads them via the Content Layer (`getCollection`, `getEntry`, `render`). Do not use `createReader`.

Match `@astrojs/*` and `@keystatic/*` APIs to the versions in the project's `package.json` / lockfile.

**Official docs (check these before guessing APIs):**

|               | Docs                                                                                                                               | LLM / agent access                                                                                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Keystatic** | [keystatic.com/docs](https://keystatic.com/docs/introduction) · [Astro integration](https://keystatic.com/docs/installation-astro) | No official `llms.txt` — fetch doc pages or search the docs site                                                                                                                                                           |
| **Astro**     | [docs.astro.build](https://docs.astro.build)                                                                                       | **[Astro Docs MCP server](https://mcp.docs.astro.build/)** — use `search_astro_docs` when the MCP is enabled (preferred over static exports). Setup: [Building with AI](https://docs.astro.build/en/guides/build-with-ai/) |

Do not duplicate upstream Keystatic or Astro API reference in this skill.

## When to apply

- Adding or changing a Keystatic collection or singleton
- Wiring `keystatic.config.*` or `src/content.config.ts`
- Choosing content vs data vs JSON format, folder layout under `src/content/`
- Adding MDX custom blocks or image handling
- Fetching external data into Astro collections at build time
- Splitting local CMS content from API-backed content

## Config locations

| Purpose                         | Typical path                    | Notes                                                                    |
| ------------------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| Keystatic root                  | `keystatic.config.ts` or `.tsx` | Storage, UI nav, GitHub repo, brand — site values inline here            |
| Astro content registry          | `src/content.config.ts`         | Exports `collections = { ... }` from all `*Astro*` definitions           |
| Per-collection Keystatic schema | `cms/{name}.keystatic.ts(x)`    | `collection()` / `singleton()`                                           |
| Per-collection Astro schema     | `cms/{name}.astro.ts(x)`        | `defineCollection()` + `loader` + Zod schema                             |
| Astro integration               | `astro.config.mjs`              | Start from [astro.config.example.mjs](examples/astro.config.example.mjs) |
| Glob loader helper              | `cms/utils/loader.ts`           | Wraps `glob()` from `astro/loaders`                                      |

Astro: [Content collections](https://docs.astro.build/en/guides/content-collections/) · Keystatic: [Configuration](https://keystatic.com/docs/configuration)

### Astro config & environment

Copy [examples/astro.config.example.mjs](examples/astro.config.example.mjs) into the project root as `astro.config.mjs` and extend with site-specific integrations. It covers:

- `loadEnv` from Vite (`.env` is not auto-loaded into `astro.config.mjs`)
- `output: 'static'` — Astro v5+ removed `hybrid`; static sites can still use on-demand routes with an adapter ([on-demand rendering](https://docs.astro.build/en/guides/on-demand-rendering/))
- Conditional `keystatic()` via `ASTRO_ENABLE_KEYSTATIC` — off for static production CI builds
- Netlify `adapter` via `ASTRO_USE_NETLIFY_ADAPTER`
- `env.schema` for typed env vars used in config and client code

Pair with the matching `.env` example for each deploy target:

| File                                                    | Use                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| [`.env.example.local`](examples/.env.example.local)     | Local dev — Keystatic `local`, `ASTRO_ENABLE_KEYSTATIC=true` |
| [`.env.example.netlify`](examples/.env.example.netlify) | CMS host — Keystatic `github`, adapter enabled               |
| [`.env.example.ionos`](examples/.env.example.ionos)     | Static production build — Keystatic off, values for CI only  |

`KEYSTATIC_STORAGE_KIND` must be `public` + `client` context in `env.schema` so `keystatic.config.*` can import it from `astro:env/client`.

Astro: [Environment variables](https://docs.astro.build/en/guides/environment-variables/) · [On-demand rendering](https://docs.astro.build/en/guides/on-demand-rendering/) · [Keystatic & Astro](https://docs.astro.build/en/guides/cms/keystatic/) · [Configuring Astro](https://docs.astro.build/en/guides/configuring-astro/)

## Dual-file pattern (required)

Every content type gets **two paired files**:

| File                     | Exports                                                           | Role                                                    |
| ------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------- |
| `{name}.keystatic.ts(x)` | `keystatic{Name}Config`, `basePath` / `contentBase`, shared enums | Keystatic schema, paths, CMS labels                     |
| `{name}.astro.ts(x)`     | `astro{Name}Definition`                                           | Astro `defineCollection`, Zod schema, required `loader` |

Register both in root configs:

- `keystatic.config.*` → imports all `keystatic*Config`
- `src/content.config.ts` → imports all `astro*Definition` into `export const collections`

Every Astro collection needs a **`loader`** (typically `glob()` or `file()` from `astro/loaders`, or a custom async loader). Import `z` from `astro/zod`.

**Export naming:**

- Keystatic: `keystaticFaqsConfig`, `keystaticItemsConfig`
- Astro: `astroFaqsDefinition`, `astroItemsDefinition`

Export shared enums and paths from the Keystatic file; import them in Astro:

```ts
// faqs.keystatic.ts
export const categoryEnumAndOrder = ['Allgemein', 'Planung & Bau', ...] as const
export const basePath = 'src/content/faqs'

// faqs.astro.ts
import { defineCollection } from 'astro:content'
import { z } from 'astro/zod'
import { basePath, categoryEnumAndOrder } from './faqs.keystatic'
import { loader } from './utils/loader'

export const astroFaqsDefinition = defineCollection({
  loader: loader(basePath, 'mdx'),
  schema: z.object({ category: z.enum(categoryEnumAndOrder), ... }),
})
```

Astro: [Defining build-time collections](https://docs.astro.build/en/guides/content-collections/#defining-build-time-content-collections) · Keystatic: [Collections](https://keystatic.com/docs/collections) · [Astro integration](https://keystatic.com/docs/installation-astro)

## File splitting

All collection and singleton definitions live in `cms/` at the project root.

### Supporting files per concern

| Concern                        | Location                                   | Pattern                                                                         |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------- |
| Shared Zod (API + Astro)       | `{name}.schema.ts`                         | API response + collection validation                                            |
| Local variant of remote schema | `{name}Schema.ts`                          | extends/omits/transforms remote schema for CMS                                  |
| Glob loader helper             | `cms/utils/loader.ts`                      | reused by all local file collections                                            |
| MDX block registry (CMS)       | `cms/components/mdxComponentsKeystatic.ts` | `mdxComponentsKeystatic('faqs')` per context                                    |
| MDX block registry (site)      | `cms/components/mdxComponentsAstro.astro`  | passed to `<Content components={...} />`                                        |
| Per-block files                | `cms/components/{Block}/`                  | `keystatic.{block}.config.ts`, `{Block}.astro`, optional `KeystaticPreview.tsx` |
| Custom Keystatic fields        | `cms/components/keystaticComponents/`      | e.g. map picker, color picker                                                   |

### MDX blocks (three layers)

```
components/{Block}/
├── keystatic.{Block}.config.ts   # block() schema + ContentView preview
├── {Block}.astro                 # frontend render
└── KeystaticPreview.tsx          # optional CMS image preview
```

Disable built-in MDX images everywhere: `fields.mdx({ options: { image: false } })`. Use custom `block()` components for images instead.

Keystatic: [MDX field](https://keystatic.com/docs/fields/mdx) · [Content components](https://keystatic.com/docs/content-components) · Astro: [MDX integration](https://docs.astro.build/en/guides/integrations-guide/mdx/)

## Content structure

### Folder layout under `src/content/`

Paths in Keystatic `path` must match on-disk layout. Collection key in `content.config.ts` is camelCase (e.g. `homepageFacts` → `src/content/homepageFacts/`).

| Type                 | Keystatic                                        | Astro                                                               | Files                                    |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------- |
| MDX collection       | `collection`, `format: { contentField: 'body' }` | `loader(basePath, 'mdx')`                                           | `*.mdx`                                  |
| YAML data collection | `collection`, no contentField                    | `loader(..., 'yaml')`                                               | `*.yaml`                                 |
| JSON data collection | `collection`, `format: { data: 'json' }`         | `loader(..., 'json')`                                               | `*.json`                                 |
| Singleton            | `singleton`, one folder                          | registered in `collections`; access via `getEntry('name', 'index')` | `index.mdx`, `index.yaml`, or multi-file |

### Singleton multi-file pattern

One logical singleton can produce **multiple files** in one folder:

```
src/content/homepage/
├── index.mdx              # frontmatter + bodyBeforeQuotes
├── bodyAfterQuotes.mdx
└── bodyAfterMilestones.mdx
```

Load each part separately: `getEntry('homepage', 'index')`, `getEntry('homepage', 'bodyaftermilestones')`.

### Relationships

Use `fields.relationship({ collection: 'otherCollection' })` in Keystatic. In Astro, relationship values resolve to **entry slugs**:

```
apiSyncedItems (JSON, fetch-to-disk)
       ↑ relationship (externalId)
items (MDX)
       ↑ relationship (parent)
itemDetails (MDX)
```

### CMS list ergonomics

- `slugField` for slug-driven collections (`title`, `name`, `imageAlt`)
- `columns: ['title', 'position', 'externalId']` for list view
- `entryLayout: 'form'` on content-heavy singletons
- `[READONLY]` labels for API-synced collections editable only via fetch

Keystatic: [Collections](https://keystatic.com/docs/collections) · [Singletons](https://keystatic.com/docs/singletons) · [Relationship field](https://keystatic.com/docs/fields/relationship) · Astro: [Collection references](https://docs.astro.build/en/guides/content-collections/#defining-collection-references)

## Astro integration

### Loading content

| API                                | Use for                                                             |
| ---------------------------------- | ------------------------------------------------------------------- |
| `getEntry(collection, id)`         | Singletons (`'index'`), multi-file singleton parts                  |
| `getCollection(name)`              | All entries; sort/filter in page or component                       |
| `getCollection(name, filter)`      | Filtered load                                                       |
| `render(entry)`                    | MDX: `const { Content } = await render(entry)` from `astro:content` |
| `getStaticPaths` + `getCollection` | Dynamic routes (`[slug].astro`)                                     |

Pass shared MDX components on every render:

```astro
import { render } from 'astro:content'

const { Content } = await render(entry)
<Content components={mdxComponentsAstro} />
```

### Loaders

Every collection declares `loader` in `defineCollection`. For on-disk Keystatic content, use `glob()` via the shared helper:

```ts
// cms/utils/loader.ts
import { glob } from 'astro/loaders'

export const loader = (contentBase: string, format: 'mdx' | 'json' | 'yaml') => {
  const base = contentBase.startsWith('/') ? `.${contentBase}` : contentBase
  return glob({ base, pattern: `**\/[^_]*.${format}` })
}
```

Pattern excludes `_`-prefixed files (partials/drafts). For a single JSON/YAML file with many entries, use [`file()`](https://docs.astro.build/en/guides/content-collections/#the-file-loader) instead.

### Type generation

Run [`astro sync`](https://docs.astro.build/en/reference/cli-reference/#astro-sync) after schema changes → `.astro/content.d.ts`.

Astro: [Querying collections](https://docs.astro.build/en/guides/content-collections/#querying-build-time-collections) · [Rendering body content](https://docs.astro.build/en/guides/content-collections/#rendering-body-content) · [Generating routes](https://docs.astro.build/en/guides/content-collections/#generating-routes-from-content) · [`glob()` loader](https://docs.astro.build/en/guides/content-collections/#the-glob-loader) · [MDX components in content](https://docs.astro.build/en/guides/integrations-guide/mdx/#passing-components-to-mdx-content)

## Remote / fetched collections

Pick a pattern based on CMS visibility, API reliability at build time, and whether editors need a local override.

| Pattern                            | Keystatic?     | Disk cache?                  | When                                         |
| ---------------------------------- | -------------- | ---------------------------- | -------------------------------------------- |
| **A. In-memory fetch**             | No             | No                           | Pure API data, no editor workflow            |
| **B. Fetch + JSON fallback**       | No             | Committed fallback file      | API unreliable; offline builds OK            |
| **C. Fetch-to-disk + glob**        | Yes (readonly) | Written each build           | Editors reference slugs; data visible in CMS |
| **D. Local mirror + remote merge** | Local only     | Local JSON in `src/content/` | Same page template for CMS and API sources   |

Remote collections register **only** in `src/content.config.ts`, not in `keystatic.config`.

For implementation details, decision flow, and merge patterns, see [remote-collections.md](references/remote-collections.md).

Astro: [Custom build-time loaders](https://docs.astro.build/en/guides/content-collections/#custom-build-time-loaders) · [Content Loader API](https://docs.astro.build/en/reference/content-loader-reference/)

## Images

| Image type                      | Keystatic `directory`      | Astro                                                                                                                                         |
| ------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Content-colocated (hero, logos) | `src/content/{collection}` | `image()` in Zod → `Picture` from `astro:assets`                                                                                              |
| MDX block images                | `src/assets/{context}/`    | `getImage()` + `import.meta.glob` ([Keystatic Astro images recipe](https://keystatic.com/docs/recipes/astro-images#content-component-images)) |
| Public downloads                | `public/downloads/{path}/` | Direct URL, not fingerprinted                                                                                                                 |

Astro: [Images in content collections](https://docs.astro.build/en/guides/images/#images-in-content-collections) · Keystatic: [Astro images recipe](https://keystatic.com/docs/recipes/astro-images#content-component-images)

## Checklist: add a new local collection

1. Create `{name}.keystatic.ts` — export `basePath`, enums, `keystatic{Name}Config`
2. Create `{name}.astro.ts` — import shared exports, `defineCollection` with `loader(basePath, format)` and Zod schema
3. Register in `keystatic.config.*` (collections or singletons) and `src/content.config.ts`
4. Add UI navigation entry in `keystatic.config.*` `ui.navigation`
5. Create `src/content/{name}/` folder (or let Keystatic create on first save)
6. Run `astro sync` and verify types
7. Consume via `getCollection` / `getEntry` / `render` in pages

## Checklist: add a remote collection

1. Create Zod schema (`{name}Schema.ts`) — validate API response
2. Create `{name}Astro.ts` with async `loader: async () => { fetch → parse → return entries }`
3. Register in `src/content.config.ts` only
4. Decide fail-fast vs fallback (see [remote-collections.md](references/remote-collections.md))
5. If merging with local CMS data: share schema, merge in page via `[...local, ...remote]`

## Anti-patterns

- Using `createReader` — use Astro Content Layer instead
- Duplicating enums/paths between Keystatic and Astro files — export from `.keystatic.ts`
- Enabling `@keystatic/astro` in static production builds
- Native MDX images when using custom blocks — always `options: { image: false }`
- Adding remote-only collections to Keystatic unless editors need readonly visibility (pattern C)
