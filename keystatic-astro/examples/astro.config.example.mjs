// ABOUT:
// We have to fetch settings from `.env`
// Which we have to do manually, see https://docs.astro.build/en/guides/configuring-astro/#environment-variables
//
// USAGE:
// `npm run dev` — Keystatic enabled, Netlify adapter optional
// `npm run build` — based on `.env`: CMS host (Keystatic + adapter) vs static production host (no Keystatic)
// `npm run build:local && npm run serve` — test the static production build locally
//
// Astro v5+ removed `output: 'hybrid'`. Use `output: 'static'` (default). On-demand routes use an adapter
// and `export const prerender = false` where needed. See https://docs.astro.build/en/guides/on-demand-rendering/

import mdx from '@astrojs/mdx'
import netlify from '@astrojs/netlify'
import react from '@astrojs/react'
import keystatic from '@keystatic/astro'
import { defineConfig, envField } from 'astro/config'
import { loadEnv } from 'vite'

const { ASTRO_ENABLE_KEYSTATIC, ASTRO_USE_NETLIFY_ADAPTER } = loadEnv(process.env.NODE_ENV, process.cwd(), '')

// CONFIG:
// https://astro.build/config
export default defineConfig({
  site: 'https://example.com/',
  integrations: [ASTRO_ENABLE_KEYSTATIC === 'true' ? keystatic() : undefined, react(), mdx()],
  // Default static output — same as official Keystatic guide:
  // https://docs.astro.build/en/guides/cms/keystatic/
  output: 'static',
  adapter: ASTRO_USE_NETLIFY_ADAPTER === 'true' ? netlify() : undefined,
  env: {
    schema: {
      ASTRO_ENABLE_KEYSTATIC: envField.boolean({
        access: 'secret',
        context: 'server',
        optional: false,
      }),
      ASTRO_USE_NETLIFY_ADAPTER: envField.boolean({
        access: 'secret',
        context: 'server',
        optional: false,
      }),
      KEYSTATIC_STORAGE_KIND: envField.enum({
        values: ['local', 'github'],
        access: 'public',
        context: 'client',
        optional: false,
      }),
      ASTRO_ENV: envField.enum({
        values: ['development', 'staging', 'production'],
        access: 'public',
        context: 'client',
        optional: false,
      }),
    },
  },
})
