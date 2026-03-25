# Guía de Instalación - Agente IA para Lo de Juan

Sistema de atención automática con IA para WhatsApp, Instagram y Facebook.

**Stack:** Chatwoot + n8n + Claude/OpenAI + Google Calendar

---

## Requisitos Previos

- Servidor con Docker y Docker Compose (mínimo 2GB RAM, 2 CPU)
- Dominio apuntando al servidor (recomendado para HTTPS)
- Cuenta de Meta Business (para WhatsApp, Instagram, Facebook)
- API Key de OpenAI o Anthropic (Claude)
- Google Calendar configurado (opcional, para disponibilidad)

---

## 1. Configuración Inicial

```bash
# Clonar el repositorio
git clone https://github.com/delaitros/crm-bahia-blanca.git
cd crm-bahia-blanca

# Crear archivo de entorno
cp .env.example .env

# Generar claves seguras
echo "SECRET_KEY_BASE=$(openssl rand -hex 64)" >> .env
echo "N8N_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
```

Editar `.env` con tus datos:
```bash
nano .env
```

Valores **obligatorios** a completar:
- `POSTGRES_PASSWORD` - Contraseña de la base de datos
- `SECRET_KEY_BASE` - Ya generado arriba
- `N8N_PASSWORD` - Contraseña para acceder a n8n
- `N8N_ENCRYPTION_KEY` - Ya generado arriba
- `OPENAI_API_KEY` o `ANTHROPIC_API_KEY` - Al menos una API key de IA

---

## 2. Levantar los Servicios

```bash
# Iniciar todo
docker compose up -d

# Ver logs (esperar a que Chatwoot termine la migración)
docker compose logs -f chatwoot-migrate

# Verificar que todo esté corriendo
docker compose ps
```

**Servicios disponibles:**
| Servicio | URL | Puerto |
|----------|-----|--------|
| Web (Lo de Juan) | http://localhost | 80 |
| Chatwoot | http://localhost:3000 | 3000 |
| n8n | http://localhost:5678 | 5678 |

---

## 3. Configurar Chatwoot

### 3.1 Crear cuenta de administrador
```
Abrir http://localhost:3000
Completar el formulario de registro inicial
```

### 3.2 Configurar canales

**WhatsApp (vía API Cloud de Meta):**
1. Ir a Settings > Inboxes > Add Inbox
2. Seleccionar "WhatsApp"
3. Elegir "WhatsApp Cloud" como proveedor
4. Ingresar el Phone Number ID y Business Account ID de Meta
5. Ingresar el Access Token permanente

**Instagram:**
1. Ir a Settings > Inboxes > Add Inbox
2. Seleccionar "Instagram"
3. Conectar con tu cuenta de Facebook/Instagram Business

**Facebook Messenger:**
1. Ir a Settings > Inboxes > Add Inbox
2. Seleccionar "Facebook"
3. Conectar la página de Facebook

### 3.3 Obtener API Token
1. Ir a Settings > Account Settings
2. Copiar el "Access Token" de la API
3. Agregarlo al `.env` como `CHATWOOT_API_TOKEN`

### 3.4 Configurar Webhook hacia n8n
1. Ir a Settings > Integrations > Webhooks
2. Crear nuevo webhook:
   - **URL:** `http://n8n:5678/webhook/chatwoot-webhook`
   - **Eventos:** `message_created`
3. Guardar

---

## 4. Configurar n8n

### 4.1 Acceder a n8n
```
Abrir http://localhost:5678
Login con las credenciales del .env (N8N_USER / N8N_PASSWORD)
```

### 4.2 Importar el workflow
1. Ir a Workflows > Import from File
2. Seleccionar `n8n/workflows/chatwoot-ai-agent.json`
3. Activar el workflow (toggle en la esquina superior derecha)

### 4.3 Configurar credenciales en n8n

**Chatwoot API Key:**
1. Ir a Settings > Credentials > Add Credential
2. Tipo: "Header Auth"
3. Name: `Chatwoot API Key`
4. Header Name: `api_access_token`
5. Header Value: tu token de Chatwoot (del paso 3.3)

**OpenAI (si usás GPT):**
1. Add Credential > OpenAI API
2. Ingresar tu API Key

**Anthropic/Claude (si usás Claude):**
1. Add Credential > Header Auth
2. Name: `Anthropic API Key`
3. Header Name: `x-api-key`
4. Header Value: tu API key de Anthropic

**Google Calendar (opcional):**
1. Add Credential > Google Calendar OAuth2
2. Seguir las instrucciones de autenticación con Google

---

## 5. Configurar Google Calendar (Opcional)

Para que el agente verifique disponibilidad:

1. Ir a [Google Cloud Console](https://console.cloud.google.com/)
2. Crear un proyecto nuevo o usar uno existente
3. Habilitar "Google Calendar API"
4. Crear credenciales OAuth2 o Service Account
5. Compartir el calendario de eventos con la cuenta de servicio
6. Configurar las credenciales en n8n

---

## 6. Flujo del Agente IA

```
Cliente escribe por WhatsApp/IG/FB
        │
        ▼
    Chatwoot recibe mensaje
        │
        ▼
    Webhook → n8n
        │
        ▼
    Filtrar (solo mensajes entrantes)
        │
        ▼
    Obtener historial de conversación
        │
        ▼
    Enviar a Claude/GPT con contexto del negocio
        │
        ├── Consulta general → Responder con info del negocio
        ├── Pide presupuesto → Generar presupuesto detallado
        ├── Pide fecha → Verificar Google Calendar
        └── Pide persona → Derivar a agente humano
        │
        ▼
    Enviar respuesta por Chatwoot (mismo canal)
```

---

## 7. Personalización

### Modificar respuestas del agente
Editar el system prompt en el workflow de n8n:
- Nodo "Agente IA (Claude)" o "Agente IA (OpenAI)"
- Modificar el campo "System Message"
- Actualizar precios, servicios, horarios según tu negocio

### Agregar nuevas funciones
En n8n podés agregar nodos para:
- Enviar emails de confirmación
- Crear eventos en Google Calendar
- Guardar presupuestos en Google Sheets
- Notificar por Telegram/Slack al equipo
- Integrar con sistema de pagos (MercadoPago)

---

## 8. Producción (con HTTPS)

Para producción, agregar Traefik o Certbot:

```bash
# Instalar certbot
sudo apt install certbot python3-certbot-nginx

# Obtener certificado SSL
sudo certbot --nginx -d tudominio.com
```

O usar Cloudflare Tunnel para exponer los servicios de forma segura.

---

## Solución de Problemas

**Chatwoot no inicia:**
```bash
docker compose logs chatwoot-web
docker compose restart chatwoot-migrate
```

**n8n no recibe webhooks:**
- Verificar que la URL del webhook en Chatwoot sea correcta
- Probar: `curl -X POST http://localhost:5678/webhook/chatwoot-webhook -d '{"test":true}'`

**La IA no responde:**
- Verificar API keys en las credenciales de n8n
- Revisar los logs: `docker compose logs n8n`
- Verificar que el workflow esté activado

**Canales no funcionan:**
- WhatsApp: Verificar que el webhook de Meta apunte a tu Chatwoot
- Instagram/FB: Asegurar que la app de Meta esté en modo "Live"

---

## Costos Estimados Mensuales

| Componente | Costo |
|------------|-------|
| Servidor (VPS 2GB) | $5-15 USD |
| OpenAI GPT-4o-mini | $5-15 USD (según volumen) |
| Claude Sonnet | $5-20 USD (según volumen) |
| WhatsApp Business API | Gratis (primeras 1000 conversaciones/mes) |
| Instagram/Facebook | Gratis |
| Google Calendar API | Gratis |
| **Total estimado** | **$10-50 USD/mes** |
