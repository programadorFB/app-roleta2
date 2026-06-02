#!/usr/bin/env bash
# End-to-end smoke test do gerenciamento via gateway Express.
#
# Cobre:
#   - Auth gates (401 sem token, 403 sem subscription)
#   - User profile (GET/PUT)
#   - Betting profile (CRUD)
#   - Transactions (list keyset, deposit, withdraw, gains, losses, update, delete)
#   - Banca inicial
#   - Balance
#   - Objectives (CRUD)
#   - Betting sessions (start/end)
#   - Stats (performance, risk)
#   - Bank reset
#
# Uso:
#   BASE=http://localhost:82 EMAIL=rogerallan4004@gmail.com bash e2e_test.sh

set -u

BASE="${BASE:-http://localhost:82}"
EMAIL="${EMAIL:-rogerallan4004@gmail.com}"
UA="Mozilla/5.0 (compatible; e2e-test)"

# JWT fake (HS256-style, payload base64url, sem assinatura válida — basta
# o roleta3 gateway decodificar o email)
PAYLOAD=$(printf '{"email":"%s","sub":"%s"}' "$EMAIL" "$EMAIL" | base64 -w0 | tr '+/' '-_' | tr -d '=')
JWT="eyJhbGciOiJIUzI1NiJ9.${PAYLOAD}.sig"

PASS=0
FAIL=0
FAILED_TESTS=()

assert() {
  local name="$1"
  local actual="$2"
  local expected_pattern="$3"
  if [[ "$actual" =~ $expected_pattern ]]; then
    PASS=$((PASS + 1))
    printf '  \033[32m✓\033[0m %-55s %s\n' "$name" "$actual"
  else
    FAIL=$((FAIL + 1))
    FAILED_TESTS+=("$name (esperado=~$expected_pattern atual=$actual)")
    printf '  \033[31m✗\033[0m %-55s %s\n' "$name" "$actual"
  fi
}

req() {
  # uso: req METHOD PATH [BODY] [EXTRA_HEADER:VAL]
  local method="$1" path="$2" body="${3:-}" extra="${4:-}"
  local args=(-s -o /tmp/e2e_body -w '%{http_code}' -X "$method"
              -H "User-Agent: $UA"
              -H "Authorization: Bearer $JWT"
              -H "Content-Type: application/json")
  [[ -n "$extra" ]] && args+=(-H "$extra")
  [[ -n "$body" ]] && args+=(-d "$body")
  curl "${args[@]}" "${BASE}${path}"
}

body() { cat /tmp/e2e_body 2>/dev/null; }
extract() { body | python -c "import sys,json; d=json.load(sys.stdin); print($1)" 2>/dev/null; }

section() { printf '\n\033[36m=== %s ===\033[0m\n' "$1"; }


# ─────────────────────────────────────────────────────────────
section 'Auth gates'

# sem JWT -> 401
code=$(curl -s -o /dev/null -w '%{http_code}' -H "User-Agent: $UA" "${BASE}/api/gerenciamento/balance")
assert 'GET /balance sem token' "$code" '^401$'

# JWT com email não-assinante -> 403
PAYLOAD_NOSUB=$(printf '{"email":"nobody@example.com","sub":"nobody@example.com"}' | base64 -w0 | tr '+/' '-_' | tr -d '=')
JWT_NOSUB="eyJhbGciOiJIUzI1NiJ9.${PAYLOAD_NOSUB}.sig"
code=$(curl -s -o /dev/null -w '%{http_code}' -H "User-Agent: $UA" -H "Authorization: Bearer $JWT_NOSUB" "${BASE}/api/gerenciamento/balance")
assert 'GET /balance email sem subscription' "$code" '^403$'


# ─────────────────────────────────────────────────────────────
section 'User profile'

code=$(req GET /api/gerenciamento/user/profile)
assert 'GET /user/profile' "$code" '^200$'

code=$(req PUT /api/gerenciamento/user/profile '{"profile_photo":"avatar3"}')
assert 'PUT /user/profile (avatar)' "$code" '^200$'

code=$(req PUT /api/gerenciamento/user/profile '{"remove_profile_photo":true}')
assert 'PUT /user/profile (remove avatar)' "$code" '^200$'


# ─────────────────────────────────────────────────────────────
section 'Betting profile'

code=$(req POST /api/gerenciamento/betting-profiles '{"profile":{"id":"balanced","title":"E2E","description":"teste"},"riskValue":5,"bankroll":1000,"stopLoss":100,"stopLossPercentage":10,"profitTarget":300}')
assert 'POST /betting-profiles' "$code" '^201$'
PROFILE_ID=$(extract 'd["data"]["id"]')

code=$(req GET /api/gerenciamento/betting-profiles)
assert 'GET /betting-profiles (ativo)' "$code" '^200$'

code=$(req PUT "/api/gerenciamento/betting-profiles/${PROFILE_ID}" '{"stopLoss":150,"profitTarget":500}')
assert 'PUT /betting-profiles/:id' "$code" '^200$'


# ─────────────────────────────────────────────────────────────
section 'Banca inicial'

code=$(req PUT /api/gerenciamento/user/profile '{"initial_bank":1000}')
assert 'PUT /user/profile (initial_bank=1000)' "$code" '^200$'

code=$(req GET /api/gerenciamento/balance)
assert 'GET /balance' "$code" '^200$'
INITIAL=$(extract 'd["initial_bank"]')
[[ "$INITIAL" == "1000.00" ]] && PASS=$((PASS+1)) && echo "  ✓ initial_bank=1000.00" || { FAIL=$((FAIL+1)); echo "  ✗ initial_bank=$INITIAL (esperado 1000.00)"; }


# ─────────────────────────────────────────────────────────────
section 'Transactions'

code=$(req POST /api/gerenciamento/transactions '{"type":"deposit","amount":500,"date":"2026-05-19","category":"Pix","description":"E2E deposit"}')
assert 'POST /transactions (deposit)' "$code" '^201$'
TX_DEPOSIT=$(extract 'd["data"]["id"]')

code=$(req POST /api/gerenciamento/transactions '{"type":"withdraw","amount":100,"date":"2026-05-19","category":"Saque"}')
assert 'POST /transactions (withdraw)' "$code" '^201$'

code=$(req POST /api/gerenciamento/transactions '{"type":"gains","amount":200,"date":"2026-05-19","category":"Roleta"}')
assert 'POST /transactions (gains)' "$code" '^201$'

code=$(req POST /api/gerenciamento/transactions '{"type":"losses","amount":50,"date":"2026-05-19","category":"Roleta"}')
assert 'POST /transactions (losses)' "$code" '^201$'

# validações
code=$(req POST /api/gerenciamento/transactions '{"type":"invalid","amount":10,"date":"2026-05-19"}')
assert 'POST /transactions (tipo inválido → 400)' "$code" '^400$'

code=$(req POST /api/gerenciamento/transactions '{"type":"deposit","amount":-10,"date":"2026-05-19"}')
assert 'POST /transactions (valor negativo → 400)' "$code" '^400$'

# listagem
code=$(req GET '/api/gerenciamento/transactions?limit=2')
assert 'GET /transactions?limit=2' "$code" '^200$'
N_FIRST=$(extract 'len(d["data"])')
HAS_MORE=$(extract 'd["pagination"]["has_more"]')
CURSOR=$(extract 'd["pagination"]["next_cursor"] or ""')
[[ "$N_FIRST" == "2" ]] && PASS=$((PASS+1)) && echo "  ✓ 1ª página: 2 itens" || { FAIL=$((FAIL+1)); echo "  ✗ 1ª página: $N_FIRST (esperado 2)"; }
[[ "$HAS_MORE" == "True" ]] && PASS=$((PASS+1)) && echo "  ✓ has_more=true" || { FAIL=$((FAIL+1)); echo "  ✗ has_more=$HAS_MORE"; }

# 2ª página via cursor
if [[ -n "$CURSOR" ]]; then
  code=$(req GET "/api/gerenciamento/transactions?limit=2&cursor=${CURSOR}")
  assert 'GET /transactions (página 2 via cursor)' "$code" '^200$'
fi

# update
code=$(req PUT "/api/gerenciamento/transactions/${TX_DEPOSIT}" '{"amount":600,"description":"E2E deposit atualizado"}')
assert 'PUT /transactions/:id' "$code" '^200$'

# summary
code=$(req GET /api/gerenciamento/transactions/summary)
assert 'GET /transactions/summary' "$code" '^200$'


# ─────────────────────────────────────────────────────────────
section 'Dashboard / Analytics'

code=$(req GET /api/gerenciamento/dashboard/overview)
assert 'GET /dashboard/overview' "$code" '^200$'

code=$(req GET /api/gerenciamento/analytics/overview)
assert 'GET /analytics/overview' "$code" '^200$'

code=$(req GET '/api/gerenciamento/analytics/monthly?months=6')
assert 'GET /analytics/monthly' "$code" '^200$'

code=$(req GET '/api/gerenciamento/stats/performance?period=monthly')
assert 'GET /stats/performance' "$code" '^200$'

code=$(req GET /api/gerenciamento/stats/risk-analysis)
assert 'GET /stats/risk-analysis' "$code" '^200$'


# ─────────────────────────────────────────────────────────────
section 'Objectives'

code=$(req POST /api/gerenciamento/objectives '{"title":"E2E objetivo","target_amount":1000,"current_amount":250,"target_date":"2026-12-31","priority":"high","category":"viagem"}')
assert 'POST /objectives' "$code" '^201$'
OBJ_ID=$(extract 'd["data"]["id"]')

code=$(req GET /api/gerenciamento/objectives)
assert 'GET /objectives' "$code" '^200$'

code=$(req PUT "/api/gerenciamento/objectives/${OBJ_ID}" '{"current_amount":1000}')
assert 'PUT /objectives/:id (completa)' "$code" '^200$'
STATUS=$(extract 'd["data"]["status"]')
[[ "$STATUS" == "completed" ]] && PASS=$((PASS+1)) && echo "  ✓ status=completed" || { FAIL=$((FAIL+1)); echo "  ✗ status=$STATUS"; }

code=$(req DELETE "/api/gerenciamento/objectives/${OBJ_ID}")
assert 'DELETE /objectives/:id' "$code" '^200$'


# ─────────────────────────────────────────────────────────────
section 'Betting sessions'

code=$(req POST /api/gerenciamento/betting-sessions '{"game_type":"roulette","risk_level":5}')
assert 'POST /betting-sessions (start)' "$code" '^201$'
SESSION_ID=$(extract 'd["session_id"]')

code=$(req POST "/api/gerenciamento/betting-sessions/${SESSION_ID}/end" '{}')
assert 'POST /betting-sessions/:id/end' "$code" '^200$'


# ─────────────────────────────────────────────────────────────
section 'Bank reset'

code=$(req GET /api/gerenciamento/user/bank-reset-status)
assert 'GET /user/bank-reset-status' "$code" '^200$'


# ─────────────────────────────────────────────────────────────
section 'Misc'

code=$(req GET /api/gerenciamento/categories)
assert 'GET /categories' "$code" '^200$'

code=$(req GET /api/gerenciamento/game-types)
assert 'GET /game-types' "$code" '^200$'

code=$(req GET /api/gerenciamento/health)
assert 'GET /health (sem auth, mas pelo proxy passa)' "$code" '^200$'


# ─────────────────────────────────────────────────────────────
section 'Cleanup'

code=$(req DELETE "/api/gerenciamento/transactions/${TX_DEPOSIT}")
assert 'DELETE /transactions/:id' "$code" '^200$'


# ─────────────────────────────────────────────────────────────
echo
TOTAL=$((PASS + FAIL))
if [[ $FAIL -eq 0 ]]; then
  printf '\033[32m✅ %d/%d testes passaram.\033[0m\n' "$PASS" "$TOTAL"
  exit 0
else
  printf '\033[31m❌ %d/%d falharam.\033[0m\n' "$FAIL" "$TOTAL"
  for t in "${FAILED_TESTS[@]}"; do echo "   - $t"; done
  exit 1
fi
