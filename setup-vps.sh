#!/usr/bin/env bash
# =============================================================================
# Lo de Juan — CRM Bahía Blanca — Instalador automático de VPS
# Uso: bash setup-vps.sh [--check]
# Requiere: Ubuntu 22.04/24.04, root
# =============================================================================

set -euo pipefail

# ── Colores ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Constantes ────────────────────────────────────────────────────────────────
REPO_URL="https://github.com/delaitros/CRM-BAHIA-BLANCA.git"
INSTALL_DIR="/opt/crm-lodejuan"
LOG_FILE="/var/log/crm-setup.log"
TOTAL_STEPS=12
CURRENT_STEP=0
CHECK_ONLY=false

# ── Helpers de output ─────────────────────────────────────────────────────────
log()    { echo -e "$(date '+%H:%M:%S') $*" | tee -a "$LOG_FILE" > /dev/null; }
info()   { echo -e "${BLUE}[INFO]${NC}  $*"; log "[INFO] $*"; }
ok()     { echo -e "${GREEN}[OK]${NC}    $*"; log "[OK] $*"; }
warn()   { echo -e "${YELLOW}[WARN]${NC}  $*"; log "[WARN] $*"; }
error()  { echo -e "${RED}[ERROR]${NC} $*" >&2; log "[ERROR] $*"; }
die()    { error "$*"; echo -e "${RED}Instalación abortada.${NC}" >&2; exit 1; }

step() {
    CURRENT_STEP=$((CURRENT_STEP + 1))
    echo ""
    echo -e "${CYAN}${BOLD}[${CURRENT_STEP}/${TOTAL_STEPS}] $*${NC}"
    log "=== PASO ${CURRENT_STEP}/${TOTAL_STEPS}: $* ==="
}

ask() {
    # ask <varname> <prompt> [default]
    local varname="$1" prompt="$2" default="${3:-}"
    local answer
    if [[ -n "$default" ]]; then
        read -r -p "$(echo -e "${BOLD}${prompt}${NC} [${default}]: ")" answer
        answer="${answer:-$default}"
    else
        while [[ -z "${answer:-}" ]]; do
            read -r -p "$(echo -e "${BOLD}${prompt}${NC}: ")" answer
        done
    fi
    printf -v "$varname" '%s' "$answer"
}

ask_secret() {
    local varname="$1" prompt="$2"
    local answer
    while [[ -z "${answer:-}" ]]; do
        read -r -s -p "$(echo -e "${BOLD}${prompt}${NC}: ")" answer
        echo ""
    done
    printf -v "$varname" '%s' "$answer"
}

ask_optional() {
    local varname="$1" prompt="$2"
    local answer
    read -r -p "$(echo -e "${BOLD}${prompt}${NC} (dejar vacío para omitir): ")" answer
    printf -v "$varname" '%s' "${answer:-}"
}

banner() {
    echo ""
    echo -e "${CYAN}${BOLD}"
    echo "  ╔══════════════════════════════════════════════════════════╗"
    echo "  ║         Lo de Juan — CRM Bahía Blanca                   ║"
    echo "  ║         Instalador automático de VPS v1.0                ║"
    echo "  ╚══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# ── Modo --check ──────────────────────────────────────────────────────────────
check_mode() {
    echo ""
    echo -e "${CYAN}${BOLD}=== Verificación de instalación ===${NC}"
    echo ""
    local all_ok=true

    check_item() {
        local label="$1" ok="$2" detail="${3:-}"
        if [[ "$ok" == "true" ]]; then
            echo -e "  ${GREEN}✓${NC} ${label}${detail:+ — $detail}"
        else
            echo -e "  ${RED}✗${NC} ${label}${detail:+ — $detail}"
            all_ok=false
        fi
    }

    # Docker
    if command -v docker &>/dev/null; then
        check_item "Docker" true "$(docker --version 2>/dev/null | cut -d' ' -f3 | tr -d ',')"
    else
        check_item "Docker" false "no instalado"
    fi

    # Docker Compose
    if docker compose version &>/dev/null 2>&1; then
        check_item "Docker Compose" true "$(docker compose version --short 2>/dev/null)"
    else
        check_item "Docker Compose" false "no instalado"
    fi

    # Directorio de instalación
    if [[ -d "$INSTALL_DIR" ]]; then
        check_item "Directorio $INSTALL_DIR" true
    else
        check_item "Directorio $INSTALL_DIR" false "no existe"
    fi

    # .env
    if [[ -f "$INSTALL_DIR/.env" ]]; then
        check_item "Archivo .env" true
    else
        check_item "Archivo .env" false "no encontrado"
    fi

    # Servicios Docker
    if [[ -f "$INSTALL_DIR/docker-compose.yml" ]]; then
        for svc in postgres redis chatwoot-web chatwoot-worker ai-agent nginx; do
            local state
            state=$(docker compose -f "$INSTALL_DIR/docker-compose.yml" --env-file "$INSTALL_DIR/.env" ps "$svc" --format "{{.State}}" 2>/dev/null || echo "error")
            if [[ "$state" == "running" ]]; then
                check_item "Servicio $svc" true "running"
            else
                check_item "Servicio $svc" false "${state:-detenido}"
            fi
        done
    fi

    # Certbot / SSL
    if command -v certbot &>/dev/null; then
        check_item "Certbot" true "$(certbot --version 2>/dev/null)"
    else
        check_item "Certbot" false "no instalado"
    fi

    # Crons
    local backup_cron renewal_cron
    backup_cron=$(crontab -l 2>/dev/null | grep -c "crm-backup" || true)
    renewal_cron=$(crontab -l 2>/dev/null | grep -c "certbot renew" || true)
    check_item "Cron de backup" "$([[ $backup_cron -gt 0 ]] && echo true || echo false)"
    check_item "Cron de renovación SSL" "$([[ $renewal_cron -gt 0 ]] && echo true || echo false)"

    echo ""
    if [[ "$all_ok" == "true" ]]; then
        echo -e "${GREEN}${BOLD}Todo OK — la instalación está completa.${NC}"
    else
        echo -e "${YELLOW}${BOLD}Hay ítems pendientes. Ejecutá el instalador sin --check para corregirlos.${NC}"
    fi
    echo ""
    exit 0
}

# ── Pre-flight checks ─────────────────────────────────────────────────────────
preflight() {
    if [[ "${EUID}" -ne 0 ]]; then
        die "Este script debe ejecutarse como root. Usá: sudo bash $0"
    fi

    local os_id os_version
    os_id=$(. /etc/os-release && echo "$ID")
    os_version=$(. /etc/os-release && echo "$VERSION_ID")
    if [[ "$os_id" != "ubuntu" ]]; then
        warn "Sistema operativo no es Ubuntu ($os_id). Se continúa pero puede haber errores."
    fi
    if [[ "$os_version" != "22.04" && "$os_version" != "24.04" ]]; then
        warn "Versión de Ubuntu $os_version no testeada. Recomendado: 22.04 o 24.04."
    fi

    # Preparar log
    touch "$LOG_FILE" 2>/dev/null || LOG_FILE="/tmp/crm-setup.log"
    info "Log en: $LOG_FILE"
}

# ── PASO 1: Recolectar configuración ─────────────────────────────────────────
gather_config() {
    step "Recopilando configuración"

    echo ""
    echo -e "${YELLOW}Ingresá los datos para configurar el CRM. Los secretos se generan automáticamente.${NC}"
    echo ""

    ask DOMAIN       "Dominio del sitio (ej: lodejuan.com)"
    ask ADMIN_EMAIL  "Tu email (para Let's Encrypt y admin de Chatwoot)"
    ask WA_NUMBER    "Número de WhatsApp SIN + (ej: 5492914001234)"
    ask_secret ANTHROPIC_KEY "API Key de Anthropic (sk-ant-...)"
    ask_optional MP_TOKEN    "Token de MercadoPago (Access Token de producción)"
    ask_optional GCAL_URL    "URL iCal de Google Calendar"
    echo ""
    echo -e "${YELLOW}--- Credenciales del administrador de Chatwoot ---${NC}"
    ask      CW_ADMIN_NAME     "Nombre del admin de Chatwoot" "Juan"
    ask      CW_ADMIN_EMAIL    "Email del admin de Chatwoot" "$ADMIN_EMAIL"
    ask_secret CW_ADMIN_PASS   "Contraseña del admin de Chatwoot (mín. 6 caracteres)"

    # Auto-generados
    POSTGRES_PASS=$(openssl rand -base64 32 | tr -d '/+=\n' | head -c 40)
    SECRET_KEY_BASE=$(openssl rand -hex 64)
    FB_VERIFY_TOKEN=$(openssl rand -hex 16)

    echo ""
    ok "Configuración recopilada."
    echo -e "  Dominio:    ${BOLD}${DOMAIN}${NC}"
    echo -e "  Email:      ${BOLD}${ADMIN_EMAIL}${NC}"
    echo -e "  WhatsApp:   ${BOLD}${WA_NUMBER}${NC}"
    echo -e "  MercadoPago:${BOLD} ${MP_TOKEN:-(omitido)}${NC}"
    echo ""
    read -r -p "¿Confirmar y continuar? [S/n]: " yn
    yn="${yn:-S}"
    [[ "${yn,,}" == "n" ]] && die "Instalación cancelada por el usuario."
}

# ── PASO 2: Instalar dependencias del sistema ─────────────────────────────────
install_system_deps() {
    step "Instalando Docker, git y herramientas"

    export DEBIAN_FRONTEND=noninteractive

    info "Actualizando paquetes..."
    apt-get update -qq >> "$LOG_FILE" 2>&1 || die "No se pudo actualizar apt."
    apt-get install -y -qq \
        git curl wget gnupg ca-certificates lsb-release \
        certbot python3-certbot-nginx \
        >> "$LOG_FILE" 2>&1 || die "No se pudieron instalar dependencias base."

    # Docker (idempotente)
    if command -v docker &>/dev/null; then
        ok "Docker ya instalado: $(docker --version | cut -d' ' -f3 | tr -d ',')"
    else
        info "Instalando Docker..."
        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
            | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>>"$LOG_FILE"
        chmod a+r /etc/apt/keyrings/docker.gpg
        echo \
            "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
            https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
            > /etc/apt/sources.list.d/docker.list
        apt-get update -qq >> "$LOG_FILE" 2>&1
        apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
            docker-buildx-plugin docker-compose-plugin >> "$LOG_FILE" 2>&1 \
            || die "No se pudo instalar Docker."
        systemctl enable --now docker >> "$LOG_FILE" 2>&1
        ok "Docker instalado: $(docker --version | cut -d' ' -f3 | tr -d ',')"
    fi

    # Verificar Docker Compose v2
    if ! docker compose version &>/dev/null 2>&1; then
        die "Docker Compose plugin no encontrado. Revisá la instalación de Docker."
    fi
    ok "Docker Compose: $(docker compose version --short)"
}

# ── PASO 3: Clonar / actualizar repositorio ───────────────────────────────────
clone_repo() {
    step "Clonando repositorio en $INSTALL_DIR"

    if [[ -d "$INSTALL_DIR/.git" ]]; then
        info "Repositorio ya existe. Actualizando..."
        git -C "$INSTALL_DIR" pull --ff-only >> "$LOG_FILE" 2>&1 \
            || warn "No se pudo hacer pull. Se usa la versión existente."
        ok "Repositorio actualizado."
    else
        info "Clonando $REPO_URL..."
        git clone --depth=1 "$REPO_URL" "$INSTALL_DIR" >> "$LOG_FILE" 2>&1 \
            || die "No se pudo clonar el repositorio. Verificá la URL y el acceso a internet."
        ok "Repositorio clonado."
    fi
}

# ── PASO 4: Crear .env ────────────────────────────────────────────────────────
create_env() {
    step "Creando archivo .env"

    if [[ -f "$INSTALL_DIR/.env" ]]; then
        warn ".env ya existe. Se crea un backup en .env.bak"
        cp "$INSTALL_DIR/.env" "$INSTALL_DIR/.env.bak"
    fi

    cat > "$INSTALL_DIR/.env" <<EOF
# ============================================================
# Lo de Juan — CRM Bahía Blanca
# Generado automáticamente por setup-vps.sh — $(date '+%Y-%m-%d %H:%M')
# ============================================================

# ── PostgreSQL ──────────────────────────────────────────────
POSTGRES_USER=chatwoot
POSTGRES_PASSWORD=${POSTGRES_PASS}

# ── Chatwoot ────────────────────────────────────────────────
SECRET_KEY_BASE=${SECRET_KEY_BASE}
CHATWOOT_URL=http://${DOMAIN}:3000
CHATWOOT_PORT=3000

CHATWOOT_API_TOKEN=
CHATWOOT_ACCOUNT_ID=1

# ── Facebook / Instagram / WhatsApp ─────────────────────────
FB_APP_ID=
FB_APP_SECRET=
FB_VERIFY_TOKEN=${FB_VERIFY_TOKEN}
IG_VERIFY_TOKEN=${FB_VERIFY_TOKEN}

# ── Agente IA (Claude / Anthropic) ──────────────────────────
ANTHROPIC_API_KEY=${ANTHROPIC_KEY}
ANTHROPIC_MODEL=claude-opus-4-7

# ── MercadoPago ─────────────────────────────────────────────
MERCADOPAGO_ACCESS_TOKEN=${MP_TOKEN:-}

# ── URL pública ─────────────────────────────────────────────
PUBLIC_URL=http://${DOMAIN}

# ── Google Calendar ─────────────────────────────────────────
GOOGLE_CALENDAR_ICS_URL=${GCAL_URL:-}

# ── Timing del agente ───────────────────────────────────────
DEBOUNCE_MS=7000

# ── Email (SMTP - opcional) ─────────────────────────────────
MAILER_SENDER_EMAIL=noreply@${DOMAIN}
SMTP_ADDRESS=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_AUTHENTICATION=plain
SMTP_ENABLE_STARTTLS_AUTO=true

# ── Web ─────────────────────────────────────────────────────
WEB_PORT=80
EOF

    chmod 600 "$INSTALL_DIR/.env"
    ok ".env creado correctamente."
}

# ── PASO 5: Reemplazar número de WhatsApp en index.html ──────────────────────
patch_whatsapp() {
    step "Configurando número de WhatsApp en index.html"

    local html="$INSTALL_DIR/index.html"
    if [[ ! -f "$html" ]]; then
        warn "index.html no encontrado. Se omite este paso."
        return
    fi

    if grep -q "5491155551234" "$html"; then
        sed -i "s/5491155551234/${WA_NUMBER}/g" "$html"
        ok "WhatsApp actualizado a ${WA_NUMBER} en index.html."
    else
        info "El número de WhatsApp ya fue reemplazado anteriormente."
    fi
}

# ── PASO 6: Iniciar servicios con Docker Compose ─────────────────────────────
start_services() {
    step "Iniciando servicios con Docker Compose"

    cd "$INSTALL_DIR"

    info "Construyendo imagen del agente IA..."
    docker compose --env-file .env build ai-agent >> "$LOG_FILE" 2>&1 \
        || die "Falló el build del agente IA. Revisá $LOG_FILE"

    info "Levantando servicios (postgres, redis, chatwoot, nginx, ai-agent)..."
    docker compose --env-file .env up -d --remove-orphans >> "$LOG_FILE" 2>&1 \
        || die "Falló docker compose up. Revisá $LOG_FILE"

    info "Esperando que postgres y redis estén listos (hasta 90 seg)..."
    local waited=0
    until docker compose --env-file .env ps postgres | grep -q "healthy" && \
          docker compose --env-file .env ps redis | grep -q "healthy"; do
        sleep 5
        waited=$((waited + 5))
        if [[ $waited -ge 90 ]]; then
            # Intentar auto-fix: reiniciar postgres y redis
            warn "Tiempo de espera agotado. Reiniciando postgres y redis..."
            docker compose --env-file .env restart postgres redis >> "$LOG_FILE" 2>&1
            sleep 15
            docker compose --env-file .env ps postgres | grep -q "healthy" \
                || die "PostgreSQL no respondió. Revisá: docker compose logs postgres"
        fi
        echo -n "."
    done
    echo ""
    ok "PostgreSQL y Redis saludables."
}

# ── PASO 7: Ejecutar migraciones y crear usuario admin ───────────────────────
run_migrations() {
    step "Ejecutando migraciones de Chatwoot y creando admin"

    cd "$INSTALL_DIR"

    info "Ejecutando db:chatwoot_prepare (puede tardar 2-3 minutos)..."
    # Reiniciar el servicio migrate por si ya corrió y salió
    docker compose --env-file .env run --rm chatwoot-migrate >> "$LOG_FILE" 2>&1 \
        || warn "chatwoot-migrate retornó error (puede ser normal si ya estaba migrado)."

    info "Esperando que chatwoot-web esté listo (hasta 120 seg)..."
    local waited=0
    until curl -sf "http://localhost:3000" > /dev/null 2>&1; do
        sleep 5
        waited=$((waited + 5))
        if [[ $waited -ge 120 ]]; then
            warn "chatwoot-web tardó demasiado. Intentando reiniciar..."
            docker compose --env-file .env restart chatwoot-web >> "$LOG_FILE" 2>&1
            sleep 20
            curl -sf "http://localhost:3000" > /dev/null 2>&1 \
                || die "chatwoot-web no responde. Revisá: docker compose logs chatwoot-web"
        fi
        echo -n "."
    done
    echo ""
    ok "chatwoot-web está respondiendo."

    info "Creando usuario administrador de Chatwoot..."
    local rails_cmd
    rails_cmd=$(cat <<RUBY
user = User.find_or_initialize_by(email: '${CW_ADMIN_EMAIL}')
if user.new_record?
  user.name = '${CW_ADMIN_NAME}'
  user.password = '${CW_ADMIN_PASS}'
  user.password_confirmation = '${CW_ADMIN_PASS}'
  user.type = 'SuperAdmin'
  user.save!
  puts "USUARIO_CREADO"
else
  puts "USUARIO_EXISTE"
end
RUBY
)
    local result
    result=$(docker compose --env-file .env exec -T chatwoot-web \
        bundle exec rails runner "$rails_cmd" 2>>"$LOG_FILE" || echo "RAILS_ERROR")

    if echo "$result" | grep -q "USUARIO_CREADO"; then
        ok "Usuario admin creado: ${CW_ADMIN_EMAIL}"
    elif echo "$result" | grep -q "USUARIO_EXISTE"; then
        ok "Usuario admin ya existía: ${CW_ADMIN_EMAIL}"
    else
        warn "No se pudo crear el usuario admin automáticamente."
        warn "Crealo manualmente desde: https://${DOMAIN}/chatwoot/auth/sign_up"
        log "Rails runner output: $result"
    fi
}

# ── PASO 8: Obtener certificado SSL con Let's Encrypt ────────────────────────
setup_ssl() {
    step "Configurando HTTPS con Let's Encrypt"

    # Verificar que el dominio apunta a esta IP
    local public_ip
    public_ip=$(curl -sf https://api.ipify.org 2>/dev/null || echo "desconocida")
    info "IP pública de este servidor: $public_ip"
    info "Verificá que $DOMAIN apunte a $public_ip en tu DNS antes de continuar."
    echo ""
    read -r -p "¿El DNS ya está configurado y propagado? [S/n]: " dns_ok
    dns_ok="${dns_ok:-S}"
    if [[ "${dns_ok,,}" == "n" ]]; then
        warn "Omitiendo SSL. Podés ejecutar este script nuevamente cuando el DNS esté listo."
        SSL_ENABLED=false
        return
    fi

    # Detener nginx temporalmente para liberar puerto 80 para certbot standalone
    info "Deteniendo nginx para obtener certificado..."
    cd "$INSTALL_DIR"
    docker compose --env-file .env stop nginx >> "$LOG_FILE" 2>&1

    info "Solicitando certificado para $DOMAIN..."
    if certbot certonly --standalone \
        --non-interactive \
        --agree-tos \
        --email "$ADMIN_EMAIL" \
        -d "$DOMAIN" \
        -d "www.${DOMAIN}" \
        >> "$LOG_FILE" 2>&1; then
        ok "Certificado SSL obtenido correctamente."
        SSL_ENABLED=true
    else
        warn "certbot falló. Intentando solo con dominio raíz (sin www)..."
        if certbot certonly --standalone \
            --non-interactive \
            --agree-tos \
            --email "$ADMIN_EMAIL" \
            -d "$DOMAIN" \
            >> "$LOG_FILE" 2>&1; then
            ok "Certificado SSL obtenido para $DOMAIN (sin www)."
            SSL_ENABLED=true
        else
            error "No se pudo obtener el certificado SSL."
            warn "Verificá que el dominio $DOMAIN apunte a $public_ip y que el puerto 80 esté abierto."
            SSL_ENABLED=false
            # Volver a levantar nginx en HTTP
            docker compose --env-file .env start nginx >> "$LOG_FILE" 2>&1
            return
        fi
    fi
}

# ── PASO 9: Generar nginx.conf SSL y actualizar docker-compose ────────────────
configure_ssl() {
    step "Actualizando nginx y docker-compose para SSL"

    if [[ "${SSL_ENABLED:-false}" != "true" ]]; then
        info "SSL no configurado. Se omite este paso."
        docker compose --env-file .env start nginx >> "$LOG_FILE" 2>&1 || true
        return
    fi

    cd "$INSTALL_DIR"

    # Determinar nombre del certificado (certbot usa el primer dominio)
    local cert_name="$DOMAIN"
    local cert_dir="/etc/letsencrypt/live/${cert_name}"

    info "Generando nginx-ssl.conf con HTTPS..."
    cat > "$INSTALL_DIR/docker/nginx-ssl.conf" <<NGINX_EOF
# Generado por setup-vps.sh — $(date '+%Y-%m-%d %H:%M')

# Redirigir HTTP → HTTPS
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN} www.${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${cert_name}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${cert_name}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    # Frontend estático (Lo de Juan website)
    root /usr/share/nginx/html;
    index index.html;

    # Páginas públicas
    location / {
        try_files \$uri \$uri.html \$uri/ =404;
    }

    # Admin panel
    location /admin/ {
        try_files \$uri \$uri.html \$uri/ =404;
    }

    # Assets
    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Proxy a Chatwoot
    location /chatwoot/ {
        proxy_pass http://chatwoot-web:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Webhook del Agente IA
    location /webhook/ {
        proxy_pass http://ai-agent:4000/webhook/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # API del Agente IA
    location /api/ {
        proxy_pass http://ai-agent:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # ACME challenge para renovación sin detener nginx
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
}
NGINX_EOF

    ok "nginx-ssl.conf generado."

    # Actualizar docker-compose.yml para SSL:
    #  - Montar /etc/letsencrypt y nginx-ssl.conf
    #  - Exponer puerto 443
    info "Actualizando docker-compose.yml para SSL..."

    # Backup
    cp "$INSTALL_DIR/docker-compose.yml" "$INSTALL_DIR/docker-compose.yml.http-bak"

    # Usar Python para editar el YAML de forma segura
    python3 - <<'PYEOF'
import re, sys

with open('/opt/crm-lodejuan/docker-compose.yml', 'r') as f:
    content = f.read()

# Añadir puerto 443 si no existe
if '"${WEB_PORT:-80}:80"' in content and '443:443' not in content:
    content = content.replace(
        '      - "${WEB_PORT:-80}:80"',
        '      - "${WEB_PORT:-80}:80"\n      - "443:443"'
    )

# Añadir montaje de letsencrypt si no existe
if '/etc/letsencrypt' not in content:
    content = content.replace(
        '      - ./docker/nginx.conf:/etc/nginx/conf.d/default.conf:ro',
        '      - ./docker/nginx-ssl.conf:/etc/nginx/conf.d/default.conf:ro\n      - /etc/letsencrypt:/etc/letsencrypt:ro\n      - /var/www/certbot:/var/www/certbot:ro'
    )
elif './docker/nginx.conf' in content:
    content = content.replace(
        '      - ./docker/nginx.conf:/etc/nginx/conf.d/default.conf:ro',
        '      - ./docker/nginx-ssl.conf:/etc/nginx/conf.d/default.conf:ro\n      - /etc/letsencrypt:/etc/letsencrypt:ro\n      - /var/www/certbot:/var/www/certbot:ro'
    )

with open('/opt/crm-lodejuan/docker-compose.yml', 'w') as f:
    f.write(content)
print('OK')
PYEOF

    mkdir -p /var/www/certbot

    # Actualizar PUBLIC_URL y CHATWOOT_URL en .env
    sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=https://${DOMAIN}|" "$INSTALL_DIR/.env"
    sed -i "s|^CHATWOOT_URL=.*|CHATWOOT_URL=https://${DOMAIN}/chatwoot|" "$INSTALL_DIR/.env"

    info "Reiniciando nginx con configuración SSL..."
    docker compose --env-file .env up -d --force-recreate nginx >> "$LOG_FILE" 2>&1 \
        || die "No se pudo reiniciar nginx con SSL."

    ok "HTTPS configurado en https://${DOMAIN}"
}

# ── PASO 10: Auto-renovación de certificado SSL ───────────────────────────────
setup_ssl_renewal() {
    step "Configurando renovación automática de SSL"

    if [[ "${SSL_ENABLED:-false}" != "true" ]]; then
        info "SSL no activo. Se omite este paso."
        return
    fi

    # Script de renovación con webroot (no detiene nginx)
    cat > /usr/local/bin/crm-ssl-renew.sh <<'EOF'
#!/bin/bash
certbot renew --webroot -w /var/www/certbot --quiet
docker compose -f /opt/crm-lodejuan/docker-compose.yml \
    --env-file /opt/crm-lodejuan/.env \
    exec -T nginx nginx -s reload 2>/dev/null || true
EOF
    chmod +x /usr/local/bin/crm-ssl-renew.sh

    # Cron: renovar dos veces por semana
    local cron_line="0 3 * * 1,4 /usr/local/bin/crm-ssl-renew.sh >> /var/log/crm-ssl-renew.log 2>&1"
    (crontab -l 2>/dev/null | grep -v "crm-ssl-renew"; echo "$cron_line") | crontab -
    ok "Cron de renovación SSL configurado (lun y jue a las 3am)."
}

# ── PASO 11: Backup automático de PostgreSQL ──────────────────────────────────
setup_backup() {
    step "Configurando backup automático de PostgreSQL"

    mkdir -p /opt/crm-backups

    cat > /usr/local/bin/crm-backup.sh <<BACKUP_EOF
#!/bin/bash
# Backup diario de PostgreSQL para CRM Lo de Juan
set -euo pipefail

BACKUP_DIR="/opt/crm-backups"
DATE=\$(date '+%Y%m%d_%H%M%S')
FILE="\${BACKUP_DIR}/chatwoot_\${DATE}.sql.gz"
KEEP_DAYS=30

mkdir -p "\$BACKUP_DIR"

docker compose -f /opt/crm-lodejuan/docker-compose.yml \\
    --env-file /opt/crm-lodejuan/.env \\
    exec -T postgres \\
    pg_dump -U chatwoot chatwoot_production \\
    | gzip > "\$FILE"

echo "\$(date) — Backup creado: \$FILE (\$(du -sh "\$FILE" | cut -f1))"

# Eliminar backups más viejos de \$KEEP_DAYS días
find "\$BACKUP_DIR" -name "chatwoot_*.sql.gz" -mtime +\$KEEP_DAYS -delete
echo "\$(date) — Backups viejos eliminados (>\ ${KEEP_DAYS}d)."
BACKUP_EOF
    chmod +x /usr/local/bin/crm-backup.sh

    # Cron: backup diario a las 2am
    local cron_line="0 2 * * * /usr/local/bin/crm-backup.sh >> /var/log/crm-backup.log 2>&1"
    (crontab -l 2>/dev/null | grep -v "crm-backup"; echo "$cron_line") | crontab -
    ok "Backup diario configurado (2am → /opt/crm-backups/). Retención: 30 días."
}

# ── PASO 12: Verificar servicios y mostrar resumen ────────────────────────────
verify_and_summary() {
    step "Verificando servicios y mostrando resumen"

    cd "$INSTALL_DIR"
    local all_ok=true

    echo ""
    info "Verificando estado de cada servicio..."

    for svc in postgres redis chatwoot-web chatwoot-worker ai-agent nginx; do
        local state
        state=$(docker compose --env-file .env ps "$svc" --format "{{.State}}" 2>/dev/null || echo "error")
        if [[ "$state" == "running" ]]; then
            echo -e "  ${GREEN}✓${NC} $svc — running"
        else
            echo -e "  ${RED}✗${NC} $svc — ${state:-desconocido}"
            warn "Intentando reiniciar $svc..."
            docker compose --env-file .env restart "$svc" >> "$LOG_FILE" 2>&1
            sleep 8
            state=$(docker compose --env-file .env ps "$svc" --format "{{.State}}" 2>/dev/null || echo "error")
            if [[ "$state" == "running" ]]; then
                echo -e "  ${GREEN}✓${NC} $svc — running (reiniciado)"
            else
                echo -e "  ${RED}✗${NC} $svc — sigue sin levantar"
                all_ok=false
            fi
        fi
    done

    # Test HTTP
    echo ""
    info "Verificando endpoints HTTP..."
    local base_url
    if [[ "${SSL_ENABLED:-false}" == "true" ]]; then
        base_url="https://${DOMAIN}"
    else
        base_url="http://${DOMAIN}"
    fi

    for endpoint in "/" "/chatwoot/" "/webhook/health" "/api/health"; do
        local http_code
        http_code=$(curl -sko /dev/null -w "%{http_code}" "${base_url}${endpoint}" 2>/dev/null || echo "000")
        if [[ "$http_code" =~ ^(200|301|302|404)$ ]]; then
            echo -e "  ${GREEN}✓${NC} ${base_url}${endpoint} — HTTP $http_code"
        else
            echo -e "  ${YELLOW}?${NC} ${base_url}${endpoint} — HTTP $http_code"
        fi
    done

    # Resumen final
    echo ""
    echo -e "${CYAN}${BOLD}══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}${BOLD}   INSTALACIÓN COMPLETADA — Lo de Juan CRM Bahía Blanca${NC}"
    echo -e "${CYAN}${BOLD}══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${BOLD}URLs:${NC}"
    echo -e "  Sitio web:     ${GREEN}${base_url}/${NC}"
    echo -e "  Chatwoot:      ${GREEN}${base_url}/chatwoot/${NC}"
    echo -e "  Agente IA:     ${GREEN}${base_url}/api/${NC}"
    echo -e "  Webhook:       ${GREEN}${base_url}/webhook/chatwoot${NC}"
    echo ""
    echo -e "${BOLD}Credenciales Chatwoot:${NC}"
    echo -e "  Email:         ${YELLOW}${CW_ADMIN_EMAIL}${NC}"
    echo -e "  Contraseña:    ${YELLOW}(la que ingresaste)${NC}"
    echo ""
    echo -e "${BOLD}Credenciales DB (guardadas en .env):${NC}"
    echo -e "  Usuario:       ${YELLOW}chatwoot${NC}"
    echo -e "  Contraseña:    ${YELLOW}${POSTGRES_PASS}${NC}"
    echo ""
    echo -e "${BOLD}Archivos importantes:${NC}"
    echo -e "  Config:        ${YELLOW}${INSTALL_DIR}/.env${NC}"
    echo -e "  Logs setup:    ${YELLOW}${LOG_FILE}${NC}"
    echo -e "  Backups DB:    ${YELLOW}/opt/crm-backups/${NC}"
    echo -e "  Log backup:    ${YELLOW}/var/log/crm-backup.log${NC}"
    echo ""
    echo -e "${BOLD}Comandos útiles:${NC}"
    echo -e "  Ver logs:      ${CYAN}docker compose -f ${INSTALL_DIR}/docker-compose.yml logs -f${NC}"
    echo -e "  Reiniciar:     ${CYAN}docker compose -f ${INSTALL_DIR}/docker-compose.yml restart${NC}"
    echo -e "  Backup manual: ${CYAN}/usr/local/bin/crm-backup.sh${NC}"
    echo -e "  Verificar:     ${CYAN}bash $0 --check${NC}"
    echo ""

    if [[ "${SSL_ENABLED:-false}" != "true" ]]; then
        echo -e "${YELLOW}${BOLD}NOTA: SSL no configurado.${NC}"
        echo -e "${YELLOW}  Para activar HTTPS, asegurate de que el DNS de '$DOMAIN' apunte${NC}"
        echo -e "${YELLOW}  a este servidor y volvé a ejecutar: bash $0${NC}"
        echo ""
    fi

    echo -e "${BOLD}Próximos pasos manuales:${NC}"
    echo -e "  1. Ingresá a ${base_url}/chatwoot/ y completá la configuración inicial."
    echo -e "  2. Andá a Settings > Integrations > Agent Bots y creá el bot."
    echo -e "  3. Copiá el API Token y actualizalo en ${INSTALL_DIR}/.env (CHATWOOT_API_TOKEN)."
    echo -e "  4. Reiniciá el agente IA: docker compose -f ${INSTALL_DIR}/docker-compose.yml restart ai-agent"
    echo ""

    if [[ "$all_ok" == "true" ]]; then
        echo -e "${GREEN}${BOLD}Todo OK. El sistema está funcionando.${NC}"
    else
        echo -e "${YELLOW}${BOLD}Algunos servicios tuvieron problemas. Revisá los logs arriba.${NC}"
    fi
    echo ""
}

# ── Manejo de señales ─────────────────────────────────────────────────────────
cleanup() {
    echo ""
    warn "Script interrumpido. El sistema puede estar en un estado parcial."
    warn "Podés continuar ejecutando: bash $0"
    exit 130
}
trap cleanup INT TERM

# ── MAIN ──────────────────────────────────────────────────────────────────────
main() {
    # Parsear flags
    for arg in "$@"; do
        case "$arg" in
            --check) CHECK_ONLY=true ;;
            --help|-h)
                echo "Uso: bash $0 [--check]"
                echo "  --check   Verifica la instalación sin hacer cambios"
                exit 0
                ;;
            *)
                warn "Argumento desconocido: $arg"
                ;;
        esac
    done

    banner

    if [[ "$CHECK_ONLY" == "true" ]]; then
        check_mode
    fi

    preflight

    gather_config
    install_system_deps
    clone_repo
    create_env
    patch_whatsapp
    start_services
    run_migrations
    setup_ssl
    configure_ssl
    setup_ssl_renewal
    setup_backup
    verify_and_summary
}

main "$@"
