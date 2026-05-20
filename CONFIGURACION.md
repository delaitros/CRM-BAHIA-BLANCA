# Guía de Configuración — Lo de Juan

Todo lo que necesitás configurar vos (cuentas, claves y conexiones externas).
El sistema ya está instalado — estos son los pasos que solo podés hacer vos.

---

## Índice

1. [Panel de Administración (acceso y contraseña)](#1-panel-de-administración)
2. [API Key de Claude (Inteligencia Artificial)](#2-api-key-de-claude)
3. [MercadoPago (cobro de seña)](#3-mercadopago)
4. [WhatsApp Business (Meta)](#4-whatsapp-business)
5. [Instagram Direct](#5-instagram-direct)
6. [Facebook Messenger](#6-facebook-messenger)
7. [Google Calendar (opcional)](#7-google-calendar)
8. [Dominio y HTTPS (producción)](#8-dominio-y-https)
9. [Chatwoot — primera vez](#9-chatwoot--primera-vez)

---

## 1. Panel de Administración

**URL de acceso:** `http://tu-dominio.com/admin/login.html`  
**Contraseña por defecto:** `lodejuan2026`

### Cómo cambiar la contraseña:
1. Abrí el archivo `admin/auth.js`
2. Cambiá la línea:
   ```js
   var ADMIN_PASSWORD = 'lodejuan2026';
   ```
   por tu contraseña nueva.
3. Reiniciá nginx:
   ```bash
   docker compose restart nginx
   ```

> **Importante:** El admin es solo para vos. No lo compartas. Si algún día lo abrís desde otro dispositivo, necesitás volver a loguearte (la sesión no persiste entre navegadores).

---

## 2. API Key de Claude

El agente de IA usa Claude (Anthropic) para responder los mensajes.

### Pasos:
1. Entrá a **https://console.anthropic.com/**
2. Creá una cuenta (si no tenés)
3. Andá a **Settings → API Keys → Create Key**
4. Copiá la clave (empieza con `sk-ant-...`)
5. Abrí el archivo `.env` y pegá:
   ```
   ANTHROPIC_API_KEY=sk-ant-TUCLAVEACA
   ```
6. Reiniciá el agente:
   ```bash
   docker compose restart ai-agent
   ```

### Elegir el modelo (calidad vs costo):
```
ANTHROPIC_MODEL=claude-haiku-4-5      # Más barato (~$0.25/millón tokens)
ANTHROPIC_MODEL=claude-sonnet-4-6     # Equilibrado (~$3/millón tokens) ← Recomendado
ANTHROPIC_MODEL=claude-opus-4-7       # Máxima calidad (~$15/millón tokens)
```

**Costo estimado real:** Con 100 conversaciones por mes, Sonnet cuesta ~$2-5 USD.

---

## 3. MercadoPago

Para que el agente cierre ventas cobrando la seña automáticamente.

### Pasos:
1. Entrá a **https://www.mercadopago.com.ar/developers**
2. Iniciá sesión con tu cuenta de MercadoPago
3. Andá a **Tus integraciones → Crear aplicación**
   - Nombre: "Lo de Juan"
   - Producto: "Pagos online"
4. Dentro de la aplicación, andá a **Credenciales de producción**
5. Copiá el **Access Token** (empieza con `APP_USR-...`)
6. En `.env`:
   ```
   MERCADOPAGO_ACCESS_TOKEN=APP_USR-TUTOKENACA
   PUBLIC_URL=https://tudominio.com
   ```
7. Reiniciá:
   ```bash
   docker compose restart ai-agent
   ```

> **Nota:** Si no configurás MercadoPago, el agente igual funciona. Cuando el cliente quiera reservar, el bot lo deriva a vos para coordinar el pago a mano.

### Configurar el porcentaje de seña:
Editá `ai-agent/negocio.json`:
```json
"sena_porcentaje": 40
```
Este valor es el % del total que el cliente paga como seña. Por defecto: 40%.

---

## 4. WhatsApp Business

Este es el paso más largo pero el más importante. Necesitás una cuenta de **Meta Business**.

### Pre-requisitos:
- Una cuenta de Facebook personal
- Un número de teléfono para WhatsApp Business (puede ser el mismo que ya usás, pero lo vas a "migrar")
- Acceso a ese número para verificarlo por SMS

### Pasos completos:

#### Parte A — Meta Business Suite
1. Andá a **https://business.facebook.com/**
2. Creá una cuenta de Business (si no tenés): nombre "Lo de Juan Catering"
3. Verificá tu empresa (sube CUIT o documentación)

#### Parte B — WhatsApp Business API
1. En Meta Business, andá a **WhatsApp → Empezar**
2. Creá un "número de teléfono empresarial" con tu número
3. Te van a pedir verificarlo por SMS o llamada
4. Una vez verificado, generá un **Token de acceso permanente**

#### Parte C — Conectar en Chatwoot
1. Abrí Chatwoot en `http://tudominio.com:3000`
2. Andá a **Settings → Inboxes → Add Inbox**
3. Seleccioná **WhatsApp**
4. Completá:
   - **Phone Number ID**: el ID que te da Meta
   - **Business Account ID**: el ID de tu cuenta de negocio
   - **API Access Token**: el token permanente que generaste
   - **Webhook Verify Token**: cualquier texto que inventes, ej. `mihooktoken123`
5. En Meta Business, configurá el webhook:
   - URL: `https://tudominio.com/chatwoot/webhooks/whatsapp`
   - Token de verificación: el mismo texto que pusiste arriba
   - Eventos a suscribir: `messages`

> **Tip:** WhatsApp requiere HTTPS. En local usá [ngrok](https://ngrok.com/) para obtener una URL pública temporaria.

---

## 5. Instagram Direct

### Pre-requisitos:
- Cuenta de Instagram Business (no personal)
- Esa cuenta de Instagram conectada a una Página de Facebook

### Pasos:
1. En Meta Business Suite, andá a **Instagram → Settings**
2. Activá los mensajes de Instagram Direct para la API
3. En Chatwoot → **Settings → Inboxes → Add Inbox → Instagram**
4. Conectá con tu cuenta de Facebook/Instagram
5. Seleccioná la página asociada a tu Instagram Business

---

## 6. Facebook Messenger

### Pasos:
1. En Meta Business Suite, creá o conectá tu **Página de Facebook**
2. En Chatwoot → **Settings → Inboxes → Add Inbox → Facebook**
3. Conectate con Facebook y seleccioná tu Página
4. Chatwoot configura el webhook automáticamente

---

## 7. Google Calendar

Para ver tu Google Calendar dentro del panel admin del CRM.

### Pasos:
1. Abrí **Google Calendar** en tu computadora (calendar.google.com)
2. En la lista de calendarios a la izquierda, tocá los **3 puntitos** del calendario que querés mostrar
3. Seleccioná **"Configuración y uso compartido"**
4. Scrolleá hasta **"Integrar el calendario"**
5. Copiá la URL que aparece en el campo **"Dirección URL pública de este calendario"** (o el src del iframe)
6. Abrí el archivo `admin/auth.js` y pegá la URL:
   ```js
   var GOOGLE_CALENDAR_EMBED_URL = 'https://calendar.google.com/calendar/embed?src=TU_EMAIL%40gmail.com&ctz=America%2FArgentina%2FBuenos_Aires';
   ```
7. Reiniciá nginx:
   ```bash
   docker compose restart nginx
   ```

> **Nota:** El calendario del CRM (la pestaña "Mi Calendario") funciona con sus propios eventos (reservas.json). El Google Calendar es una vista adicional que muestra los eventos de tu Google Calendar personal. Son independientes pero complementarios.

---

## 8. Dominio y HTTPS

Para producción necesitás un dominio con HTTPS. Sin HTTPS, WhatsApp no funciona.

### Opción A — VPS con dominio propio (recomendado)
1. Comprá un dominio (namecheap.com, donweb.com, nic.ar)
2. Apuntá el DNS del dominio a la IP de tu VPS:
   ```
   A   @    TU.IP.DEL.VPS
   A   www  TU.IP.DEL.VPS
   ```
3. Instalá Certbot para HTTPS gratuito:
   ```bash
   apt install certbot
   certbot certonly --standalone -d tudominio.com -d www.tudominio.com
   ```
4. Actualizá el nginx.conf para usar los certificados

### Opción B — Dokploy (más fácil, recomendado para no técnicos)
Ver `DEPLOY-DOKPLOY.md` — Dokploy maneja el HTTPS automáticamente con Let's Encrypt.

### Opción C — Prueba local con ngrok
```bash
ngrok http 80
# Te da una URL tipo: https://abc123.ngrok.io
```
Usá esa URL en `PUBLIC_URL` del `.env` para probar MercadoPago y WhatsApp.

---

## 9. Chatwoot — primera vez

### Crear el usuario administrador:
1. Levantá el sistema: `docker compose up -d`
2. Esperá 2-3 minutos a que termine la migración de la base de datos
3. Abrí `http://localhost:3000` (o tu dominio)
4. Completá el formulario de registro con tu nombre y email
5. Creás la primera cuenta: nombre "Lo de Juan"

### Obtener el API Token:
1. Logueado en Chatwoot, andá a **Profile Settings** (tu perfil, abajo a la izquierda)
2. Scrolleá hasta **"Access Token"**
3. Copiá el token
4. En `.env`:
   ```
   CHATWOOT_API_TOKEN=tutoken
   ```
5. Ejecutá el script de webhook:
   ```bash
   bash scripts/configure-chatwoot-webhook.sh
   ```

### Si el script falla, crear el webhook a mano:
1. En Chatwoot: **Settings → Integrations → Webhooks → Add new webhook**
2. URL: `http://ai-agent:4000/webhook/chatwoot`
3. Subscriptions: tildá **message_created**

---

## Resumen de variables de entorno

| Variable | Obligatoria | Qué es |
|----------|-------------|--------|
| `ANTHROPIC_API_KEY` | ✅ Sí | Clave de Claude AI |
| `CHATWOOT_API_TOKEN` | ✅ Sí | Token del admin de Chatwoot |
| `POSTGRES_PASSWORD` | ✅ Auto | Se genera automático con install.sh |
| `SECRET_KEY_BASE` | ✅ Auto | Se genera automático con install.sh |
| `MERCADOPAGO_ACCESS_TOKEN` | ⚪ Opcional | Para cobrar seña automáticamente |
| `PUBLIC_URL` | ⚪ Si usás MP | URL pública del sistema (con https://) |
| `ANTHROPIC_MODEL` | ⚪ Opcional | Modelo IA. Default: claude-opus-4-7 |
| `DEBOUNCE_MS` | ⚪ Opcional | Tiempo de espera para agrupar mensajes. Default: 7000 |
| `CHATWOOT_ACCOUNT_ID` | ⚪ Opcional | ID de la cuenta en Chatwoot. Default: 1 |

---

## Orden recomendado para el primer setup

1. ✅ `./install.sh` — genera `.env` y levanta los contenedores
2. ✅ Abrí Chatwoot en `:3000`, creá tu usuario admin
3. ✅ Copiá el API token de Chatwoot al `.env`
4. ✅ Pegá tu `ANTHROPIC_API_KEY` en `.env`
5. ✅ `docker compose restart ai-agent`
6. ✅ `bash scripts/configure-chatwoot-webhook.sh`
7. ✅ Probá enviando un mensaje desde Chatwoot
8. ⚪ Configurá MercadoPago (para cobrar seña)
9. ⚪ Conectá WhatsApp/Instagram/Facebook desde Chatwoot
10. ⚪ Comprá dominio + HTTPS para producción

---

## ¿Problemas?

**El agente no responde:**
```bash
docker compose logs -f ai-agent
```
Verificá que `ANTHROPIC_API_KEY` y `CHATWOOT_API_TOKEN` estén configurados.

**Chatwoot no abre:**
```bash
docker compose logs chatwoot-web
docker compose restart chatwoot-migrate
```

**El calendario no muestra eventos:**
Verificá que el agente IA esté corriendo:
```bash
curl http://localhost/api/reservas
```
Debe responder `{"eventos":[]}`.

**Error de permiso en archivos de datos:**
```bash
docker compose exec ai-agent chown -R node:node /data
```
