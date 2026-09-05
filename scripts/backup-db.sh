#!/usr/bin/env bash
#
# Backup do banco do ComerciON.
#
# Gera um dump no formato "custom" do Postgres (comprimido, e o único formato
# que o pg_restore consegue restaurar seletivamente), VERIFICA que o arquivo
# gerado é legível e só então aplica a política de retenção.
#
# A verificação não é zelo excessivo: um dump truncado por disco cheio ou por
# conexão derrubada no meio é gravado do mesmo jeito e fica lá, parecendo um
# backup, até o dia em que alguém precisa dele. Aqui ele é reprovado na hora.
#
# Uso:
#   ./scripts/backup-db.sh                 # usa o .env da raiz
#   BACKUP_DIR=/mnt/backups ./scripts/backup-db.sh
#
# Agendamento (Linux, todo dia às 3h):
#   0 3 * * * cd /caminho/do/comercion && ./scripts/backup-db.sh >> /var/log/comercion-backup.log 2>&1
#
# Agendamento (Windows): Agendador de Tarefas → nova tarefa → programa
#   "C:\Program Files\Git\bin\bash.exe" com argumento "-lc ./scripts/backup-db.sh"
#   e "Iniciar em" apontando para a pasta do projeto.

set -euo pipefail

cd "$(dirname "$0")/.."

# ---------------------------------------------------------------- configuração

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
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
# Destino remoto no formato do rclone (ex.: "b2:comercion-backups"). Vazio
# desliga o envio. Sem isto o backup fica na MESMA máquina que o banco, e
# perder a máquina é perder os dois.
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
# Retenção no destino remoto. Vazio = nunca apaga lá fora. O padrão é não
# apagar de propósito: armazenamento remoto é barato, e o estrago de uma
# limpeza mal configurada no único backup fora do servidor não é.
BACKUP_REMOTE_RETENTION_DAYS="${BACKUP_REMOTE_RETENTION_DAYS:-}"
# Nunca apagar os últimos N backups, mesmo que já tenham passado da retenção.
# Protege contra o caso em que os backups pararam de rodar há um mês e a
# limpeza apagaria justamente os últimos que sobraram.
KEEP_MINIMUM="${BACKUP_KEEP_MINIMUM:-3}"

STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$BACKUP_DIR/comercion-$STAMP.dump"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
fail() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERRO: $*" >&2; exit 1; }

# ------------------------------------------------- como falar com o Postgres
#
# Preferimos as ferramentas do container: a versão do pg_dump precisa ser >= à
# do servidor, e usar as do próprio Postgres que está rodando elimina essa
# classe de erro ("server version mismatch") de uma vez.

if docker compose ps --status running --services 2>/dev/null | grep -qx postgres; then
  MODE="docker"
  pg() { docker compose exec -T -e PGPASSWORD="$DB_PASSWORD" postgres "$@"; }
elif command -v pg_dump >/dev/null 2>&1; then
  MODE="local"
  pg() { local bin="$1"; shift; PGPASSWORD="$DB_PASSWORD" "$bin" -h "$DB_HOST" -p "$DB_PORT" "$@"; }
else
  fail "nem o container 'postgres' está rodando, nem existe pg_dump instalado.
      Suba o banco com 'docker compose up -d postgres' ou instale o cliente do PostgreSQL."
fi

# ------------------------------------------------------------------- execução

mkdir -p "$BACKUP_DIR"

log "Backup de '$DB_NAME' via $MODE → $TARGET"

# -Fc  formato custom (comprimido, restaurável seletivamente)
# --no-owner / --no-privileges: o dump restaura em qualquer servidor, mesmo que
#   os papéis (roles) de lá tenham outros nomes. Sem isso, restaurar numa
#   máquina nova falha em cada GRANT.
if ! pg pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc --no-owner --no-privileges > "$TARGET"; then
  rm -f "$TARGET"
  fail "pg_dump falhou. Nenhum arquivo foi mantido."
fi

# ----------------------------------------------------------------- verificação

SIZE=$(wc -c < "$TARGET" | tr -d ' ')
if [ "$SIZE" -lt 1024 ]; then
  rm -f "$TARGET"
  fail "o dump saiu com apenas $SIZE bytes — não é um backup válido. Arquivo descartado."
fi

# Verificação de integridade: 'pg_restore -f /dev/null' descompacta e converte
# o arquivo INTEIRO em SQL, jogando o resultado fora. É o único jeito barato de
# provar que cada bloco de dados é legível, sem tocar em nenhum banco.
#
# Testado: um dump cortado ao meio sai com código 1 aqui. Cuidado ao "otimizar"
# isto para 'pg_restore --list', que é o reflexo óbvio e está ERRADO — a lista
# lê só o índice, que fica no começo do arquivo, e por isso aprova alegremente
# um dump truncado em 3% do tamanho.
if ! pg pg_restore -f /dev/null < "$TARGET" > /dev/null 2>&1; then
  rm -f "$TARGET"
  fail "o dump gerado não passou na verificação de integridade (arquivo ilegível ou incompleto). Arquivo descartado."
fi

TABLES=$(pg pg_restore --list < "$TARGET" 2>/dev/null | grep -c 'TABLE DATA' || true)
log "OK — $(echo "$SIZE" | awk '{printf "%.1f MB", $1/1048576}'), $TABLES tabelas com dados, íntegro."

# --------------------------------------------------------- cópia fora do servidor
#
# Um backup guardado ao lado do banco protege contra "apaguei a tabela errada",
# e contra mais nada. Não protege contra o disco morrer, contra o provedor
# sumir com a máquina, nem contra ransomware — que é justamente quando alguém
# vai precisar dele.
#
# O envio é opcional (BACKUP_REMOTE vazio desliga) porque exige uma conta em
# algum lugar, mas quando está ligado e FALHA o script termina com erro. Um
# aviso engolido aqui produziria a pior situação possível: achar que existe
# backup fora do servidor quando não existe.

if [ -n "$BACKUP_REMOTE" ]; then
  if ! command -v rclone > /dev/null 2>&1; then
    fail "BACKUP_REMOTE está configurado ($BACKUP_REMOTE) mas o rclone não está instalado.
      O backup local em $TARGET está íntegro e foi mantido — o que NÃO existe é a cópia
      fora do servidor. Instale com: curl https://rclone.org/install.sh | sudo bash"
  fi

  REMOTE_NAME="$(basename "$TARGET")"
  log "Enviando para $BACKUP_REMOTE …"

  if ! rclone copy "$TARGET" "$BACKUP_REMOTE" 2>&1; then
    fail "falha ao enviar para $BACKUP_REMOTE.
      O backup local em $TARGET está íntegro e foi mantido. NÃO existe cópia fora do servidor."
  fi

  # Conferir que o arquivo chegou, em vez de confiar no código de saída — mesma
  # razão de o dump ser verificado em vez de aceito por 'o pg_dump não reclamou'.
  if ! rclone lsf "$BACKUP_REMOTE" --include "$REMOTE_NAME" 2>/dev/null | grep -qx "$REMOTE_NAME"; then
    fail "o rclone terminou sem erro, mas $REMOTE_NAME não aparece em $BACKUP_REMOTE.
      O backup local foi mantido. NÃO confie na cópia remota."
  fi

  log "Cópia remota confirmada: $BACKUP_REMOTE/$REMOTE_NAME"

  if [ -n "$BACKUP_REMOTE_RETENTION_DAYS" ]; then
    # --include limita o estrago a arquivos nossos, caso BACKUP_REMOTE aponte
    # para uma pasta compartilhada com outra coisa.
    log "Limpando cópias remotas com mais de $BACKUP_REMOTE_RETENTION_DAYS dias"
    rclone delete "$BACKUP_REMOTE" \
      --include 'comercion-*.dump' \
      --min-age "${BACKUP_REMOTE_RETENTION_DAYS}d" \
      || log "AVISO: a limpeza remota falhou. O backup de hoje está lá; só sobrou lixo antigo."
  fi
else
  log "AVISO: BACKUP_REMOTE não configurado — este backup existe só nesta máquina."
fi

# ------------------------------------------------------------------- retenção

TOTAL=$(find "$BACKUP_DIR" -maxdepth 1 -name 'comercion-*.dump' | wc -l | tr -d ' ')
if [ "$TOTAL" -gt "$KEEP_MINIMUM" ]; then
  # Ordena do mais novo para o mais antigo, pula os KEEP_MINIMUM primeiros e,
  # entre os restantes, apaga só os que passaram da retenção.
  find "$BACKUP_DIR" -maxdepth 1 -name 'comercion-*.dump' -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | tail -n +$((KEEP_MINIMUM + 1)) | cut -d' ' -f2- \
    | while read -r old; do
        if [ -n "$(find "$old" -mtime "+$RETENTION_DAYS" 2>/dev/null)" ]; then
          log "Removendo backup antigo: $(basename "$old")"
          rm -f "$old"
        fi
      done
fi

log "Backups guardados em $BACKUP_DIR: $(find "$BACKUP_DIR" -maxdepth 1 -name 'comercion-*.dump' | wc -l | tr -d ' ')"
