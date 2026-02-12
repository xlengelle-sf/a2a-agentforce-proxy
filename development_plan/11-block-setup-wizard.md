# Block 11 — Salesforce Setup Wizard Tab

## Goal

Guided Salesforce setup with automated verification steps where possible, manual step-by-step guidance where not.

## Depends On

Block 9 (auth, routes), Block 10 (dashboard.html with tabs)

## Files to Create

| File | Purpose |
|---|---|
| `src/dashboard/setup-wizard.ts` | API handlers: test-oauth, discover-agents, test-session, test-message, verify-proxy |
| `public/js/wizard.js` | 8-step wizard UI with navigation, validation, and API calls |
| `tests/unit/dashboard/setup-wizard.test.ts` | Wizard API handler tests (mock Salesforce) |

## Files to Modify

| File | Changes |
|---|---|
| `src/dashboard/routes.ts` | Wire wizard API routes |
| `public/css/dashboard.css` | Add wizard styles (progress bar, forms, code blocks) |

## Tasks

1. Create setup-wizard.ts with 5 API handlers
2. Create wizard.js with 8-step flow and navigation
3. Style wizard: progress bar, forms, success/error indicators, code blocks
4. Wire routes
5. Write tests with mocked Salesforce responses

## Verification

- `npm test` passes
- Step through wizard with valid Salesforce credentials
- OAuth test shows green checkmark
- Agent discovery returns list
- Test message shows agent response
- Manual steps show clear instructions
