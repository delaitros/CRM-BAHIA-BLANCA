#!/usr/bin/env bash
# Genera el .env y completa las claves seguras automaticamente.
# No pisa valores que ya hayas cargado a mano.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Cree .env a partir de .env.example"
fi

# Reemplaza un valor solo si sigue con el placeholder CAMBIAR_...
fill() {
  local key="$1" value="$2"
  if grep -q "^${key}=CAMBIAR" .env; then
    # delimitador | para no romper con / del base64/hex
    sed -i "s|^${key}=.*|${key}=${value}|" .env
    echo "  - ${key} generado"
  fi
}

echo "Generando claves seguras..."
fill POSTGRES_PASSWORD "$(openssl rand -hex 24)"
fill SECRET_KEY_BASE   "$(openssl rand -hex 64)"

echo "Listo. Revisá .env y completá ANTHROPIC_API_KEY antes de continuar."
