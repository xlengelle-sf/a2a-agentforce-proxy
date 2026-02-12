# A2A Proxy for Agentforce — Development Plan Overview

## Approach

The project is broken into **8 development blocks**, each self-contained and testable. Each block builds on the previous ones, but can be developed, reviewed, and validated independently.

**MVP Strategy:** Blocks 1–4 deliver a working inbound-only proxy (A2A → Agentforce). Blocks 5–6 add the outbound direction. Blocks 7–8 add streaming and hardening. After Block 8, the proxy is production-ready for single-tenant deployment.

## Block Summary

| Block | Name | Depends On | Key Deliverable |
|-------|------|-----------|----------------|
| **1** | Project Scaffolding | — | Deployed Express app on Heroku with health check |
| **2** | Agentforce Client | Block 1 | Working OAuth + session + messaging to Agentforce |
| **3** | Session Manager | Block 1 | Session mapping with Redis + in-memory stores |
| **4** | Inbound A2A Server | Blocks 2, 3 | External A2A agents can talk to Agentforce |
| **5** | A2A Client (Outbound) | Block 1 | Can call external A2A agents |
| **6** | Delegate Endpoint | Blocks 3, 5 | Agentforce can delegate to external A2A agents |
| **7** | Streaming Support | Blocks 4, 6 | Real-time SSE in both directions |
| **8** | Security & Hardening | All | Auth, rate limiting, error handling, tests, docs |
| **9** | Dashboard Infrastructure | Block 8 | Static serving, cookie auth, event bus/store, login page |
| **10** | Conversation Monitor | Block 9 | Real-time iMessage-style conversation visualization |
| **11** | Setup Wizard | Blocks 9, 10 | Guided Salesforce setup with automated verification |

## Verification Strategy

Each block has its own verification criteria. At the end of each block, we should be able to:
- Run `npm test` and see all tests pass
- Run the app locally with `npm run dev` and hit the new endpoints
- Deploy to Heroku with `git push heroku main` and verify remotely

## File Structure Reference

See `specifications/03-technical-specifications.md` Section 1.2 for the complete directory structure.
