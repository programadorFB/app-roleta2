#!/bin/bash
# ════════════════════════════════════════════════════════════
# run-tests.sh — Roda testes na VPS
# Uso:
#   ./run-tests.sh            → apenas unit tests (sem DB/Redis)
#   ./run-tests.sh --all      → unit + integration (requer DB + Redis)
#   ./run-tests.sh --int      → apenas integration
# ════════════════════════════════════════════════════════════

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  🧪  Test Runner — Roleta3 Backend"
echo "════════════════════════════════════════════════════════════"
echo ""

# ── 1. Verifica dependências de teste ────────────────────────
if ! npx vitest --version &>/dev/null; then
  echo -e "${YELLOW}⚡ Instalando dependências de teste...${NC}"
  npm install -D vitest supertest
fi

# ── 2. Verifica .env.test ────────────────────────────────────
if [ ! -f .env.test ]; then
  echo -e "${RED}❌ Arquivo .env.test não encontrado!${NC}"
  echo "   Copie de: tests/.env.test para a raiz do projeto"
  exit 1
fi

# ── 3. Decide modo ───────────────────────────────────────────
MODE=${1:-"--unit"}

case "$MODE" in
  --unit)
    echo -e "${GREEN}▶ Rodando UNIT TESTS (sem dependências externas)${NC}"
    echo ""
    npx vitest run --config vitest.config.backend.js tests/unit/
    ;;

  --int|--integration)
    echo -e "${GREEN}▶ Rodando INTEGRATION TESTS (requer Redis + PG)${NC}"
    echo ""
    
    # Verifica Redis
    echo -n "  🔴 Redis... "
    if docker exec roleta3_redis redis-cli ping &>/dev/null; then
      echo -e "${GREEN}OK${NC}"
    else
      echo -e "${RED}FALHOU${NC}"
      echo "     → Verifique: docker exec roleta3_redis redis-cli ping"
      exit 1
    fi

    # Verifica PG
    echo -n "  🐘 PostgreSQL... "
    if docker exec $(docker ps -q --filter name=postgres) psql -U postgres -c "SELECT 1" &>/dev/null 2>&1; then
      echo -e "${GREEN}OK${NC}"
    else
      echo -e "${YELLOW}⚠️  Não conseguiu verificar via docker exec (ok se PG roda fora do Docker)${NC}"
    fi

    echo ""
    INTEGRATION=true npx vitest run --config vitest.config.backend.js tests/integration/
    ;;

  --all)
    echo -e "${GREEN}▶ Rodando TODOS OS TESTES${NC}"
    echo ""

    echo "── Unit Tests ──────────────────────────────────────────"
    npx vitest run --config vitest.config.backend.js tests/unit/
    
    echo ""
    echo "── Integration Tests ──────────────────────────────────"
    INTEGRATION=true npx vitest run --config vitest.config.backend.js tests/integration/
    ;;

  *)
    echo "Uso: $0 [--unit|--int|--all]"
    echo ""
    echo "  --unit   Apenas unit tests (padrão, sem deps externas)"
    echo "  --int    Apenas integration tests (requer Redis + PG)"
    echo "  --all    Tudo junto"
    exit 1
    ;;
esac

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅  Testes finalizados!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
