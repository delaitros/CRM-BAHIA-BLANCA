#!/bin/bash
# ============================================================
# Lo de Juan - Configuración SSL con Let's Encrypt
# Ejecutar DESPUÉS de setup-vps.sh cuando el dominio ya esté
# apuntando al VPS y el sitio HTTP funcione.
# Uso: sudo bash setup-ssl.sh
# ============================================================
set -euo pipefail

DOMAIN="complejolodejuan.com"
EMAIL="delaitrosjhon@gmail.com"
CRM_DIR="/opt/crm-lodejuan"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[AVISO]${NC} $1"; }
die()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo ""
echo "======================================================"
echo "  SSL / HTTPS para $DOMAIN"
echo "======================================================"
echo ""

# Verificar root
[[ $EUID -ne 0 ]] && die "Ejecutar como root: sudo bash setup-ssl.sh"

# Verificar que el dominio resuelva a este servidor
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
DOMAIN_IP=$(dig +short "$DOMAIN" 2>/dev/null | tail -1 || true)
if [[ -z "$DOMAIN_IP" ]]; then
    warn "No se pudo resolver $DOMAIN via DNS. Continuando de todas formas..."
elif [[ "$DOMAIN_IP" != "$SERVER_IP" ]]; then
    warn "El dominio $DOMAIN apunta a $DOMAIN_IP pero el servidor es $SERVER_IP"
    warn "Si el DNS aún está propagando, puede funcionar igual. Continuando..."
fi

cd "$CRM_DIR"

# ── Paso 1: Instalar certbot ──────────────────────────────
echo ""
echo "[1/5] Instalando certbot..."
apt-get update -qq
apt-get install -y certbot > /dev/null
ok "certbot instalado"

# ── Paso 2: Obtener certificado ───────────────────────────
echo ""
echo "[2/5] Obteniendo certificado SSL (deteniendo nginx)..."
docker compose stop nginx 2>/dev/null || true

# Intentar con dominio www también, si falla usar solo apex
CERT_OBTAINED=false
if certbot certonly \
    --standalone \
    --preferred-challenges http \
    -d "$DOMAIN" \
    -d "www.$DOMAIN" \
    --non-interactive \
    --agree-tos \
    -m "$EMAIL" 2>/dev/null; then
    ok "Certificado obtenido para $DOMAIN y www.$DOMAIN"
    CERT_OBTAINED=true
elif certbot certonly \
    --standalone \
    --preferred-challenges http \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    -m "$EMAIL"; then
    ok "Certificado obtenido para $DOMAIN"
    CERT_OBTAINED=true
fi

if [[ "$CERT_OBTAINED" != "true" ]]; then
    docker compose start nginx 2>/dev/null || true
    die "No se pudo obtener el certificado. Verificar que $DOMAIN apunta a este servidor y que el puerto 80 es accesible."
fi

# ── Paso 3: Activar configuración HTTPS ──────────────────
echo ""
echo "[3/5] Activando configuración HTTPS en nginx..."
cp docker/nginx.conf docker/nginx.conf.http-backup
cp docker/nginx-ssl.conf docker/nginx.conf
ok "nginx.conf actualizado con HTTPS"

# ── Paso 4: Actualizar variables de entorno ──────────────
echo ""
echo "[4/5] Actualizando .env..."
# PUBLIC_URL para MercadoPago y links externos
if grep -q "^PUBLIC_URL=" .env; then
    sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=https://$DOMAIN|" .env
else
    echo "PUBLIC_URL=https://$DOMAIN" >> .env
fi

# Actualizar CHATWOOT_URL para links en emails de Chatwoot
if grep -q "^CHATWOOT_URL=" .env; then
    sed -i "s|^CHATWOOT_URL=.*|CHATWOOT_URL=https://$DOMAIN/chatwoot|" .env
else
    echo "CHATWOOT_URL=https://$DOMAIN/chatwoot" >> .env
fi
ok ".env actualizado"

# ── Paso 5: Reiniciar servicios ───────────────────────────
echo ""
echo "[5/5] Reiniciando servicios..."
docker compose up -d nginx
sleep 5
# Recargar ai-agent para que tome nuevo PUBLIC_URL
docker compose up -d --force-recreate ai-agent
ok "Servicios reiniciados"

# ── Renovación automática ─────────────────────────────────
CRON_CMD="0 3 * * 1 certbot renew --pre-hook 'docker compose -f $CRM_DIR/docker-compose.yml stop nginx' --post-hook 'docker compose -f $CRM_DIR/docker-compose.yml start nginx' >> /var/log/certbot-renew.log 2>&1"
(crontab -l 2>/dev/null | grep -v certbot; echo "$CRON_CMD") | crontab -
ok "Renovación automática configurada (cada lunes a las 3am)"

# ── Verificación ──────────────────────────────────────────
echo ""
echo "Verificando HTTPS..."
sleep 3
if curl -sk "https://$DOMAIN" | grep -qi "juan\|complejo\|catering" 2>/dev/null; then
    echo ""
    echo "======================================================"
    echo -e "  ${GREEN}SSL configurado exitosamente!${NC}"
    echo "======================================================"
    echo ""
    echo "  Sitio web:    https://$DOMAIN"
    echo "  Admin panel:  https://$DOMAIN/admin/dashboard.html"
    echo "  Chatwoot:     https://$DOMAIN/chatwoot/"
    echo "  Webhook IA:   https://$DOMAIN/webhook/chatwoot"
    echo ""
    echo "  IMPORTANTE: Actualizar el webhook en Chatwoot:"
    echo "  Settings > Integrations > Webhooks"
    echo "  URL: https://$DOMAIN/webhook/chatwoot"
    echo ""
else
    warn "No se pudo verificar HTTPS automáticamente."
    echo "  Probar manualmente: https://$DOMAIN"
    echo "  Si el sitio funciona en HTTPS, el SSL está configurado."
fi
