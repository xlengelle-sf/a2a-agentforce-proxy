# Block 1 — Project Scaffolding & Core Infrastructure

## Goal

A deployed Express/TypeScript app on Heroku with health check, logging, configuration, and error handling. This is the foundation for everything else.

## Dependencies

None — this is the first block.

## Tasks

### 1.1 Initialize Project
- `npm init` with project name `a2a-agentforce-proxy`
- Create `tsconfig.json` (strict mode, ES2022 target, ESM modules)
- Create `.gitignore` (node_modules, dist, .env, *.js in src)
- Create `.env.example` with all environment variables documented
- Create `Procfile`: `web: node dist/index.js`
- Create `app.json` for Heroku (see specs/03 section 7.2)

### 1.2 Install Dependencies
**Production:** `express`, `pino`, `pino-http`, `ioredis`, `uuid`, `dotenv`
**Dev:** `typescript`, `@types/express`, `@types/node`, `tsx`, `vitest`, `eslint`, `prettier`

### 1.3 Package.json Scripts
```json
{
  "build": "tsc",
  "start": "node dist/index.js",
  "dev": "tsx watch src/index.ts",
  "test": "vitest run",
  "test:watch": "vitest",
  "lint": "eslint src/",
  "format": "prettier --write src/"
}
```

### 1.4 Implement Core Files

**`src/index.ts`** — Entry point: load env, validate config, start Express server
**`src/app.ts`** — Express app setup: CORS, JSON body parser, request logger, routes, error handler

**`src/config/config-manager.ts`** — Centralized config access:
- Read all env vars
- Type-safe access to configuration values
- Singleton pattern

**`src/config/env-validator.ts`** — Startup validation:
- Check all required env vars are present
- Fail fast with clear error message listing missing vars

**`src/shared/logger.ts`** — Pino logger:
- JSON output in production
- Pretty-print in development
- Request correlation ID support

**`src/shared/errors.ts`** — Custom error classes:
- `AppError` (base) with statusCode and code
- `AuthenticationError`
- `NotFoundError`
- `ValidationError`
- `UpstreamError` (for Agentforce/A2A errors)

**`src/shared/middleware/error-handler.ts`** — Express error middleware:
- Catch all errors
- Log error details
- Return appropriate HTTP response (no stack traces in production)

**`src/shared/middleware/request-logger.ts`** — pino-http middleware:
- Log every request/response with timing
- Assign correlation ID

**`src/shared/health.ts`** — Health check endpoint:
- `GET /health` → `{ status: "ok", version, uptime, timestamp }`
- Later extended to check Redis connectivity

### 1.5 Deploy to Heroku
- Create Heroku app
- Set minimal config vars (PORT is auto-set by Heroku)
- `git push heroku main`
- Verify `GET /health` returns 200

## Verification

- [ ] `npm run build` compiles without errors
- [ ] `npm run dev` starts the server locally
- [ ] `curl http://localhost:3000/health` returns `{ "status": "ok", ... }`
- [ ] `npm test` runs (even if no tests yet, framework works)
- [ ] Deployed to Heroku: `curl https://{app}.herokuapp.com/health` returns 200

## Files Created

```
a2a-agentforce-proxy/
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── Procfile
├── app.json
└── src/
    ├── index.ts
    ├── app.ts
    ├── config/
    │   ├── config-manager.ts
    │   └── env-validator.ts
    └── shared/
        ├── logger.ts
        ├── errors.ts
        ├── health.ts
        └── middleware/
            ├── error-handler.ts
            └── request-logger.ts
```
