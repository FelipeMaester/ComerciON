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
#   ./scripts/restore-db.sh --do-remoto --into erp_teste  # baixa do B2 (ou do destino configurado)
#
# Sem arquivo informado, usa o backup mais recente da pasta de backups.
#
# --do-remoto existe porque o cenário que justifica o backup fora do servidor é
# justamente aquele em que a pasta local não existe mais: o disco morreu, a
# máquina sumiu, o servidor é outro. Sem isto, o dump estaria a salvo no B2 e a
# ferramenta de restauração olharia para um diretório vazio.

set -euo pipefail

cd "$(dirname "$0")/.."

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
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"

TARGET_DB="$DB_NAME"
DUMP_FILE=""
DROP_FIRST=false
DO_REMOTO=false

while [ $# -gt 0 ]; do
  case "$1" in
    --into) TARGET_DB="$2"; shift 2 ;;
    --drop) DROP_FIRST=true; shift ;;
    --do-remoto) DO_REMOTO=true; shift ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) DUMP_FILE="$1"; shift ;;
  esac
done

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
fail() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERRO: $*" >&2; exit 1; }

if [ "$DO_REMOTO" = true ]; then
  [ -n "$BACKUP_REMOTE" ] || fail "--do-remoto pede BACKUP_REMOTE configurado no .env (ex.: b2:comercion-backups)."
  command -v rclone > /dev/null 2>&1 || fail "--do-remoto pede o rclone instalado: curl https://rclone.org/install.sh | sudo bash"

  # Se o nome veio na linha de comando, baixa aquele; senão, o mais recente.
  # A ordenação é pelo NOME, que começa com a data em formato ordenável
  # (comercion-AAAAMMDD-HHMMSS) — não dá para confiar na data de modificação
  # do objeto remoto, que muda a cada cópia.
  if [ -n "$DUMP_FILE" ]; then
    REMOTO="$(basename "$DUMP_FILE")"
  else
    log "Procurando o backup mais recente em $BACKUP_REMOTE …"
    REMOTO="$(rclone lsf "$BACKUP_REMOTE" --include 'comercion-*.dump' | sort | tail -1)"
    [ -n "$REMOTO" ] || fail "nenhum backup encontrado em $BACKUP_REMOTE"
  fi

  BAIXADOS="$(mktemp -d)"
  # trap na saída para não deixar um dump do banco inteiro esquecido em /tmp.
  trap 'rm -rf "$BAIXADOS"' EXIT

  log "Baixando $REMOTO de $BACKUP_REMOTE …"
  rclone copy "$BACKUP_REMOTE/$REMOTO" "$BAIXADOS" || fail "falha ao baixar $REMOTO de $BACKUP_REMOTE"

  DUMP_FILE="$BAIXADOS/$REMOTO"
  [ -f "$DUMP_FILE" ] || fail "o rclone terminou sem erro, mas $REMOTO não chegou. Não confie nessa cópia."
  log "Baixado: $(wc -c < "$DUMP_FILE" | tr -d ' ') bytes"
fi

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
