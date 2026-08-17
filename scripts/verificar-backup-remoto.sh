#!/usr/bin/env bash
#
# Prova que o backup fora do servidor funciona de verdade — dos dois lados.
#
# Rode UMA VEZ depois de configurar o Backblaze B2 (ou qualquer destino do
# rclone), e de novo sempre que trocar a chave ou o bucket. Leva menos de um
# minuto e não encosta no banco de produção.
#
# Por que existe: "o backup está indo para a nuvem" é a frase mais fácil de
# acreditar e a mais cara de descobrir que era mentira. Um envio que falha em
# silêncio, uma chave só de leitura, um bucket errado — nada disso aparece até
# o dia em que alguém precisa restaurar. Este script força o ciclo inteiro:
# grava, confere que chegou, lê de volta, compara byte a byte e limpa.
#
# Uso:
#   ./scripts/verificar-backup-remoto.sh
#
# Lê BACKUP_REMOTE do .env.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  . ./.env
  set +a
fi

BACKUP_REMOTE="${BACKUP_REMOTE:-}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
ok() { echo "  OK   $*"; }
fail() { echo "  ERRO $*" >&2; exit 1; }

echo
echo "Verificação do backup fora do servidor"
echo "======================================"
echo

# ------------------------------------------------------------ pré-requisitos

[ -n "$BACKUP_REMOTE" ] || fail "BACKUP_REMOTE não está no .env.
       Configure o destino primeiro — ver DEPLOY.md, seção Backup."
ok "BACKUP_REMOTE = $BACKUP_REMOTE"

command -v rclone > /dev/null 2>&1 \
  || fail "rclone não instalado: curl https://rclone.org/install.sh | sudo bash"
ok "rclone $(rclone version | head -1 | awk '{print $2}')"

# O nome antes do ':' precisa existir na configuração do rclone. Sem esta
# checagem, o erro que aparece adiante é "didn't find section in config file",
# que não diz a ninguém o que fazer.
REMOTO_NOME="${BACKUP_REMOTE%%:*}"
if ! rclone listremotes | grep -qx "${REMOTO_NOME}:"; then
  fail "o destino '$REMOTO_NOME' não existe na configuração do rclone.
       Rode 'rclone config' e crie um destino com esse nome.
       Configurados hoje: $(rclone listremotes | tr '\n' ' ')"
fi
ok "destino '$REMOTO_NOME' configurado"

# ------------------------------------------------------------------- escrita

CANARIO="comercion-verificacao-$(date +%Y%m%d-%H%M%S).txt"
LOCAL="$(mktemp -d)"
trap 'rm -rf "$LOCAL"; rclone delete "$BACKUP_REMOTE/$CANARIO" 2>/dev/null || true' EXIT

# Conteúdo com tamanho suficiente para o teste não passar por acaso com um
# arquivo vazio, e aleatório para a comparação significar alguma coisa.
head -c 65536 /dev/urandom | base64 > "$LOCAL/$CANARIO"
ASSINATURA_LOCAL="$(sha256sum "$LOCAL/$CANARIO" | cut -d' ' -f1)"

log "Enviando arquivo de teste ($(wc -c < "$LOCAL/$CANARIO" | tr -d ' ') bytes)…"
rclone copy "$LOCAL/$CANARIO" "$BACKUP_REMOTE" \
  || fail "não consegui ESCREVER em $BACKUP_REMOTE.
       Se a chave for só de leitura, ou o bucket estiver errado, é aqui que aparece."
ok "escrita aceita"

# ------------------------------------------------------------------- listagem

rclone lsf "$BACKUP_REMOTE" --include "$CANARIO" | grep -qx "$CANARIO" \
  || fail "o rclone não reclamou do envio, mas o arquivo não aparece na listagem.
       NÃO confie neste destino."
ok "arquivo aparece na listagem do destino"

# --------------------------------------------------------------------- leitura

VOLTA="$LOCAL/volta"
mkdir -p "$VOLTA"
rclone copy "$BACKUP_REMOTE/$CANARIO" "$VOLTA" \
  || fail "não consegui LER de volta. Backup que não se lê não é backup."
[ -f "$VOLTA/$CANARIO" ] || fail "o download terminou sem erro e o arquivo não chegou."
ok "leitura de volta"

# ---------------------------------------------------------------- integridade

ASSINATURA_VOLTA="$(sha256sum "$VOLTA/$CANARIO" | cut -d' ' -f1)"
[ "$ASSINATURA_LOCAL" = "$ASSINATURA_VOLTA" ] \
  || fail "o arquivo voltou DIFERENTE do que subiu.
       enviado:  $ASSINATURA_LOCAL
       recebido: $ASSINATURA_VOLTA"
ok "conteúdo idêntico (sha256 confere)"

# ---------------------------------------------------------------------- limpeza

rclone delete "$BACKUP_REMOTE/$CANARIO" 2>/dev/null \
  && ok "remoção aceita (a limpeza de backups antigos vai funcionar)" \
  || echo "  AVISO a chave não consegue APAGAR. O backup funciona, mas
       BACKUP_REMOTE_RETENTION_DAYS não vai limpar nada — o bucket cresce
       para sempre. Dê permissão de delete ou configure a expiração pelo
       painel do provedor."

# --------------------------------------------------------------- o que já existe

QUANTOS="$(rclone lsf "$BACKUP_REMOTE" --include 'comercion-*.dump' 2>/dev/null | wc -l | tr -d ' ')"
echo
if [ "$QUANTOS" -gt 0 ]; then
  log "Backups do banco já guardados nesse destino: $QUANTOS"
  rclone lsf "$BACKUP_REMOTE" --include 'comercion-*.dump' | sort | tail -3 | sed 's/^/       /'
else
  log "Ainda não há nenhum dump do banco nesse destino."
  echo "       O primeiro vai subir no próximo backup. Para forçar agora:"
  echo "         ./scripts/backup-db.sh"
fi

echo
echo "Destino verificado de ponta a ponta: escreve, lista, lê de volta e o"
echo "conteúdo confere."
echo
echo "Falta o ensaio que realmente importa — restaurar num banco descartável:"
echo "  ./scripts/restore-db.sh --do-remoto --into erp_ensaio --drop"
echo
