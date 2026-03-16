# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev          # Vite dev server (port 5173)
npm run server       # Express backend with nodemon (port 3002)
npm start            # Both concurrently
npm run build        # Production build (outputs to dist/)
npm test             # Unit tests (Vitest)
npm run test:watch   # Tests in watch mode
npm run test:integration  # Integration tests
npm run test:all     # Unit + integration
npm run lint         # ESLint
```

Vite proxies `/api`, `/login`, `/start-game` to `localhost:3002`.

## Architecture

**Full-stack SPA**: React 19 + Vite frontend, Express 5 backend, PostgreSQL, Redis, Socket.IO.

### Backend (`server.js`, `db.js`, `redisService.js`, `subscriptionService.js`)
- Express serves API endpoints and the built SPA from `dist/`
- PostgreSQL stores signals (roulette spins) and subscriptions
- Redis provides cache-aside with TTL-based invalidation (graceful degradation if unavailable)
- Socket.IO broadcasts real-time spins (`novo-giro` event)
- External roulette APIs polled every 1s, normalized, and saved via `src/utils/dbService.js`
- Hubla webhooks manage subscriptions with audit trail
- Motor score persistence: `motor-score.json` tracks signal wins/losses per neighbor mode (0/1/2)

### Frontend (`src/`)
- **No React Router** — uses `activeView` state for page switching
- **Lazy loading**: MasterDashboard, DeepAnalysisPanel, GameIframe
- **Hooks**: `useAuth` (JWT/localStorage), `useSpinHistory` (delta polling + Socket.IO, 1000-item cap), `useGameLauncher` (retry with backoff)
- **API client**: `apiClient.js` centralizes requests with paywall/auth error detection
- **Styling**: CSS Modules, dark theme (MOGNO & OURO: `#0a0806` bg, gold accents `#c9a052`)

### Data Flow
1. Crawler/fetch → `POST /api/report-spin` or auto-fetch → PostgreSQL `signals` table
2. Frontend polls `/api/history-delta?source=X&since=signalId` every 5s
3. `convertSpinItem()` normalizes to `{ number, color, signal, signalId, gameId, date }`
4. Analysis engine (`masterScoring.jsx`) runs 5 strategies: Cavalos, Setores, Vizinhos, Ocultos, Croupier
5. When 3+ strategies converge → entry signal with 5 suggested numbers
6. Motor score: `motorScoreEngine.js` runs passively on backend after each fetch cycle — registers signals and checks spins automatically for ALL tables. Frontend only reads via `GET /api/motor-score?source=X` (polled every 10s)

### Key Tables
- `signals` (signalId UNIQUE, gameId, signal, source, timestamp)
- `subscriptions` (email, status, expiresAt)
- `subscription_audit` (audit log for status changes)
- `motor_scores` (source, neighbor_mode UNIQUE, wins, losses)
- `motor_pending_signals` (source, suggested_numbers INT[], spins_after, resolved_modes JSONB)

## Conventions

- **Components**: PascalCase `.jsx` + matching `.module.css`
- **Hooks**: `useXxx.js` in `src/hooks/`
- **Constants**: UPPER_SNAKE_CASE in `src/constants/roulette.js` and `src/utils/constants.js`
- **Security**: Secrets validated with timing-safe comparison; rate limiters per endpoint type
- **Caching keys**: `hist:{source}`, `latest:{source}:{limit}`, `sub:{email}`
- **No border-radius anywhere** — design uses sharp edges throughout

## Environment

Required env vars: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `REDIS_URL`, `AUTH_PROXY_TARGET`, `CRAWLER_SECRET`, `ADMIN_SECRET`, `HUBLA_WEBHOOK_TOKEN`, `HUBLA_CHECKOUT_URL`, `SENTRY_DSN`. See `.env.example`.

## Important Patterns

- `spinHistory[0]` is always the **newest** spin (array is newest-first)
- `spinHistory` caps at 1000 items — detect new spins by `signalId`, not array length
- Motor score tracked in PostgreSQL via `motorScoreEngine.js` — fully passive, no frontend involvement
- Redis is optional — app degrades gracefully without it
- Migrations are raw SQL in `migrations/` — no ORM

## Scaling (1000+ users)

- **PM2 cluster mode**: `pm2 start ecosystem.config.cjs` — uses all CPUs, each worker handles connections independently
- **Socket.IO Redis adapter**: `@socket.io/redis-adapter` syncs events across PM2 workers via Redis pub/sub
- **DB pool**: Default 50 connections (`DB_POOL_MAX`), shared across cluster workers (total = workers × pool)
- **Fetch dedup**: Only worker 0 (`NODE_APP_INSTANCE=0`) runs the polling loop to avoid duplicate API calls
- **Redis pub/sub clients**: `getPubSubClients()` from `redisService.js` — used by Socket.IO adapter
