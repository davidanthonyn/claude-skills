---
name: event-change-impact
description: Use when planning or implementing any ctsnetwork-event feature, business-rule, schema, endpoint, report/analytics/export, payment-integration, or auth-integration change — BEFORE writing implementation code. Also use when a prompt asks for something that smells architectural (new table, new route, new metric, new provider).
---

# Event Change Impact

## Overview

Event changes are never as local as they look: reporting has four heads, order state has one load-bearing invariant, docs lie, and the authoritative capability map is damaged. This skill is the pre-flight that finds the blast radius before code exists.

## The map situation (read once, remember forever)

- `docs/system-capability-map.md` is **0 bytes**. The real map is **`event/.capability-map-recovered.md`** (2026-08-01).
- Even the recovered map is missing §6.2–§11.2 (including §7 dependency map and §8 reporting coverage that other docs tell you to read). **Use §12 (Change Impact Index) as the substitute** — it survives and covers the same ground per-change.
- The event root is not a git repo: never rewrite the map in place without copying it first.
- Modules newer than the map (`payments/`, `event-truth/`, `release-safeguards/`, `exports/`, `analytics-views/`): read source + local CLAUDE.md, and label your impact analysis "map-uncovered" for those.

## Procedure

1. **Glossary:** open `event/CONTEXT.md`; adopt its terms (e.g., "Bukti Sesi Checkout", "Tier Terjadwal"); never use its `_Avoid_` terms in code, copy, or the report.
2. **Locate the capability** in map §5/§6.1 (grep by route or model name if needed). Note its Status, Depends-on, and Dependants.
3. **Walk the §12 row** matching your change class (tier, order status, webhook, redemption, scanner assignment, publication, checkout proof, schedule, deletion, promo, roles, reporting, auth, "any new entity/field"). Everything the row lists gets inspected or explicitly ruled out in writing. `Needs Impact Review` = not a dependency until proven.
4. **The four-headed reporting check** (for any new field, metric, or status): recap and export are coupled by construction; **analytics (`analytics.service.ts`) and dashboard (`dashboard.repository.ts`) are separate aggregations that will NOT follow**. Write one line each for recap / export / analytics / dashboard: "updated" or "not applicable because …".
5. **History check:** no audit trail exists; reports join mutable masters. Decide: does this value need a snapshot (pattern: `order_items.price`, `checkout_session_items.price` via `commercialSnapshotId`)? Does an edit/delete rewrite historical reports? Say so.
6. **Invariant check — do not touch these without flagging it as an approval item:**
   - `applyTransition` conditional `updateMany` — the ONLY legal way order status moves (webhook consumer, expiry, sweep, polling all share it).
   - Single `sold` increment at order-time reservation (success path never increments; FAILED/EXPIRED releases via `GREATEST(sold-qty,0)`).
   - Redemption's conditional update + same-txn audit row, deliberately lock-free. Proposals to "add a lock" are regressions.
   - `TicketsModule` transitive registration (`app.module.ts` — removing OrdersModule/EventRecapModule imports kills ticket routes silently).
   - `service_name: 'ticketing'` ↔ `*_TICKETING` env pair on the payment side.
7. **Contract conventions:** DTO = class + `static schema` (zod); camelCase in code, interceptor snake_cases the wire (SSE excepted — manual); schema enums used exactly; `event_stock_reservations`/`ReservationStatus` are dead — never build on them; public DB-heavy routes consider the admission gate + display-only cache rule.
8. **Permission check:** `@Permissions` is OR-semantics — adding a key to a route WIDENS who can call it; check the seed matrix and say whether access changed. Frontend role-gates won't follow a permission change (they gate on role keys).
9. **Ship together:** the map row(s), `docs/database-schema.md` (column changes), and the touched module's `CLAUDE.md` are updated in the SAME change set, per map §14. A behavior change with an untouched map is an incomplete deliverable.
10. **Gate on the stop-list:** schema, API contract, auth boundary, payment semantics, >100-line refactor, anything in the 7 hard guardrails → one concrete question with a recommendation, then wait.

## Quick smell test

| If your plan says… | Reality |
|---|---|
| "This is isolated to its controller" | Nothing that touches orders, tiers, tickets, or reporting is. Walk §12 anyway. |
| "I'll update analytics later" | Later never comes; that's how the three-headed drift happened. Same change set or an explicit named gap. |
| "The old CLAUDE.md says a self-heal / MidtransService / academy module exists" | Documented lies (manual §3.2). Verify in code. |
| "I'll add a lock to be safe" | The lock-free conditional updates ARE the safety. A mutex caused the mass-409 outage. |
| "New enum value, quick migration" | Enum changes fan into DX-01's status-filter modal (every value listed + checked by default), status breakdowns, and the state machine. Walk the row. |

## Output of this skill

A short written impact note (in your plan or report): capability ID(s), the §12 row walked, four-surface verdict, snapshot/audit verdict, invariants touched (ideally: none), docs to update, and open approval items. Only then write code.
