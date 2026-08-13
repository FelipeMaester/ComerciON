#!/usr/bin/env bash
#
# Gera o .env de produção com segredos aleatórios.
#
# Existe porque o caminho fácil — copiar o .env.example e trocar só o que
# parece importante — deixa para trás os "troque-este-segredo-de-acesso". Com
# o JWT_ACCESS_SECRET conhecido, qualquer pessoa forja um token de admin de
# qualquer loja. É a falha mais barata de cometer e a mais cara de descobrir.
#
# Uso:
#   ./scripts/gerar-env-producao.sh painel.minhaloja.com.br api.minhaloja.com.br voce@email.com

set -euo pipefail

cd "$(dirname "$0")/.."

if [ $# -lt 3 ]; then
  cat >&2 <<'USO'
Uso: ./scripts/gerar-env-producao.sh <dominio-painel> <dominio-api> <email>

  dominio-painel   onde a equipe acessa      ex: painel.minhaloja.com.br
  dominio-api      onde os apps chamam       ex: api.minhaloja.com.br
  email            para avisos da Let's Encrypt sobre o certificado

Os domínios precisam apontar para o IP deste servidor ANTES de subir.
USO
  exit 1
fi

APP_DOMAIN="$1"
API_DOMAIN="$2"
ACME_EMAIL="$3"

if [ -f .env ]; then
  echo "ERRO: já existe um .env aqui." >&2
  echo "      Trocar os segredos DESLOGA todo mundo e invalida os links de" >&2
  echo "      redefinição de senha em aberto. Se é isso mesmo que você quer," >&2
  echo "      mova o arquivo atual antes: mv .env .env.antigo" >&2
  exit 1
fi

# openssl está em qualquer servidor Linux; o fallback usa /dev/urandom para
# não depender dele.
segredo() {
  if command -v openssl > /dev/null 2>&1; then
    openssl rand -hex 48
  else
    head -c 48 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

senha_banco() {
  # Sem símbolos: esta senha entra numa URL de conexão, e um '@' ou '/' no
  # meio dela quebra o parsing do DATABASE_URL de um jeito difícil de achar.
  if command -v openssl > /dev/null 2>&1; then
    openssl rand -hex 24
  else
    head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

cat > .env <<EOF
# ============================================================================
# ComerciON — produção
# Gerado por scripts/gerar-env-producao.sh em $(date '+%Y-%m-%d %H:%M:%S')
#
# NÃO versione este arquivo. NÃO reaproveite em outro ambiente.
# Guarde uma cópia em lugar seguro: perder os segredos de JWT desloga todo
# mundo; perder a senha do banco sem ter o volume é perder o banco.
# ============================================================================

# ---- Domínios ----
APP_DOMAIN=$APP_DOMAIN
API_DOMAIN=$API_DOMAIN
ACME_EMAIL=$ACME_EMAIL

# Painel de monitoramento (Uptime Kuma). Precisa apontar para este servidor
# igual aos outros três. Se preferir não expor, comente e acesse por túnel SSH.
MONITOR_DOMAIN=monitor.$APP_DOMAIN


# ---- Postgres ----
POSTGRES_USER=comercion
POSTGRES_PASSWORD=$(senha_banco)
POSTGRES_DB=comercion

# ---- API ----
NODE_ENV=production
API_PORT=3001

JWT_ACCESS_SECRET=$(segredo)
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=$(segredo)
JWT_REFRESH_EXPIRES_IN=7d


BCRYPT_SALT_ROUNDS=12
TOTP_ISSUER=ComerciON
TENANT_HEADER=x-tenant-slug

# ---- Backup ----
BACKUP_RETENTION_DAYS=14
BACKUP_KEEP_MINIMUM=3
BACKUP_INTERVAL_HOURS=24

# ---- Integrações (todas opcionais, todas desligadas) ----
# Sem configurar, cada uma cai no modo simulado e o sistema funciona.
# Ver .env.example para o que cada bloco significa.
MAIL_PROVIDER=stub
# MAIL_PROVIDER=smtp
# SMTP_HOST=
# SMTP_PORT=587
# SMTP_USER=
# SMTP_PASSWORD=
# MAIL_FROM=$APP_DOMAIN <nao-responda@$APP_DOMAIN>

FISCAL_PROVIDER=stub
# FISCAL_PROVIDER=focusnfe
# FOCUS_NFE_TOKEN=
# FOCUS_NFE_ENV=homologacao

WHATSAPP_PROVIDER=stub
# WHATSAPP_PROVIDER=twilio
# TWILIO_ACCOUNT_SID=
# TWILIO_AUTH_TOKEN=
# TWILIO_WHATSAPP_FROM=

AI_PROVIDER=stub
SUGGESTION_ENGINE=rules
EOF

chmod 600 .env

echo "Pronto: .env criado com permissão 600 (só o dono lê)."
echo
echo "  Painel:  https://$APP_DOMAIN"
echo "  API:     https://$API_DOMAIN"
echo "  Monitor: https://monitor.$APP_DOMAIN"
echo
echo "Antes de subir, confirme que os domínios já apontam para este"
echo "servidor — a emissão do certificado é validada pela porta 80 e falha"
echo "silenciosamente se o DNS ainda não propagou."
echo
echo "Depois:  docker compose -f docker-compose.prod.yml up -d --build"
