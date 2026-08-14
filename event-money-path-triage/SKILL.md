---
name: event-money-path-triage
description: Use when debugging ctsnetwork-event checkout, orders, payment, callbacks, ticket issuance, or scanner failures — 400/403/409/500/503 on /api/orders or /tickets, orders stuck PENDING after payment, mass checkout errors, RabbitMQ errors, or "the gateway is down" reports.
---

# Event Money-Path Triage

## Overview

Every production incident on this path so far had a **known signature**. Triage = match the signature FIRST; investigate blind only when no row fits. The expensive failures here were all misdiagnoses (an outage read as a config error, a config error read as an outage, a pool timeout read as a session bug).

**Before anything: two 30-second checks**

1. **Stale container?** `docker ps --format "table {{.Names}}\t{{.CreatedAt}}"` — if CreatedAt predates the last edit, every observation is invalid. Rebuild first.
2. **Memory search:** grep `E:\davidanthonyn_brain\Claude Code Memory\MEMORY.md` for your error string/keywords. Several of these incidents have full write-ups.

## Signature table

| Symptom | Likely cause | Confirm by | Known resolution |
|---|---|---|---|
| 400 on a public POST (`/api/orders`, `/api/orders/checkout-proofs`) **only for logged-in users**; guests fine | `CsrfGuard` origin rejection (shares `CORS_ORIGIN` exact-match allowlist with CORS) | Compare request Origin header to `CORS_ORIGIN` entries (www vs apex are different origins) | Add the exact origin to the allowlist env — config, not code |
| 400 with `code: VALIDATION_FAILED`, Indonesian message, per-field codes | Zod buyer-contract rejection (by design) | Response body lists `buyerName`/`buyerEmail`/`buyerPhone` codes in order | Fix the input; the contract is canonical — do not loosen it |
| 500 on browser GET of an orders route | `@Get(':id')` + `@db.Uuid` collision → Prisma **P2023** unmapped | Backend log shows P2023 | Route/param validation fix; known incident (memory: checkout-proof-400-triage) |
| Mass 409 `INVALID_CHECKOUT_SESSION` under load | **Pool starvation**: swallowed DB-read error + `FOR UPDATE` mutex vs PgBouncer `default_pool_size=5` | PgBouncer/Postgres logs show pool timeouts (P2024); errors correlate with load, not with sessions | `FOR SHARE` + split the catch; P2024-at-order-time now maps to **503 `DATABASE_POOL_TIMEOUT`**, never 409 (memory: checkout-409-was-pool-starvation) |
| Scattered 503 `SERVICE_BUSY` / `SERVICE_BUSY_TIMEOUT`, `Retry-After: 3` | Admission gate (global cap 4) doing its job | Response shape matches the controlled 503 | Not a bug. Capacity/config discussion only |
| 500 with Prisma **P2010** mentioning a raw query | `$queryRaw` on a void-returning function (`pg_advisory_xact_lock`) | Error names the function | Use `$executeRaw` (memory: prisma-void-needs-executeraw — this once killed ALL checkouts) |
| Order stuck `PENDING` after buyer paid | (a) callback consumer-suffix mismatch — anything but `*_TICKETING` makes payment **warn-and-skip silently**; (b) RabbitMQ path down; (c) local-only run — gateway can't reach localhost | Payment-service logs for dispatch warnings; RabbitMQ queue depth; remember the 5-min sweep is the recovery net, 1-min local expiry is separate | Fix env pair `SERVICE_CALLBACK_URL_TICKETING`/`INTERNAL_API_KEY_TICKETING`; for local E2E use ngrok to :3007 (docs/how-to-test-both-in-local.md §5) |
| RabbitMQ `403 ACCESS_REFUSED` | **Credential drift on a persistent volume** — `RABBITMQ_DEFAULT_*` applies only on FIRST boot of an empty datadir | Read-only: `docker exec ctsnetwork-rabbitmq rabbitmqctl list_users` / `list_permissions -p <vhost>` / `authenticate_user <u> <p>` | Align credentials or reset the user via rabbitmqctl. **Restarting the container fixes nothing** (memory: rabbitmq-403-access-refused-persistent-volume) |
| `/scanner` crashes only on re-scanning an already-used ticket | SSE bypasses `ResponseTransformInterceptor` → camelCase payload hit a snake_case-reading mapper; success path dedupes the broken event away | Reproduce with a used ticket; inspect the SSE frame casing | Hand-shape SSE payloads to the wire contract (memory: sse-bypasses-response-interceptor) |
| "Gateway is down" / opaque 500 from payment service | Often a **config error masked as an outage** (e.g. `baseUrl()` throwing inside the try block) | Read the payment service's own logs before believing "outage" — VPS log commands that actually work are in memory note `ctsnetwork-event-checkout-500-masks-gateway-error` | Fix config; do not failover/panic (memory: sumopod-config-error-masked-as-outage) |
| Payment events consumed twice / not at all | Inbox/outbox layer: check `ProcessedMessage` rows, DLQ `event.payment-events.dlq`, retry queues 5s/30s/2m | `rabbitmqctl list_queues` depths; DLQ non-empty = poison messages | Replay of same messageId ACKs without side effects by design; DLQ contents need human review |

## Rules of engagement

- **One variable at a time.** State the hypothesis, the single check, the result. 3 failed hypotheses → stop, write down what's excluded, reassess (this is the global debugging protocol; it applies doubly on money paths).
- **Read-only first on shared infra.** rabbitmqctl list/authenticate commands, log reads, and SELECTs are always safe; restarts, credential edits, and requeue/purge are approval items.
- **Never mutate order state in a real database** (`UPDATE orders SET status=…`) without an explicit instruction naming the order. The webhook/sweep transition path exists precisely so humans don't hand-flip statuses. Local throwaway DBs are the exception (and note ticket/email side effects won't fire).
- **Do not "fix" designed responses:** 409 business conflicts, 429 throttles, 503 admission, `EVENT_PROFILE_REQUIRED`/`EVENT_ROLE_REQUIRED` 403s are contracts, not bugs.
- **Sweeps ≠ gateway:** expiry is a 1-minute local-clock cron with no payment call; late-paid recovery is a separate 5-minute sweep. Don't conflate their logs.
- **Close the loop:** a new signature (not in the table) that costs >30 minutes gets a memory note AND a new row in this table, same session.

## Red flags

- "Let me just restart RabbitMQ / the container and see" — restart-as-diagnosis destroys evidence and fixes nothing here.
- Reading the event backend's logs to diagnose a payment-service failure (wrong service — go where the error is thrown).
- Concluding "outage" without having read the throwing service's own log line.
- Loosening validation, throttles, or the admission gate to make an error disappear.
