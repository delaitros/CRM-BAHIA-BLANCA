#!/usr/bin/env bash
# ============================================================
# Lo de Juan - Instalador (1 comando)
#   ./install.sh
# Levanta toda la plataforma: web + Chatwoot + Agente IA.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

echo "=== Lo de Juan - Instalador ==="

# 1. Chequear Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker no esta instalado. Instalalo: https://docs.docker.com/get-docker/"
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: Falta 'docker compose'. Actualiza Docker."
  exit 1
fi

# 2. Generar .env + claves
bash scripts/generate-secrets.sh

# 3. Validar API key de Anthropic
if grep -q "^ANTHROPIC_API_KEY=sk-ant-\.\.\.$" .env || ! grep -q "^ANTHROPIC_API_KEY=sk-ant-" .env; then
  echo
  echo ">> FALTA tu ANTHROPIC_API_KEY."
  echo "   1. Entra a https://console.anthropic.com/  > Settings > API Keys"
  echo "   2. Edita el archivo .env y pega la clave en ANTHROPIC_API_KEY="
  echo "   3. Volve a correr ./install.sh"
  exit 1
fi

# 4. Levantar todo
echo "Construyendo y levantando servicios (puede tardar unos minutos)..."
docker compose up -d --build

echo
echo "=== Listo ==="
echo "Web:       http://localhost"
echo "Chatwoot:  http://localhost:3000   (crea tu usuario admin)"
echo "Agente IA: corriendo (interno)"
echo
echo "Siguientes pasos manuales en QUICK-START.md (paso 3 y 4):"
echo "  - Crear usuario en Chatwoot y copiar el API token al .env"
echo "  - Conectar WhatsApp/Instagram/Facebook"
echo "  - Correr: bash scripts/configure-chatwoot-webhook.sh"
