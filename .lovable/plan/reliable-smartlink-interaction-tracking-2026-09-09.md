# Reliable SmartLink interaction tracking

## Goal
Make every real `/n/{slug}` NFC tap and `/q/{slug}` QR scan deterministically resolve one current destination, persist a verified customer interaction before redirecting, and leave an admin-visible audit trail when any step fails.

## Live findings
- The app configuration and live database tools point to the same backend project.
- Recent data contains 625 customer interactions: 452 NFC and 173 QR.
- Recent redirect-success rows all have a nearby interaction row.
- There are currently no plaques with duplicate active destinations among configured/live lifecycle states.
- There is no uniqueness constraint preventing a future duplicate.
- One destination row is associated with a different business than its plaque, showing that historical write paths can drift.
- Destination changes are currently implemented independently in multiple admin, activation, reassignment, bulk, workbench, owner, and replacement workflows; some use `.maybeSingle()` and one owner flow writes directly from the browser.
- SmartLink requests and failures are not persisted, and interaction inserts do not verify the returned row ID.

## Database safety
- Add `smartlink_requests` and `smartlink_failures` tables with explicit server-only grants, RLS enabled, useful lookup indexes, request/result/error fields, and no client policies.
- Add one transactional database function that closes every current destination and creates exactly one replacement while preserving destination history.
- Repair any duplicate current destinations by keeping the newest deterministic row and closing older rows, then add a partial unique index allowing at most one active, open destination per plaque.
- Repair the known plaque/destination business mismatch only where the destination is current and the plaque has an assigned business; preserve all historical rows.

## Shared destination logic
- Add a server-only helper that loads all active/open destination candidates, orders by newest `effective_from`, then newest `created_at`, then ID, and returns the deterministic winner plus health counts.
- Add a shared destination-replacement wrapper around the transactional database function.
- Route admin destination changes, setup/workbench, activation, assignment, reassignment, area builder, owner setup, and tag replacement through the shared writer.
- Replace fragile current-destination `.maybeSingle()` reads on operational/status paths with the shared deterministic resolver or explicit ordered list reads.
- Move the customer portal destination mutation out of the browser and into an authenticated server function with membership checks.

## Redirect persistence and audit
- At the start of every SmartLink request, save a request row containing slug, source, test flag, request time, and coarse device information.
- Resolve the plaque and deterministic destination while recording plaque/destination IDs and candidate count on the request.
- For a normal configured tap, insert a minimal canonical `interaction` first and require `.select('id').single()` to return an ID before optional telemetry.
- Keep manufacturing tests, setup opens, inactive taps, and redirect telemetry separate from customer interactions.
- Persist exact database error code/message/details/hint and the failed stage to `smartlink_failures`; also update the request outcome. Never block the visitor longer than necessary or expose internal errors publicly.
- Preserve permanent `/n/{slug}` and `/q/{slug}` routes and their separate NFC/QR source attribution.

## Admin tracking health
- Extend the existing plaque Tracking Status panel with active-destination count, deterministic selected destination, last SmartLink request, outcome, interaction ID, redirect result, and last persistent failure.
- Add an admin-only repair action that closes duplicate current rows and keeps the deterministic winner; show it only when repair is needed.
- Extend the non-counting tracking check to verify request audit writes, canonical event writes, analytics reads, and both test routes.
- Add backend identity and app build/commit status to Admin Settings so deployment mismatches are visible without exposing secrets.

## Verification
- Run focused tests/type validation through the normal harness.
- Confirm the migration leaves exactly one active/open destination for every configured plaque and the partial unique index exists.
- Exercise local `/n/{slug}`, `/q/{slug}`, and `?tl_test=1`; verify direct database rows for requests, interactions, telemetry, and excluded tests.
- Exercise the published `/n/{slug}` and `/q/{slug}` paths, verify their request rows carry the deployed build identifier, and confirm the matching Admin plaque counters increase by exactly one for each real source.
- Confirm NFC programming, verification, batch programming, permanent slugs, QR records, history, and existing analytics are unchanged.
