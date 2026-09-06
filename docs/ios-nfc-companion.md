# TapLocal NFC — iOS companion (Core NFC)

The web app stays the main application. The iOS companion is a small native
wrapper whose only job is writing a tag with Apple Core NFC.

## Why

No iPhone browser exposes Web NFC (`NDEFReader`) — not Safari, Chrome, Edge,
Firefox or Brave. Programming from an iPhone therefore goes:

```
TapLocal browser (any iOS browser)
  → createNfcProgrammingSession(plaqueId)      (admin-authorized, server-side)
  → Universal Link https://<NFC_HANDOFF_ORIGIN>/nfc/program/<token>
  → TapLocal NFC (Core NFC) writes + reads back
  → POST /api/public/nfc/program  {action:"report", ...}
  → https://<PUBLIC_APP_ORIGIN>/nfc/return/<session-id>
```

Android Chrome keeps the existing in-browser Web NFC writer. Both platforms
update the same `plaque_programming` / `programming_events` records.

## Native bridge

The only capability the native layer exposes is:

```
writeTapLocalNfc(programmingToken)
```

There is deliberately **no** `writeNfc({ url })`. The server owns the value.

## HTTP contract

`POST /api/public/nfc/program`

Redeem (start):

```json
{ "action": "redeem", "token": "<opaque>" }
→ { "ok": true, "sessionId": "...", "plaqueCode": "TL-467784",
    "businessName": "Maroo", "expectedUrl": "https://…/n/5BTQQU", "expiresAt": "…" }
```

Report (progress / result):

```json
{ "action": "report", "token": "<opaque>", "status": "verified",
  "writtenValue": "https://…/n/5BTQQU" }
→ { "ok": true, "status": "verified", "verified": true, "returnUrl": "…/nfc/return/<id>" }
```

`status` may be `writing`, `written`, `verified` or `failed`. The server
compares `writtenValue` against the stored `expected_url`; a mismatch is
recorded as `failed` / `mismatch` and is never marked verified.

Error codes: `tag_not_found`, `tag_read_only`, `tag_too_small`,
`session_expired`, `mismatch`, `cancelled`, `unknown`.

## Token rules

Random 32 bytes, URL-safe, only the SHA-256 hash is stored, 8-minute lifetime,
single purpose (one plaque, one URL), single use once verified. The token
carries no Supabase session, no admin role, no API key and no customer
destination.

## Native flow

1. Redeem the session, show business / action / plaque / URL.
2. `NFCNDEFReaderSession` → detect tag → `queryNDEFStatus`.
3. Reject read-only tags and tags with insufficient capacity.
4. Write one NDEF URI record containing exactly `expectedUrl`.
5. Read the tag back and compare the normalized value.
6. Report the result, then open the returned `returnUrl`.

## Xcode configuration

- Core NFC framework.
- Capability: **Near Field Communication Tag Reading**.
- Entitlement `com.apple.developer.nfc.readersession.formats` = `["NDEF"]`.
- `Info.plist`: `NFCReaderUsageDescription` — "TapLocal writes the permanent
  TapLocal link onto your SmartPlaque."
- Associated Domains: `applinks:taplocaldigital.com` (add
  `applinks:taplocaldigital.lovable.app` while that host is in use), and serve
  `/.well-known/apple-app-site-association` for `/nfc/program/*`.
- URL scheme fallback: `taplocal` → `taplocal://nfc/program?token=…`.
- No signing certificates or provisioning profiles in this repository.

## Hosts

Configured centrally in `src/lib/nfc-transport.ts`:

| Purpose | Client env | Server env | Default |
| --- | --- | --- | --- |
| App origin | `VITE_PUBLIC_APP_ORIGIN` | `PUBLIC_APP_ORIGIN` | SmartLink base |
| Universal Link origin | `VITE_NFC_HANDOFF_ORIGIN` | `NFC_HANDOFF_ORIGIN` | app origin |

Moving to `https://taplocaldigital.com` is a configuration change, not a code
change. SmartLinks themselves keep using `smartlink.ts`.

## Capacitor

Not recommended for the whole app: the web app is server-rendered, already
deployed and does not need to be shipped in a container. The companion should
be a small native app (or a thin Capacitor shell with one custom Core NFC
plugin) that only handles `writeTapLocalNfc`.
