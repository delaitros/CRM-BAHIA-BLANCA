# Guía rápida - Lo de Juan

Sistema: Web + Chatwoot (bandeja WhatsApp/IG/FB) + Agente IA con Claude.

Esto tiene **2 partes**:
- **Lo automático** → un solo comando (`./install.sh`).
- **4 pasos manuales** que solo podés hacer vos (cuentas y claves).

---

## Parte A — Lo automático

En el servidor (o tu compu con Docker):

```bash
git clone https://github.com/delaitros/crm-bahia-blanca.git
cd crm-bahia-blanca
./install.sh
```

El instalador:
- Crea el `.env` y genera las claves seguras solo.
- Construye y levanta todo con Docker.
- Te avisa qué falta de los pasos manuales.

---

## Parte B — Tus 4 pasos manuales

### Paso 1 — Conseguir un servidor (si vas a producción)

Recomendado: **Hetzner CX22** (~€4.51/mes) o **DonWeb** (pagás en pesos).
Para solo probar: tu compu con Docker Desktop alcanza.

> WhatsApp real necesita una URL pública con HTTPS. En local usá `ngrok`
> para exponer temporalmente el puerto 80.

### Paso 2 — API key de Claude (2 minutos)

1. Entrá a https://console.anthropic.com/
2. Settings → API Keys → Create Key
3. Editá el archivo `.env` y pegá la clave en:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
4. (Opcional) Elegí modelo en `ANTHROPIC_MODEL` (ver comentarios del `.env`).
   Más barato: `claude-haiku-4-5`. Equilibrado: `claude-sonnet-4-6`.

### Paso 3 — Configurar Chatwoot (10 minutos)

1. Abrí `http://localhost:3000` (o tu dominio) y creá el usuario administrador.
2. Andá a **Profile Settings → Access Token** y copiá el token.
3. Pegalo en `.env`:
   ```
   CHATWOOT_API_TOKEN=tu_token_aca
   ```
4. Reiniciá el agente y creá el webhook automático:
   ```bash
   docker compose up -d
   bash scripts/configure-chatwoot-webhook.sh
   ```
   (Si falla, creálo a mano en **Settings → Integrations → Webhooks**,
   URL `http://ai-agent:4000/webhook/chatwoot`, evento `message_created`.)

### Paso 4 — Conectar WhatsApp / Instagram / Facebook

En Chatwoot: **Settings → Inboxes → Add Inbox** y seguí el asistente para
cada canal. WhatsApp requiere una cuenta de **Meta Business** (este trámite
es obligatorio en cualquier plataforma, no lo evita ningún sistema).

---

## Cambiar precios sin programar

Editá `ai-agent/negocio.json` (precios, servicios, horarios) y reiniciá:

```bash
docker compose restart ai-agent
```

## Comandos útiles

```bash
docker compose ps                 # ver estado
docker compose logs -f ai-agent   # ver qué responde la IA
docker compose restart ai-agent   # reiniciar el agente
docker compose down               # apagar todo
```

Para deploy con panel web (sin tocar Docker a mano) ver **DEPLOY-DOKPLOY.md**.
