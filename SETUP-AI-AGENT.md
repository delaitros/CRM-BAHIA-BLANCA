# Agente IA - Arquitectura y configuración

Sistema de atención automática para WhatsApp, Instagram y Facebook.

**Stack:** Chatwoot + Agente IA propio (Claude / Anthropic API) + PostgreSQL + Redis + Nginx.

> Para instalar paso a paso, leé **QUICK-START.md**.
> Para deploy con panel web, leé **DEPLOY-DOKPLOY.md**.

---

## Cómo funciona

```
Cliente escribe por WhatsApp/IG/FB
        │
        ▼
   Chatwoot recibe el mensaje
        │
        ▼  webhook (message_created)
   Agente IA (servicio Node, carpeta ai-agent/)
        │
        ├── Lee el historial de la conversación (API de Chatwoot)
        ├── Llama a Claude con prompt cacheado + herramientas:
        │     • generar_presupuesto      -> calcula montos + IVA
        │     • verificar_disponibilidad -> revisa fechas ocupadas
        │     • derivar_humano           -> abre la conv. para un agente
        │
        ▼
   Responde por el mismo canal (API de Chatwoot)
```

Reemplaza al antiguo flujo de n8n por un servicio propio: más simple de
mantener, más barato (usa *prompt caching* de Anthropic) y con lógica de
negocio real (presupuestos calculados, no inventados).

---

## Componentes (carpeta `ai-agent/`)

| Archivo        | Qué es                                                   |
|----------------|----------------------------------------------------------|
| `server.js`    | Servidor del webhook + loop de Claude con herramientas   |
| `negocio.json` | **Precios, servicios, horarios.** Editable sin programar  |
| `Dockerfile`   | Imagen del servicio                                      |

Fechas ocupadas: archivo `reservas.json` en el volumen `ai_agent_data`
(`{"fechas_ocupadas":["2026-06-20"]}`). Más adelante se puede conectar
Google Calendar o el panel admin para escribirlo.

---

## Personalización

### Cambiar precios / servicios / horarios
Editá `ai-agent/negocio.json` y reiniciá:
```bash
docker compose restart ai-agent
```

### Cambiar el tono o las instrucciones del agente
Editá `construirSystemPrompt(...)` en `ai-agent/server.js` y reconstruí:
```bash
docker compose up -d --build ai-agent
```

### Elegir modelo (calidad vs costo)
Variable `ANTHROPIC_MODEL` en `.env`:
- `claude-opus-4-7` — máxima calidad (más caro)
- `claude-sonnet-4-6` — equilibrado (recomendado para volumen)
- `claude-haiku-4-5` — rápido y barato (tareas simples)

---

## Costos estimados mensuales

| Componente              | Costo                                  |
|-------------------------|----------------------------------------|
| Servidor (VPS 2-4GB)    | $5-6 USD                               |
| Claude API              | $3-15 USD (según volumen y modelo)     |
| WhatsApp Business API   | Gratis (primeras 1000 conv./mes)       |
| Instagram / Facebook    | Gratis                                 |
| **Total estimado**      | **~$10-25 USD/mes**                    |

---

## Solución de problemas

**El agente no responde:**
```bash
docker compose logs -f ai-agent
```
- Verificá `ANTHROPIC_API_KEY` y `CHATWOOT_API_TOKEN` en `.env`.
- Verificá que el webhook de Chatwoot apunte a
  `http://ai-agent:4000/webhook/chatwoot` con el evento `message_created`.

**Chatwoot no inicia:**
```bash
docker compose logs chatwoot-web
docker compose restart chatwoot-migrate
```

**Probar el webhook a mano:**
```bash
curl -X POST http://localhost/webhook/chatwoot -H "Content-Type: application/json" -d '{"event":"test"}'
```
