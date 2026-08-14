---
name: verifying-event-changes
description: Use when about to run tests/builds for ctsnetwork-event, after editing any file in event/backend or event/frontend, or before reporting any Event change as done, fixed, working, or verified — including "quick" and "one-line" changes.
---

# Verifying Event Changes

## Overview

Core principle: **a change is verified only when a delta-vs-baseline is clean AND the change was exercised on a freshly rebuilt runtime.** Offline gates alone prove compilation, not behavior. Docker never hot-reloads, and this repo carries pre-existing red — both facts routinely produce false verdicts in both directions.

**Violating the letter of this process is violating its spirit.**

## When to use

- After editing anything under `event/backend/src`, `event/backend/prisma`, or `event/frontend/app`.
- Before writing the words "done", "fixed", "works", "passes", or "verified" about Event.
- When a test/build result surprises you (either direction).

When NOT to use: pure doc/comment edits (state that nothing runnable changed), or analysis-only sessions.

## Step 0 — Baseline BEFORE you edit

Run the gates you will later rely on and record the numbers. Known baseline (2026-08-10 — re-baseline if git moved):

| Gate | Known state |
|---|---|
| `yarn build` (backend) | green |
| `yarn test` (backend unit) | 128 suites / 966 green, needs `--forceExit` |
| `yarn lint` (backend) | ~30 pre-existing errors — only NEW ones are yours |
| integration | Phase-1 suites green; `order-expiry`, `ticket-tier-capacity`, `ticket-tier-schedule`, `legacy-order-compatibility`, `app.controller.spec.ts` pre-existing red |
| `npm run typecheck` / `build` / `test` (frontend) | all green (702 tests) |

If you skipped the baseline and a gate is now red: STOP. Check the table, then `git stash`-diff mentally — determine whether the failure exists without your change before touching anything else.

## Step 1 — Offline gates (per half; both halves if you touched a shared contract)

Backend (`event/backend/`, Yarn 4 — never npm install):

    npx prisma generate        # ALWAYS first in a fresh session
    yarn build
    yarn lint
    yarn test                  # add --forceExit if it hangs at the end
    # only when order/tier/checkout logic changed:
    yarn test:integration:all  # disposable Postgres :35441

Frontend (`event/frontend/`, npm):

    npm run typecheck          # a typegen timeout is NOT a pass — rerun
    npm run build
    npm run test

Read the exit codes and the counts. "It printed a lot and ended" is not a result.

## Step 2 — Runtime proof (backend changes)

    docker compose --env-file .env.production down
    # wait until ALL containers are gone
    docker compose --env-file .env.production up --build -d
    docker ps --format "table {{.Names}}\t{{.CreatedAt}}\t{{.Status}}"

Gate: the app container CreatedAt **post-dates your last edit**. Then exercise the actual change:

    curl.exe http://localhost:3008/api/<changed-route>     # docker maps 3008→3000
    docker logs -f ctsnetwork-event-app                    # watch while exercising

Frontend changes: verify in the running app (dev server; if it EACCESes, that's the Windows reserved-port trap — `npm run dev -- --port 5999`).

## Step 3 — Report format (required shape)

1. What changed (files).
2. Baseline vs after, per gate, as numbers ("966→966 pass; lint 30→30; no new").
3. Runtime evidence: the actual request + response (or screenshot/DOM read), and the container CreatedAt line for backend work.
4. What was NOT verified and why (e.g., "SMTP delivery not triggered", "E2E not run — needs live stack").

## Rationalizations — all of these mean STOP

| Excuse | Reality |
|---|---|
| "It's a one-line change" | The one-line `$queryRaw` change broke every checkout for a day (memory: prisma-void-needs-executeraw). |
| "Build passed, so it works" | Build proves types. The jsxDEV SSR 500 shipped through a green build. |
| "The container is already running" | Then it is running OLD code. CreatedAt check or it didn't happen. |
| "Tests were already failing, whatever" | Baseline table exists precisely so you can tell whose red it is. Unattributed red = unverified change. |
| "Restarting is slow, I'll verify at the end" | End-of-session batch verification hides which edit broke it. Verify per logical change. |
| "The user is waiting, skip the ritual" | A wrong "done" costs David a VPS debugging night. The ritual costs 3 minutes. |

## Red flags — start over if you catch yourself

- Writing "should", "probably", "I think it's fixed", "theoretically".
- Interpreting runtime behavior without having rebuilt since the edit.
- Running `npm install` anywhere in `backend/`, or "cleaning" node_modules to fix a gate.
- Reporting a timeout, a hang, or a partial run as a pass.
- Fixing pre-existing red mid-task instead of listing it.
