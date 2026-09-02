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

### Área administrativa (`/admin`)

Painel interno portado do roleta3. É um **app à parte** dentro do mesmo bundle:
`main.jsx` olha o pathname e monta `src/admin/AdminApp.jsx` (lazy) em vez do
`App` quando a URL é `/admin`. O `try_files` do nginx já entrega o mesmo
`index.html` nesse caminho — não há rota nova de servidor para a página.

- **Autenticação própria** (`server/adminAuthService.js`): contas em
  `admin_users` com hash scrypt, sessão opaca no Redis (TTL 8h, janela
  deslizante). Não é JWT porque JWT não é revogável, e logout/desativação
  precisam valer na hora. A conta é reconferida no banco a cada request.
- **Sem auto-registro.** Contas nascem pelo CLI:
  `node server/scripts/createAdmin.js <email> ["Nome"]` (senha pedida oculta).
- **`requireAdminSession`** substituiu o antigo `requireAdminAuth`: aceita a
  sessão nominal OU o mesmo `x-admin-secret` de antes, então scripts e curl
  existentes seguem funcionando. Ações que recaem sobre uma pessoa (assinatura,
  ban, disconnect, revelar CPF) exigem `requireAdminIdentity` — o secret
  compartilhado responde "é um admin?", nunca "qual admin?".
- **Cerca de rede** (`server/adminGate.js`): `ADMIN_ALLOWED_IPS` (IPs/CIDRs) ou
  `ADMIN_REQUIRE_CF_ACCESS`. Responde 404, não 403 — para quem não deveria estar
  ali, o painel não existe. Desligada por padrão, e o boot avisa quando está.
- **Telemetria** (`server/telemetryService.js`, `src/lib/telemetry.js`): a sessão
  de uso abre no connect do Socket.IO e fecha no disconnect; os eventos vêm em
  lote por `POST /api/telemetry` (whitelist fechada de nomes). `duration_seconds`
  usa `last_seen_at`, não `ended_at` — mede tempo de aba à frente, não tempo de
  socket. Reconexões são costuradas em visitas na LEITURA (`stitchSessions`).
  Job horário no worker principal: fecha órfãs, roda o rollup diário e purga.
- **Espelho da casa** (`server/platformProfileService.js`): lê `/profile` e
  `/wallet` com o JWT do próprio usuário, no login, e grava em
  `platform_profiles`. É o backend que lê, não o app — se o app reportasse,
  bastaria forjar um POST para se declarar outra pessoa. Sem `await` no login.
- **Coletor de banca** (`server/creditCollector.js`): de 5 em 5 minutos relê o
  `credit` de quem está com o app aberto e grava um ponto quando o número muda.
  O token sai do handshake do Socket.IO — é a única credencial com que a casa
  aceita responder o saldo, e ela vive só o tempo da conexão (nada é guardado).
  Cada worker do PM2 varre os SEUS sockets: por isso este job roda fora do
  `if (isMainWorker)`, ao contrário de todos os outros, e nenhum JWT trafega
  pelo Redis. Consequência a dizer em voz alta no painel: **buraco no gráfico é
  app fechado, não saldo parado**.
- **Contador de premium**: `dias_restantes` e `premium_ativo` são calculados no
  servidor (`adminService`), não no navegador — `expires_at` sozinho engana
  (`canceled` com data futura não dá acesso; `active` sem data dá para sempre).
  Plano com `source = 'admin'` aparece marcado como *personalizado*.
- Abas: Visão geral, Usuários, Créditos, Retenção, Engajamento, Moderação,
  Auditoria.

### Data Flow
1. Crawler/fetch → `POST /api/report-spin` or auto-fetch → PostgreSQL `signals` table
2. Frontend polls `/api/history-delta?source=X&since=signalId` every 5s
3. `convertSpinItem()` normalizes to `{ number, color, signal, signalId, gameId, date }`
4. Analysis engine (`masterScoring.jsx`) runs 5 strategies: Cavalos, Setores, Vizinhos, Ocultos, Croupier
5. When 3+ strategies converge → entry signal with 5 suggested numbers
6. Motor score: `motorScoreEngine.js` runs passively on backend after each fetch cycle — registers signals and checks spins automatically for ALL tables. Frontend only reads via `GET /api/motor-score?source=X` (polled every 10s)

### Key Tables
- `signals` (signalId, gameId, signal, source, timestamp, id SERIAL) — UNIQUE(signalId, source)
- `subscriptions` (user_id PK, email, hubla_customer_id, subscription_id, status, plan_name, expires_at)
- `webhook_logs` (event_type, payload JSONB, status, error_message)
- `subscription_audit` (audit log for status changes)
- `motor_scores` (source, neighbor_mode UNIQUE, wins, losses)
- `motor_pending_signals` (source, suggested_numbers INT[], spins_after, resolved_modes JSONB)
- `admin_users` (email UNIQUE, password_hash scrypt, role, disabled_at) — painel
- `admin_audit` (admin_email, action, target_email, payload JSONB, ip_hash)
- `app_sessions` (user_email, socket_id, started_at, ended_at, last_seen_at, duration_seconds, ip_hash)
- `app_events` (user_email, event, view, meta JSONB) — retenção 90 dias
- `metrics_daily` (day PK, dau, premium_dau, new_users, sessions, total_seconds) — rollup, não expira
- `platform_profiles` (email PK, nome, documento, telefone, saldo, ftd_valor, perfil_bruto/carteira_bruto JSONB)
- `platform_balance_history` (email, saldo, delta, origem, lido_em) — série do
  credit; uma linha por MUDANÇA de saldo, não por leitura

## Conventions

- **Components**: PascalCase `.jsx` + matching `.module.css`
- **Hooks**: `useXxx.js` in `src/hooks/`
- **Constants**: UPPER_SNAKE_CASE in `src/constants/roulette.js` and `src/utils/constants.js`
- **Security**: Secrets validated with timing-safe comparison; rate limiters per endpoint type
- **Caching keys**: `hist:{source}`, `latest:{source}:{limit}`, `sub:{email}`
- **No border-radius anywhere** — design uses sharp edges throughout

## Environment

Required env vars: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `REDIS_URL`, `AUTH_PROXY_TARGET`, `CRAWLER_SECRET`, `ADMIN_SECRET`, `HUBLA_WEBHOOK_TOKEN`, `HUBLA_CHECKOUT_URL`, `SENTRY_DSN`. See `.env.example`.

Área administrativa: `ADMIN_ALLOWED_IPS`, `ADMIN_REQUIRE_CF_ACCESS`,
`ADMIN_MASK_PII`, `TELEMETRY_IP_SALT` (sem ele o IP não é gravado em lugar
nenhum, nem na auditoria), `TELEMETRY_EVENT_RETENTION_DAYS`,
`TELEMETRY_SESSION_RETENTION_DAYS`, `PLATFORM_API_URL` (cai no
`AUTH_PROXY_TARGET` quando ausente), `PLATFORM_SYNC_TIMEOUT_MS`, `BRAND`.

Coletor de banca (todos opcionais, com padrão): `CREDIT_POLL_INTERVAL_MS`
(300000), `CREDIT_MIN_GAP_MS` (240000 — piso entre duas leituras da mesma
pessoa), `CREDIT_POLL_CONCURRENCY` (4), `CREDIT_POLL_MAX` (300 por ciclo),
`CREDIT_HEARTBEAT_HOURS` (6 — ponto de vida quando o saldo não muda),
`CREDIT_RETENTION_DAYS` (730).

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
