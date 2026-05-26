# 🚀 Guía de Deploy — Lo de Juan CRM Bahía Blanca

Guía paso a paso para levantar el stack completo en un VPS desde cero.

---

## ✅ Requisitos previos

| Requisito | Mínimo |
|-----------|--------|
| RAM | 4 GB (8 GB recomendado) |
| CPU | 2 vCPU |
| Disco | 20 GB SSD |
| OS | Ubuntu 22.04 o 24.04 LTS |
| Dominio | Apuntado al IP del VPS (registro A) |

> Antes de arrancar, asegurate de que el dominio ya resuelva al IP del VPS.
> Podés verificarlo con: `dig +short tudominio.com`

---

## 🔌 Paso 1: Conectarse al VPS

```bash
ssh root@IP_DEL_VPS
```

Si usás usuario distinto de root:

```bash
ssh usuario@IP_DEL_VPS
```

Una vez adentro, actualizá el sistema:

```bash
apt update && apt upgrade -y
```

---

## 🐳 Paso 2: Instalar Docker y Docker Compose

```bash
# Instalar dependencias
apt install -y ca-certificates curl gnupg lsb-release

# Agregar la clave GPG oficial de Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

# Agregar el repositorio de Docker
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalar Docker Engine + Compose plugin
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Verificar
docker --version
docker compose version
```

> Si no sos root, agregá tu usuario al grupo docker para no tener que usar `sudo`:
> ```bash
> usermod -aG docker $USER
> newgrp docker
> ```

---

## 📦 Paso 3: Clonar el repositorio

```bash
git clone https://github.com/delaitros/CRM-BAHIA-BLANCA.git /opt/crm-lodejuan
cd /opt/crm-lodejuan
```

---

## ⚙️ Paso 4: Configurar el archivo .env

Copiá el ejemplo y editalo:

```bash
cp .env.example .env
nano .env
```

### Variables importantes — qué poner en cada una

**`POSTGRES_PASSWORD`**
Contraseña de la base de datos. Usá algo seguro, no lo pierdas:
```bash
openssl rand -hex 24
# Copiá el resultado y pegalo como valor
```

**`SECRET_KEY_BASE`**
Clave secreta de Rails. Generala así:
```bash
openssl rand -hex 64
```
Pegá el resultado completo (128 caracteres) en esta variable.

**`CHATWOOT_URL`**
La URL pública con la que los usuarios van a acceder a Chatwoot.
Usá el mismo dominio que apuntaste al VPS:
```
CHATWOOT_URL=https://tudominio.com/chatwoot
```
> Durante el primer arranque (antes de configurar HTTPS) podés dejarlo en `http://IP_DEL_VPS:3000`.

**`ANTHROPIC_API_KEY`**
Tu API key de Anthropic. La obtenés en https://console.anthropic.com → Settings → API Keys.
Tiene el formato `sk-ant-api03-...`

**`ANTHROPIC_MODEL`**
Modelo de Claude a usar. Opciones:
- `claude-sonnet-4-6` → equilibrio calidad/costo (recomendado para producción con volumen)
- `claude-opus-4-7` → máxima calidad (más caro)
- `claude-haiku-4-5` → más rápido y barato (para tareas simples)

**`PUBLIC_URL`**
URL pública del sistema, necesaria para que MercadoPago pueda notificar los pagos:
```
PUBLIC_URL=https://tudominio.com
```

**`GOOGLE_CALENDAR_ICS_URL`**
URL secreta del calendario de Google en formato iCal. Para obtenerla:
1. Abrí Google Calendar
2. Hacé clic en los tres puntos al lado del calendario → "Configuración y uso compartido"
3. Bajá hasta "Dirección secreta en formato iCal"
4. Copiá esa URL y pegala acá

**`OPENAI_API_KEY`**
API key de OpenAI para transcripción de audios con Whisper. Opcional — si no la configurás, el bot pide que escriban por texto. La obtenés en https://platform.openai.com/api-keys. Cuesta ~USD 0.006/minuto de audio.

**`MERCADOPAGO_ACCESS_TOKEN`**
Token de producción de MercadoPago. Ver la sección "Obtener credenciales de MercadoPago" más abajo para el paso a paso.

**`CHATWOOT_API_TOKEN`**
Lo completás **después** de crear el usuario admin en Chatwoot (Paso 8). Por ahora dejalo vacío.

**`FB_APP_ID` / `FB_APP_SECRET` / `FB_VERIFY_TOKEN`**
Credenciales de Meta Business para WhatsApp. Lo configurás en el Paso 9.
`FB_VERIFY_TOKEN` lo elegís vos (cualquier string aleatorio, ej: `openssl rand -hex 16`).

### Ejemplo de .env completo (con valores ficticios)

```env
POSTGRES_USER=chatwoot
POSTGRES_PASSWORD=a1b2c3d4e5f6g7h8i9j0k1l2

SECRET_KEY_BASE=abc123...def456  # 128 caracteres generados con openssl

CHATWOOT_URL=https://tudominio.com/chatwoot
CHATWOOT_PORT=3000
CHATWOOT_API_TOKEN=                  # completar en paso 8
CHATWOOT_ACCOUNT_ID=1

FB_APP_ID=                           # completar en paso 9
FB_APP_SECRET=                       # completar en paso 9
FB_VERIFY_TOKEN=mi_token_secreto     # completar en paso 9
IG_VERIFY_TOKEN=

ANTHROPIC_API_KEY=sk-ant-api03-...
ANTHROPIC_MODEL=claude-sonnet-4-6

OPENAI_API_KEY=sk-...                # opcional, para transcripción de audios
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
PUBLIC_URL=https://tudominio.com
GOOGLE_CALENDAR_ICS_URL=https://calendar.google.com/calendar/ical/...

DEBOUNCE_MS=60000

MAILER_SENDER_EMAIL=noreply@lodejuan.com
SMTP_ADDRESS=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_AUTHENTICATION=plain
SMTP_ENABLE_STARTTLS_AUTO=true

WEB_PORT=80
```

---

## 🏗️ Paso 5: Levantar los servicios

```bash
cd /opt/crm-lodejuan
docker compose up -d
```

El servicio `chatwoot-migrate` va a preparar la base de datos y terminar. Los demás quedan corriendo. Esperá un minuto y verificá que todo esté bien:

```bash
docker compose ps
```

Deberías ver algo así:

```
NAME                STATUS
chatwoot-migrate    Exited (0)     ← OK, terminó su trabajo
chatwoot-web        Up (healthy)
chatwoot-worker     Up
postgres            Up (healthy)
redis               Up (healthy)
ai-agent            Up
nginx               Up
```

Si `chatwoot-migrate` salió con código distinto de 0, revisá los logs:

```bash
docker compose logs chatwoot-migrate
```

Para ver los logs en tiempo real de todos los servicios:

```bash
docker compose logs -f
```

---

## 👤 Paso 6: Crear usuario admin en Chatwoot

Una vez que `chatwoot-web` esté en estado `Up (healthy)`, creá el usuario administrador:

```bash
docker compose exec chatwoot-web bundle exec rails runner "
  account = Account.first_or_create!(name: 'Lo de Juan')
  user = User.new(
    name: 'Admin',
    email: 'tu@email.com',
    password: 'TuPasswordSeguro123!',
    password_confirmation: 'TuPasswordSeguro123!',
    type: 'SuperAdmin'
  )
  user.save!
  AccountUser.create!(account: account, user: user, role: :administrator)
  puts 'Usuario creado: ' + user.email
"
```

> Reemplazá `tu@email.com` y `TuPasswordSeguro123!` con tus datos reales.

Ahora entrá a Chatwoot desde el navegador: `http://IP_DEL_VPS:3000` e iniciá sesión con esas credenciales para verificar que funciona.

---

## 🔒 Paso 7: Configurar HTTPS con Let's Encrypt

### Instalar Certbot

```bash
apt install -y certbot python3-certbot-nginx
```

### Detener Nginx temporalmente para obtener el certificado

```bash
docker compose stop nginx
```

### Obtener el certificado SSL

```bash
certbot certonly --standalone -d tudominio.com -d www.tudominio.com \
  --non-interactive --agree-tos --email tu@email.com
```

Los certificados quedan en `/etc/letsencrypt/live/tudominio.com/`.

### Actualizar la config de Nginx para SSL

Editá `docker/nginx.conf` para agregar el bloque HTTPS:

```bash
nano /opt/crm-lodejuan/docker/nginx.conf
```

Reemplazá el contenido por:

```nginx
server {
    listen 80;
    server_name tudominio.com www.tudominio.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name tudominio.com www.tudominio.com;

    ssl_certificate     /etc/letsencrypt/live/tudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tudominio.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri.html $uri/ =404;
    }

    location /admin/ {
        try_files $uri $uri.html $uri/ =404;
    }

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /chatwoot/ {
        proxy_pass http://chatwoot-web:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /webhook/ {
        proxy_pass http://ai-agent:4000/webhook/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://ai-agent:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Montar los certificados en el container de Nginx

Editá `docker-compose.yml` y agregá los certificados como volúmenes en el servicio `nginx`:

```yaml
  nginx:
    volumes:
      # ... los volúmenes que ya existen ...
      - /etc/letsencrypt:/etc/letsencrypt:ro
```

También cambiá el puerto para exponer el 443:

```yaml
    ports:
      - "80:80"
      - "443:443"
```

### Actualizar .env y reiniciar

```bash
# Actualizar CHATWOOT_URL y PUBLIC_URL en .env
nano .env
# CHATWOOT_URL=https://tudominio.com/chatwoot
# PUBLIC_URL=https://tudominio.com

# Reiniciar con la nueva config
docker compose up -d --force-recreate nginx
```

### Renovación automática del certificado

```bash
# Agregar cron job para renovar el certificado automáticamente
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && docker compose -f /opt/crm-lodejuan/docker-compose.yml restart nginx") | crontab -
```

---

## 🔑 Paso 8: Configurar Chatwoot — obtener API token

### Crear un inbox de prueba (API inbox)

1. Andá a `https://tudominio.com/chatwoot`
2. Iniciá sesión con el usuario admin
3. Ir a **Settings → Inboxes → Add new inbox**
4. Elegí **API** como tipo de inbox
5. Ponele nombre `Lo de Juan - Bot`
6. Copiá el **Inbox ID** que aparece (normalmente `1`)

### Obtener el API token

1. En Chatwoot, ir a **Settings → Account Settings**
2. Bajá hasta la sección **Access Token**
3. Copiá el token

### Actualizar .env y reiniciar el agente

```bash
nano /opt/crm-lodejuan/.env
# CHATWOOT_API_TOKEN=el_token_que_copiaste
# CHATWOOT_ACCOUNT_ID=1   (o el ID de tu cuenta)

# Reiniciar solo el agente IA
docker compose restart ai-agent
```

### Configurar el webhook en Chatwoot

1. En Chatwoot, ir a **Settings → Integrations → Webhooks**
2. Hacer clic en **Add new webhook**
3. URL del webhook: `https://tudominio.com/webhook/chatwoot`
4. Tildar los eventos: **Message Created**, **Conversation Created**
5. Guardar

---

## 📱 Paso 9: Conectar WhatsApp (Meta Business)

### Crear la app en Meta for Developers

1. Andá a https://developers.facebook.com
2. Creá una cuenta de Meta Business si no tenés
3. Ir a **My Apps → Create App**
4. Elegí tipo **Business**
5. Poné un nombre (ej: "Lo de Juan CRM")
6. Seleccioná tu Business Account

### Configurar WhatsApp en la app

1. En el dashboard de la app, buscá el producto **WhatsApp** y hacé clic en **Set up**
2. Seguí los pasos para agregar un número de teléfono de producción
3. En **WhatsApp → Configuration**, anotá:
   - **Phone Number ID**
   - **WhatsApp Business Account ID**

### Obtener credenciales

En **Settings → Basic** de tu app:
- Copiá el **App ID** → va a `FB_APP_ID` en `.env`
- Copiá el **App Secret** → va a `FB_APP_SECRET` en `.env`

Para `FB_VERIFY_TOKEN`, generá un string aleatorio y usalo:
```bash
openssl rand -hex 16
# Ej: a3f7b2c9d1e4f5a6b7c8d9e0
```

### Configurar el webhook de WhatsApp

1. En la app de Meta, ir a **WhatsApp → Configuration**
2. En **Webhook**, hacer clic en **Edit**
3. Callback URL: `https://tudominio.com/chatwoot/auth/sign_in` ← Chatwoot maneja esto
   > Chatwoot expone el webhook de WhatsApp en `/auth/sign_in` — en realidad la URL correcta depende de tu configuración de inbox. Ver paso siguiente.
4. Verify Token: el valor que pusiste en `FB_VERIFY_TOKEN`

### Crear el inbox de WhatsApp en Chatwoot

1. En Chatwoot, ir a **Settings → Inboxes → Add new inbox**
2. Elegí **WhatsApp**
3. Completá:
   - **Phone Number**: tu número de WhatsApp Business
   - **API Key**: tu token de acceso de WhatsApp (del panel de Meta)
   - **Phone Number ID**: el ID del número
   - **Business Account ID**: el WABA ID
4. En la pantalla de confirmación, Chatwoot te muestra la **Webhook URL** — copiala
5. Volvé a Meta → **WhatsApp → Configuration → Webhook** y pegá esa URL
6. Suscribite al evento `messages`

### Actualizar .env con las credenciales de Meta

```bash
nano /opt/crm-lodejuan/.env
# FB_APP_ID=123456789
# FB_APP_SECRET=abcdef...
# FB_VERIFY_TOKEN=a3f7b2c9d1e4f5a6b7c8d9e0

docker compose restart chatwoot-web chatwoot-worker
```

---

## ✔️ Paso 10: Verificar que todo funciona

Chequeá cada punto:

- [ ] **Landing page**: `https://tudominio.com` muestra el sitio de Lo de Juan
- [ ] **Panel admin**: `https://tudominio.com/admin/` abre el panel
- [ ] **Chatwoot**: `https://tudominio.com/chatwoot` carga el CRM y podés iniciar sesión
- [ ] **Calendario**: la landing muestra fechas disponibles/ocupadas correctamente
- [ ] **Bot responde**: enviá un mensaje al inbox de API y verificá que `ai-agent` lo procese

```bash
# Ver logs del agente en tiempo real
docker compose logs -f ai-agent
```

- [ ] **WhatsApp**: enviá un mensaje al número de WhatsApp Business y verificá que llegue a Chatwoot y que el bot responda
- [ ] **HTTPS**: el certificado es válido (candado verde en el browser)
- [ ] **MercadoPago**: probá crear un link de pago desde el bot (si está configurado)

---

## 🔧 Mantenimiento

### Ver logs

```bash
# Todos los servicios
docker compose logs -f

# Un servicio específico
docker compose logs -f ai-agent
docker compose logs -f chatwoot-web
docker compose logs --tail=100 postgres
```

### Reiniciar un servicio

```bash
docker compose restart ai-agent
docker compose restart chatwoot-web chatwoot-worker
```

### Actualizar la imagen de Chatwoot

```bash
cd /opt/crm-lodejuan
docker compose pull chatwoot-web chatwoot-worker
docker compose up -d --no-deps chatwoot-web chatwoot-worker
```

### Actualizar el agente IA (después de cambios en el código)

```bash
cd /opt/crm-lodejuan
docker compose build ai-agent
docker compose up -d --no-deps ai-agent
```

### Backup de la base de datos

```bash
# Crear backup
docker compose exec postgres pg_dump -U chatwoot chatwoot_production \
  > /opt/backups/chatwoot_$(date +%Y%m%d_%H%M%S).sql

# Restaurar backup
docker compose exec -T postgres psql -U chatwoot chatwoot_production \
  < /opt/backups/chatwoot_20260101_120000.sql
```

Automatizar backups diarios:

```bash
mkdir -p /opt/backups
(crontab -l 2>/dev/null; echo "0 2 * * * docker compose -f /opt/crm-lodejuan/docker-compose.yml exec -T postgres pg_dump -U chatwoot chatwoot_production > /opt/backups/chatwoot_\$(date +\%Y\%m\%d).sql && find /opt/backups -name '*.sql' -mtime +7 -delete") | crontab -
```

### Cambiar el modelo de Claude

```bash
nano /opt/crm-lodejuan/.env
# ANTHROPIC_MODEL=claude-sonnet-4-6

docker compose restart ai-agent
```

---

## 🆘 Troubleshooting

### `chatwoot-migrate` sale con error

```bash
docker compose logs chatwoot-migrate
```

Causas comunes:
- `POSTGRES_PASSWORD` vacío o mal configurado → revisá `.env`
- La base de datos tardó en arrancar → esperá 30 segundos y volvé a correr `docker compose up -d`

```bash
# Forzar re-ejecutar las migraciones
docker compose run --rm chatwoot-migrate bundle exec rails db:chatwoot_prepare
```

### El agente IA no responde

```bash
docker compose logs ai-agent
```

Verificar:
1. `CHATWOOT_API_TOKEN` está configurado en `.env`
2. `ANTHROPIC_API_KEY` es válida
3. El webhook en Chatwoot apunta a `https://tudominio.com/webhook/chatwoot`
4. El container está corriendo: `docker compose ps ai-agent`

### Nginx da error 502

```bash
docker compose logs nginx
docker compose ps
```

Verificar que `chatwoot-web` y `ai-agent` estén en estado `Up`. Si alguno crasheó:

```bash
docker compose up -d chatwoot-web ai-agent
```

### El certificado SSL no renueva

```bash
certbot renew --dry-run
```

Si falla, puede ser que el puerto 80 esté ocupado por Docker:

```bash
docker compose stop nginx
certbot renew
docker compose start nginx
```

### Ver el uso de recursos

```bash
docker stats
```

### Limpiar espacio en disco (imágenes viejas)

```bash
docker system prune -f
docker volume ls  # NO borres los volúmenes con datos (postgres_data, etc.)
```

### Reinicio completo (último recurso)

```bash
cd /opt/crm-lodejuan
docker compose down
docker compose up -d
```

> Esto **no borra datos**. Los volúmenes de PostgreSQL, Redis y el agente persisten.

---

## 📋 Variables de entorno — referencia rápida

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL | `openssl rand -hex 24` |
| `SECRET_KEY_BASE` | Clave secreta de Rails | `openssl rand -hex 64` |
| `CHATWOOT_URL` | URL pública de Chatwoot | `https://tudominio.com/chatwoot` |
| `CHATWOOT_API_TOKEN` | Token de API de Chatwoot | Obtenido desde Settings |
| `CHATWOOT_ACCOUNT_ID` | ID de la cuenta en Chatwoot | `1` |
| `ANTHROPIC_API_KEY` | API key de Claude/Anthropic | `sk-ant-api03-...` |
| `ANTHROPIC_MODEL` | Modelo de Claude a usar | `claude-sonnet-4-6` |
| `PUBLIC_URL` | URL pública para webhooks | `https://tudominio.com` |
| `GOOGLE_CALENDAR_ICS_URL` | URL iCal del calendario | URL secreta de Google Calendar |
| `MERCADOPAGO_ACCESS_TOKEN` | Token de MercadoPago | `APP_USR-...` |
| `FB_APP_ID` | App ID de Meta | De Meta for Developers |
| `FB_APP_SECRET` | App Secret de Meta | De Meta for Developers |
| `FB_VERIFY_TOKEN` | Token de verificación webhook | `openssl rand -hex 16` |
| `OPENAI_API_KEY` | API key de OpenAI (Whisper) | `sk-...` (opcional) |
| `DEBOUNCE_MS` | Ms de espera antes de responder | `60000` |

---

## 🔑 Obtener credenciales de MercadoPago

El bot genera links de pago para cobrar la seña. Para que funcione necesitás el Access Token de producción.

### Paso a paso

1. **Crear cuenta de MercadoPago** (si no tenés): https://www.mercadopago.com.ar/registration

2. **Entrar al portal de desarrolladores**: https://www.mercadopago.com.ar/developers/panel

3. **Crear una aplicación**:
   - Hacé clic en **"Crear aplicación"**
   - Nombre: `Lo de Juan CRM` (o el nombre que quieras)
   - Seleccioná **"Pagos online"** como producto
   - Modelo de integración: **"CheckoutPro"**
   - Aceptá los términos y hacé clic en **Crear aplicación**

4. **Obtener las credenciales de producción**:
   - Una vez creada la app, entrá a la misma
   - Andá a la sección **"Credenciales de producción"** (pestaña "Producción")
   - Copiá el **Access Token** — tiene el formato `APP_USR-1234567890123456-...`
   - Ese valor va en `MERCADOPAGO_ACCESS_TOKEN` del `.env`

5. **Activar credenciales de producción** (importante):
   - MercadoPago requiere que actives las credenciales de producción
   - Puede pedir que verifiques tu identidad
   - Hasta que no estén activas, solo podés usar las de **prueba** (test)

### Probar con credenciales de prueba

Si querés probar antes de activar producción:
- Usá las credenciales de la pestaña **"Credenciales de prueba"**
- Los pagos se hacen con tarjetas de prueba de MercadoPago
- Documentación de tarjetas de prueba: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/your-integrations/test/cards

### Resumen de lo que va en .env

```env
MERCADOPAGO_ACCESS_TOKEN=APP_USR-1234567890123456-123456-abcdef1234567890abcdef1234567890-123456789
PUBLIC_URL=https://tudominio.com
```

> `PUBLIC_URL` es necesario para que MercadoPago avise cuando se confirma un pago (webhook de notificación).

---

## 📅 Obtener URL de Google Calendar (ICS)

El bot y la landing page usan una URL secreta de Google Calendar para saber qué fechas están ocupadas. Es solo lectura — el calendario no se modifica.

### Paso a paso

1. **Abrir Google Calendar**: https://calendar.google.com

2. **Elegir o crear un calendario**:
   - Podés usar el calendario principal o crear uno específico para eventos
   - Para crear uno nuevo: en la barra izquierda, hacé clic en **"+"** al lado de "Otros calendarios" → **"Crear un calendario"**
   - Nombre: `Eventos Lo de Juan` (por ejemplo)

3. **Abrir la configuración del calendario**:
   - En la barra izquierda, buscá el calendario
   - Hacé clic en los **tres puntos** (⋮) al lado del nombre
   - Elegí **"Configuración y uso compartido"**

4. **Copiar la dirección secreta en formato iCal**:
   - Bajá hasta la sección **"Integrar calendario"**
   - Buscá **"Dirección secreta en formato iCal"**
   - Hacé clic en el ícono de copiar al lado de la URL
   - La URL tiene este formato: `https://calendar.google.com/calendar/ical/xxxx/private-yyyy/basic.ics`

5. **Pegar en el .env**:

```env
GOOGLE_CALENDAR_ICS_URL=https://calendar.google.com/calendar/ical/xxxx/private-yyyy/basic.ics
```

### Cómo funciona

- El bot y la landing consultan esta URL cada 5 minutos (cache)
- Si hay un evento en una fecha, esa fecha aparece como **ocupada** en el calendario de la landing
- También el bot la usa para responder "esa fecha no está disponible" al cliente
- Los eventos se cargan tanto desde Google Calendar como desde las reservas hechas por el bot (se combinan)

### Importante

- La URL es **secreta** — no la compartas públicamente. Quien tenga la URL puede ver los eventos del calendario
- Si cambiás o regenerás la URL en Google Calendar, actualizá el `.env` y reiniciá: `docker compose restart ai-agent`

---

## 🤖 Obtener API Key de Anthropic (Claude)

El bot usa la API de Claude para responder a los clientes.

### Paso a paso

1. **Crear cuenta**: https://console.anthropic.com
2. Ir a **Settings → API Keys**
3. Hacer clic en **"Create Key"**
4. Copiar la key — tiene formato `sk-ant-api03-...`
5. Pegar en el `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxx
ANTHROPIC_MODEL=claude-sonnet-4-6
```

### Cargar crédito

- La API de Claude es prepago
- Ir a **Settings → Billing → Add funds**
- Con USD 10 tenés para arrancar (~300-500 conversaciones con Sonnet)
- Recomendación: configurar un **límite de gasto mensual** en Settings → Limits

### Modelos disponibles

| Modelo | Calidad | Costo aprox. por conversación |
|--------|---------|-------------------------------|
| `claude-sonnet-4-6` | Muy buena (recomendado) | ~USD 0.01-0.03 |
| `claude-opus-4-7` | Máxima | ~USD 0.05-0.15 |
| `claude-haiku-4-5` | Buena (rápido) | ~USD 0.002-0.005 |

---

## 🎤 Obtener API Key de OpenAI (Whisper — opcional)

Si querés que el bot transcriba audios de WhatsApp en vez de pedir que escriban por texto.

### Paso a paso

1. **Crear cuenta**: https://platform.openai.com
2. Ir a **API Keys**: https://platform.openai.com/api-keys
3. Hacer clic en **"Create new secret key"**
4. Copiar la key — tiene formato `sk-...`
5. Pegar en el `.env`:

```env
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
```

### Cargar crédito

- También es prepago
- Ir a **Settings → Billing → Add funds**
- Con USD 5 tenés para meses (Whisper cuesta USD 0.006/minuto de audio)

> Si no configurás esta key, el bot simplemente le pide al cliente que escriba por texto. No rompe nada.
