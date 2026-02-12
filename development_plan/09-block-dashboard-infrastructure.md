# Block 9 — Dashboard Infrastructure & Auth

## Goal

Set up the foundation for the web dashboard: static file serving, cookie-based authentication, event bus for message capture, event store (ring buffer), and the login page.

## Depends On

Block 8 (security hardening complete)

## Files to Create

| File | Purpose |
|---|---|
| `src/dashboard/event-bus.ts` | ConversationEventBus singleton (EventEmitter) + ConversationEvent type |
| `src/dashboard/event-store.ts` | ConversationEventStore ring buffer (500 events max) |
| `src/dashboard/auth.ts` | Cookie auth: login/logout handlers + dashboardAuth middleware |
| `src/dashboard/routes.ts` | Express router for all dashboard endpoints |
| `public/login.html` | Login page |
| `public/js/auth.js` | Login form handling |
| `public/css/dashboard.css` | Base styles (extended in Block 10) |
| `tests/unit/dashboard/event-bus.test.ts` | Event bus tests |
| `tests/unit/dashboard/event-store.test.ts` | Ring buffer tests |
| `tests/unit/dashboard/auth.test.ts` | Cookie auth middleware tests |

## Files to Modify

| File | Changes |
|---|---|
| `src/app.ts` | Add dashboard routes, split helmet CSP, serve static files, add urlencoded parser |

## Tasks

1. Create `ConversationEventBus` singleton extending EventEmitter
2. Create `ConversationEventStore` ring buffer auto-subscribed to bus
3. Create cookie auth (HMAC-signed token, HttpOnly, SameSite=Strict, Secure in prod)
4. Create dashboard Express router with login/logout/status endpoints
5. Create login.html with form
6. Modify app.ts: mount dashboard, split helmet CSP, serve public/
7. Write unit tests

## Verification

- `npm test` — all existing + new tests pass
- `npx tsc --noEmit` — no type errors
- `GET /dashboard/login` returns login HTML
- POST login with correct credentials → sets cookie, redirects
- POST login with wrong credentials → 401
- `GET /dashboard` without cookie → redirects to login
- `GET /dashboard` with valid cookie → serves page
- Existing API auth unchanged
