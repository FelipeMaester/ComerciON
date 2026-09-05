#!/usr/bin/env bash
#
# Ensaio de restauração: prova que o backup volta.
#
# POR QUE ISTO EXISTE
# O backup-db.sh já verifica que o dump é LEGÍVEL (pg_restore -f /dev/null lê
# o arquivo inteiro). Isso é bom e não é suficiente: um arquivo legível ainda
# pode restaurar num banco com metade das tabelas, ou com as tabelas vazias, e
# ninguém descobre até o dia em que precisa.
#
# O cabeçalho do restore-db.sh já dizia "use o modo --into pelo menos uma vez
# por mês". A instrução existia e o ensaio nunca acontecia — que é o destino
# normal de toda instrução que depende de alguém lembrar.
#
# O que este script faz é o ciclo inteiro, sem tocar em produção:
#   backup → restaura numa cópia descartável → CONFERE linha por linha → apaga
#
# Uso:
#   ./scripts/ensaiar-restauracao.sh
#   ./scripts/ensaiar-restauracao.sh --manter   # não apaga a cópia no fim
#
# Agendamento sugerido (todo domingo às 4h, depois do backup diário):
#   0 4 * * 0 cd /caminho/do/comercion && ./scripts/ensaiar-restauracao.sh >> /var/log/comercion-ensaio.log 2>&1

set -euo pipefail

cd "$(dirname "$0")/.."

MANTER=false
[ "${1:-}" = "--manter" ] && MANTER=true

if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  . ./.env
  set +a
fi

DB_USER="${POSTGRES_USER:-erp}"
DB_PASSWORD="${POSTGRES_PASSWORD:-erp}"
DB_NAME="${POSTGRES_DB:-erp}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
COPIA="${ENSAIO_DB:-erp_ensaio}"

log() { echo "[$(date '+%H:%M:%S')] $*"; }
fail() { echo "[$(date '+%H:%M:%S')] REPROVADO: $*" >&2; exit 1; }

if docker compose ps --status running --services 2>/dev/null | grep -qx postgres; then
  pg() { docker compose exec -T -e PGPASSWORD="$DB_PASSWORD" postgres "$@"; }
elif command -v psql >/dev/null 2>&1; then
  pg() { local bin="$1"; shift; PGPASSWORD="$DB_PASSWORD" "$bin" -h "$DB_HOST" -p "$DB_PORT" "$@"; }
else
  fail "nem o container 'postgres' está rodando, nem existe psql instalado."
fi

# As tabelas que importam para uma loja. Não é a lista inteira de propósito:
# um ensaio que compara 60 tabelas quebra a cada migration nova e vira ruído.
# Estas cinco cobrem cadastro, catálogo, movimento e dinheiro — se alguma
# voltar vazia, o backup não presta.
TABELAS="tenants users products customers sales financial_entries"

contar() {
  local banco="$1" saida=""
  for t in $TABELAS; do
    local n
    n=$(pg psql -U "$DB_USER" -d "$banco" -t -A -c "SELECT count(*) FROM \"$t\";" 2>/dev/null | tr -d '\r' || echo "ERRO")
    saida="$saida$t=$n "
  done
  echo "$saida"
}

log "1/4  Contando o banco de origem ($DB_NAME)"
ANTES="$(contar "$DB_NAME")"
log "     $ANTES"

# Um banco vazio passaria em qualquer comparação. Este é o controle do ensaio:
# sem dado nenhum, não há o que provar.
# Soma em awk, e não em bc: uma dependência a menos para faltar no servidor de
# alguém — um ensaio que não roda por falta de calculadora seria piada de mau
# gosto.
TOTAL_ANTES=$(echo "$ANTES" | tr ' ' '\n' | sed 's/.*=//' | awk '/^[0-9]+$/ { s += $1 } END { print s + 0 }')
[ "${TOTAL_ANTES:-0}" -gt 0 ] || fail "o banco de origem está vazio — não há o que ensaiar."

log "2/4  Gerando o backup"
./scripts/backup-db.sh > /dev/null || fail "o backup falhou."

log "3/4  Restaurando numa cópia descartável ($COPIA)"
./scripts/restore-db.sh --into "$COPIA" --drop > /dev/null || fail "a restauração falhou."

log "4/4  Conferindo o que voltou"
DEPOIS="$(contar "$COPIA")"
log "     $DEPOIS"

if [ "$MANTER" = false ]; then
  pg psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$COPIA\";" > /dev/null
fi

[ "$ANTES" = "$DEPOIS" ] || fail "o que voltou não bate com o que saiu.
      origem:      $ANTES
      restaurado:  $DEPOIS"

echo
echo "APROVADO: o backup restaura, e as $(echo "$TABELAS" | wc -w) tabelas conferidas voltaram com a mesma contagem."
