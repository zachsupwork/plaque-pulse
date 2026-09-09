# TapLocal — live tap intelligence, AI attribution & customer activation

Builds on the existing businesses, locations, plaques, destinations, events, memberships,
SmartLinks, admin setup and auth. No parallel systems, no schema rewrites, no changes to
plaque IDs, slugs, `/n/:slug`, `/q/:slug` or destination history.

## 1. Admin home — live NFC / QR

A "Today — live" panel at the top of `/admin`, refreshing every 4 seconds:

- Interactions, NFC taps, QR scans, last interaction, last NFC, last QR (Toronto time)
- Counts only real customer rows: `event_type = interaction` with `source_type` of nfc or qr.
  Manufacturing tests, setup opens, inactive taps, redirect telemetry and `tl_test=1` stay excluded.
- Invariant check: interactions must equal NFC + QR; a mismatch shows a warning line.
- If the read fails, the panel shows "—  Analytics unavailable" instead of a false zero.

Below it, **Live tap & scan activity** — newest 10 rows with source, business, plaque,
placement, destination, device and time. Every stat and every row is a link.

## 2. Click-through analytics

- NFC/QR stats link to `/admin/analytics` with `source` and `period` in the address.
- Analytics gains filters: date range, source, business, plaque, placement, destination,
  device, destination category (Google review / Instagram), has attribution, confidence.
- Every interaction row links to a new page `/admin/interactions/{eventId}`.

## 3. AI interaction inspector

`/admin/interactions/{id}` has two clearly separated halves.

**What TapLocal observed** — only stored facts: exact time, NFC or QR, business, address,
plaque, placement, slug, destination, redirect result, device family, browser, OS when
reliably known, coarse region, anonymous session key, and other anonymous activity sharing
that key. Anything not recorded reads "not recorded" — never invented.

**TapLocal AI analysis** — looks around the interaction for possible downstream results
(review, customer photo, Maps photo visibility change, contributor activity, website/menu
open, order, booking, inquiry, coupon). Each candidate shows a confidence percent, an
evidence checklist (same business, matching destination, timing gap, competing interactions)
and a badge:

- OBSERVED — TapLocal measured it directly
- EXTERNAL — a public/connected source reported it
- INFERRED — AI believes the events may be related
- CONFIRMED — a direct integration proves it

Inferred candidates always carry "LIKELY MATCH — NOT CONFIRMED". Physical visitor identity
always reads "Unknown"; a named contributor is only ever shown as a possible association with
an estimated percentage. No IP, device, phone, Apple, Google or Instagram identity is used.

A journey strip renders tap → destination → review → photo → prominence, with inferred stages
visibly dimmer and labelled than observed ones.

## 4. Google Maps photo visibility

Tracked as four distinct facts, never merged: contributor uploaded a photo, photo exists in
the gallery, photo is Top 10 / Top 3, photo is currently the main/cover image. Statuses:
MAIN PHOTO, COVER PHOTO, TOP 3, TOP 10, GALLERY ONLY, NO LONGER PROMINENT, NOT DETECTED,
NEEDS VERIFICATION. Every record stores confidence, verification type, checked-at and evidence.

Evidence sources: the public Google listing polled through the existing Places integration
(rating, review count, recent reviews and photos), plus staff-uploaded screenshots and screen
recordings. A scanner matches an uploaded image to a known photo using perceptual hashing so
crops, resizes and recompressions still match. Nothing is ever fabricated when a check fails —
it records NEEDS VERIFICATION.

Contributor watchlists work both platform-wide and per business (e.g. Tommy Dempt, Level 5
Local Guide, with contributor ID and profile link). Alerts appear in admin when a new review
or photo is detected, a photo enters Top 10 or Top 3, becomes main, or loses prominence.
Copy never claims the contributor chose the main image — Google may promote photos itself.

## 5. TapLocal AI — today

An admin summary card: interactions, NFC, QR, possible review conversions, new customer
photos, contributor photos entering Top 3, and the latest possible result. Every line clicks
through to the interaction or evidence behind it.

## 6. Activate your plaque

`/activate` becomes a simple customer version of admin setup:

scan activation QR / tap NFC / enter code → search business → confirm → sign in or create
account → choose destination → choose placement → activate → owner dashboard.

**Preconfigured plaque** — shows "We found your plaque" with business, plaque, placement and
destination, and a single Claim & activate action. No rebuilding setup. Plaque ID, slug, NFC
and QR URLs, destination, event and placement history all carry over untouched.

**Unconfigured plaque** — business search (reusing existing discovery, with auto-filled links
so owners never retype what TapLocal can find), destination choice (Google reviews, Instagram,
menu, website, ordering, reservations, other) and placement choice, then Activate.

**Security** — searching a business proves nothing. Activation requires a valid activation
credential, a signed-in account, server-side authorisation and a claimable plaque state.
Public `/n` and `/q` links grant no management rights. An already-assigned plaque is never
silently reassigned; cross-business moves stay admin-only through the existing reassign flow.

## 7. Owner dashboard

After activation the owner sees, in simpler language than admin: today's NFC taps, QR scans
and total interactions, possible results, reviews, Google Maps photo visibility and AI
insights — scoped to their own business only.

## Verification before this is called done

Real `/n/{slug}` creates one interaction row with source nfc; real `/q/{slug}` creates one
with source qr. Admin count, owner count and live feed all move, and clicking the row opens
that same interaction. AI attaches possible reviews and photos without ever asserting visitor
identity.

## Technical notes

- New tables (admin/service-role only, RLS locked, explicit grants): `attribution_candidates`
  (interaction link, kind, confidence, evidence jsonb, badge, status), `contributor_watchlist`
  (platform-wide plus optional business scope), `maps_photo_observations` (location,
  contributor, status, rank, confidence, verification type, checked_at, perceptual hash,
  evidence), `evidence_uploads` (screenshot/recording, hash, extracted fields, linked
  observation). Existing tables are untouched.
- Attribution scoring is a server function: time proximity to the tap, destination-type match,
  business match and competing-interaction count feed a bounded score; Lovable AI summarises
  the evidence in plain language but never invents facts or raises a badge above INFERRED.
- Places polling and photo checks run through the existing Google Places server helpers and
  are rate-limited and cached; failures record NEEDS VERIFICATION rather than a false negative.
- Analytics filters live in the route address so admin views are shareable.
- Owner-facing reads go through authenticated, membership-scoped server functions.
