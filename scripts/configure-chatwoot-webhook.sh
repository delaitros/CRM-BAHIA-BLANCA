#!/usr/bin/env bash
# Crea (o reusa) el webhook en Chatwoot que apunta al Agente IA.
# Requiere que ya tengas CHATWOOT_API_TOKEN en el .env (ver DEPLOY.md paso 3).
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a

: "${CHATWOOT_API_TOKEN:?Falta CHATWOOT_API_TOKEN en .env (ver DEPLOY.md paso 3)}"
ACCOUNT_ID="${CHATWOOT_ACCOUNT_ID:-1}"
BASE="${CHATWOOT_PUBLIC_URL:-http://localhost:3000}"
WEBHOOK_URL="http://ai-agent:4000/webhook/chatwoot"

echo "Creando webhook en Chatwoot ($BASE) -> $WEBHOOK_URL"

curl -sf -X POST "${BASE}/api/v1/accounts/${ACCOUNT_ID}/webhooks" \
  -H "Content-Type: application/json" \
  -H "api_access_token: ${CHATWOOT_API_TOKEN}" \
  -d "{\"webhook\":{\"url\":\"${WEBHOOK_URL}\",\"subscriptions\":[\"message_created\"]}}" \
  && echo -e "\nWebhook creado." \
  || echo -e "\nNo se pudo crear automaticamente. Crealo a mano (DEPLOY.md paso 3.4)."
