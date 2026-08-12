#!/usr/bin/env bash
#
# Restauração do banco do ComerciON a partir de um dump gerado pelo
# ./scripts/backup-db.sh.
#
# Um backup que nunca foi restaurado não é um backup — é um arquivo. Use o
# modo --into pelo menos uma vez por mês para restaurar numa cópia descartável
# e conferir que os dados estão lá. Isso não encosta no banco de produção.
#
# Uso:
#   ./scripts/restore-db.sh --into erp_teste            # ENSAIO: banco novo, sem risco
#   ./scripts/restore-db.sh --into erp_teste --drop     # idem, recriando o banco de teste
#   ./scripts/restore-db.sh                             # PRA VALER: sobrescreve o banco real
#   ./scripts/restore-db.sh backups/comercion-20260812-192132.dump
#
# Sem arquivo informado, usa o backup mais recente da pasta de backups.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

DB_USER="${POSTGRES_USER:-erp}"
DB_PASSWORD="${POSTGRES_PASSWORD:-erp}"
DB_NAME="${POSTGRES_DB:-erp}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

TARGET_DB="$DB_NAME"
DUMP_FILE=""
DROP_FIRST=false

while [ $# -gt 0 ]; do
  case "$1" in
    --into) TARGET_DB="$2"; shift 2 ;;
    --drop) DROP_FIRST=true; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) DUMP_FILE="$1"; shift ;;
  esac
done

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
fail() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERRO: $*" >&2; exit 1; }

if [ -z "$DUMP_FILE" ]; then
  DUMP_FILE=$(find "$BACKUP_DIR" -maxdepth 1 -name 'comercion-*.dump' -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | head -1 | cut -d' ' -f2-)
  [ -n "$DUMP_FILE" ] || fail "nenhum backup encontrado em $BACKUP_DIR"
  log "Usando o backup mais recente: $DUMP_FILE"
fi

[ -f "$DUMP_FILE" ] || fail "arquivo não encontrado: $DUMP_FILE"

if docker compose ps --status running --services 2>/dev/null | grep -qx postgres; then
  pg() { docker compose exec -T -e PGPASSWORD="$DB_PASSWORD" postgres "$@"; }
elif command -v pg_restore >/dev/null 2>&1; then
  pg() { local bin="$1"; shift; PGPASSWORD="$DB_PASSWORD" "$bin" -h "$DB_HOST" -p "$DB_PORT" "$@"; }
else
  fail "nem o container 'postgres' está rodando, nem existe pg_restore instalado."
fi

# ------------------------------------------------------- confirmação explícita
#
# Só quando o alvo é o banco real. Restaurar num banco de ensaio é justamente
# a operação que queremos que seja fácil de rodar.

if [ "$TARGET_DB" = "$DB_NAME" ]; then
  echo
  echo "  ATENÇÃO: isto vai SOBRESCREVER o banco '$DB_NAME' com o conteúdo de"
  echo "  $DUMP_FILE"
  echo "  Tudo que foi gravado depois desse backup será perdido."
  echo
  echo "  Pare a API antes de continuar (docker compose stop api), senão a"
  echo "  restauração falha nas tabelas que ainda estiverem em uso."
  echo
  printf "  Digite o nome do banco (%s) para confirmar: " "$DB_NAME"
  read -r CONFIRMATION
  [ "$CONFIRMATION" = "$DB_NAME" ] || fail "confirmação não confere. Nada foi alterado."
fi

# ------------------------------------------------------------------- execução

if [ "$TARGET_DB" != "$DB_NAME" ]; then
  if [ "$DROP_FIRST" = true ]; then
    log "Removendo o banco de ensaio '$TARGET_DB' (se existir)"
    pg psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$TARGET_DB\";" > /dev/null
  fi
  log "Criando o banco de ensaio '$TARGET_DB'"
  pg psql -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$TARGET_DB\";" > /dev/null 2>&1 || true
fi

log "Restaurando $DUMP_FILE em '$TARGET_DB'..."

# --clean --if-exists: remove os objetos antigos antes de recriar, sem
#   reclamar dos que ainda não existem (banco novo).
# --no-owner: os objetos passam a pertencer a quem está restaurando.
# O pg_restore devolve código != 0 por avisos benignos (ex.: extensão que já
# existia), então não tratamos a saída como falha automática — a verificação
# real vem logo abaixo, contando o que efetivamente entrou.
set +e
pg pg_restore -U "$DB_USER" -d "$TARGET_DB" --clean --if-exists --no-owner --no-privileges < "$DUMP_FILE" 2>/tmp/restore-warnings.txt
RESTORE_CODE=$?
set -e

TABLE_COUNT=$(pg psql -U "$DB_USER" -d "$TARGET_DB" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" | tr -d '\r ')

if [ "${TABLE_COUNT:-0}" -lt 1 ]; then
  echo "--- avisos do pg_restore ---" >&2
  cat /tmp/restore-warnings.txt >&2
  fail "a restauração não criou nenhuma tabela em '$TARGET_DB'."
fi

if [ "$RESTORE_CODE" -ne 0 ]; then
  log "pg_restore terminou com avisos (código $RESTORE_CODE) — normal ao recriar um banco do zero:"
  sed 's/^/    /' /tmp/restore-warnings.txt | head -5
fi

log "OK — '$TARGET_DB' restaurado com $TABLE_COUNT tabelas."

if [ "$TARGET_DB" != "$DB_NAME" ]; then
  echo
  echo "  Ensaio concluído. Para conferir os dados:"
  echo "    docker compose exec postgres psql -U $DB_USER -d $TARGET_DB -c 'SELECT count(*) FROM sales;'"
  echo "  Para descartar o banco de ensaio:"
  echo "    docker compose exec postgres psql -U $DB_USER -d postgres -c 'DROP DATABASE \"$TARGET_DB\";'"
fi
