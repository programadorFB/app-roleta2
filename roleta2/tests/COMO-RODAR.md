# 🧪 Testes — Política de Falha ao Abrir Jogo + Cache

## Pré-requisitos

Você já tem `vitest` e `supertest` nas devDependencies do `package.json`.
Se por algum motivo não tiver, instale:

```bash
npm install -D vitest
```

Nenhuma outra dependência é necessária. Todos os testes são **unit tests puros** —
não precisam de Redis, PostgreSQL, Docker, nem rede.

---

## Como instalar os testes

Copie a pasta `tests/unit/` para dentro do seu projeto:

```
roleta3/
├── tests/
│   └── unit/
│       ├── errorHandler.test.js      ← NOVO
│       ├── apiClient.test.js         ← NOVO
│       ├── redisService.test.js      ← NOVO
│       ├── useGameLauncher.test.js   ← NOVO
│       ├── checkSubscription.test.js ← NOVO
│       ├── failurePolicy.test.js     ← NOVO
│       └── cachePolicy.test.js       ← NOVO
├── src/
├── server.js
├── redisService.js
├── vitest.config.backend.js          ← já existe no seu projeto
└── package.json
```

Se você já tem outros testes em `tests/unit/`, os novos NÃO conflitam —
cada arquivo é independente.

---

## Como rodar

### Rodar TODOS os unit tests (novos + antigos)

```bash
npm test
```

Isso executa o script do seu `package.json`:
```
vitest run --config vitest.config.backend.js tests/unit/
```

### Rodar apenas os novos testes

```bash
# Um arquivo específico
npx vitest run --config vitest.config.backend.js tests/unit/errorHandler.test.js

# Vários arquivos por pattern
npx vitest run --config vitest.config.backend.js tests/unit/cachePolicy.test.js tests/unit/failurePolicy.test.js

# Por nome do describe
npx vitest run --config vitest.config.backend.js -t "isRetryableError"
```

### Rodar em modo watch (re-executa ao salvar)

```bash
npm run test:watch
```

### Rodar pelo script run-tests.sh (se estiver na VPS)

```bash
./run-tests.sh --unit
```

---

## O que cada teste cobre

| Arquivo                        | Testes | O que valida                                                  |
|--------------------------------|-------:|---------------------------------------------------------------|
| `errorHandler.test.js`         |     30 | isRetryableError, handleAutoLogout, translateError, paywall   |
| `apiClient.test.js`            |     18 | findGameUrl (busca recursiva), request() com fetch mockado    |
| `redisService.test.js`         |     16 | TTL values corretos, KEY generators, consistência com polling |
| `useGameLauncher.test.js`      |     32 | LAUNCH_FAILURE enum, tabela de cenários, retry policy         |
| `checkSubscription.test.js`    |     23 | isActive(), fresh DB fallback, fail-open, cenário pós-pagamento|
| `failurePolicy.test.js`        |     25 | Zero becos sem saída, todos failureTypes têm ação, regras     |
| `cachePolicy.test.js`          |     15 | TTL vs polling, invalidação, background monitor, timers       |
| **TOTAL**                      | **159**|                                                               |

---

## Saída esperada

Ao rodar `npm test`, você deve ver algo como:

```
 ✓ tests/unit/errorHandler.test.js (30 tests) 45ms
 ✓ tests/unit/apiClient.test.js (18 tests) 32ms
 ✓ tests/unit/redisService.test.js (16 tests) 8ms
 ✓ tests/unit/useGameLauncher.test.js (32 tests) 12ms
 ✓ tests/unit/checkSubscription.test.js (23 tests) 10ms
 ✓ tests/unit/failurePolicy.test.js (25 tests) 9ms
 ✓ tests/unit/cachePolicy.test.js (15 tests) 7ms

 Test Files  7 passed (7)
      Tests  159 passed (159)
   Start at  ...
   Duration  ...
```

Se algum teste falhar, significa que algo no código não está alinhado
com a política que implementamos. O nome do teste indica exatamente
qual regra foi violada.

---

## Troubleshooting

### "Cannot find module '../../src/errorHandler.js'"
Os testes assumem que estão em `tests/unit/` e os arquivos de código
estão em `src/` e na raiz (`redisService.js`). Verifique que a
estrutura de pastas está correta.

### "vitest: command not found"
```bash
npm install -D vitest
```

### Testes de apiClient.test.js falham com "import" errors
O `apiClient.js` usa `import.meta.env.VITE_API_URL`. Em ambiente de
teste, o `vi.stubEnv()` cuida disso. Se houver problema, crie um
`.env.test` na raiz com:
```
VITE_API_URL=https://api.test.com
```
