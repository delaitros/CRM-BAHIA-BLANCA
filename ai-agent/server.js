"use strict";

/*
 * Lo de Juan - Agente IA para Chatwoot
 * Recibe webhooks de Chatwoot, responde con Claude (presupuestos,
 * disponibilidad, info del negocio) y deriva a un humano cuando hace falta.
 *
 * No necesitas tocar este archivo para cambiar precios: edita negocio.json
 */

const fs = require("fs");
const path = require("path");
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");

// ── Config desde el entorno ───────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";
const CHATWOOT_URL = process.env.CHATWOOT_URL || "http://chatwoot-web:3000";
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || "1";
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN || "";
const DATA_DIR = process.env.DATA_DIR || "/data";
const RESERVAS_FILE = path.join(DATA_DIR, "reservas.json");

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("FALTA ANTHROPIC_API_KEY en el .env - el agente no puede responder.");
}
if (!CHATWOOT_API_TOKEN) {
  console.error("FALTA CHATWOOT_API_TOKEN en el .env - el agente no puede contestar en Chatwoot.");
}

const anthropic = new Anthropic(); // usa ANTHROPIC_API_KEY del entorno

// ── Datos del negocio (editables sin programar) ───────────────────────────
function cargarNegocio() {
  const raw = fs.readFileSync(path.join(__dirname, "negocio.json"), "utf8");
  return JSON.parse(raw);
}

// ── Fechas reservadas (disponibilidad) ────────────────────────────────────
function cargarReservas() {
  try {
    return JSON.parse(fs.readFileSync(RESERVAS_FILE, "utf8"));
  } catch (e) {
    return { fechas_ocupadas: [] };
  }
}

// ── Construccion del system prompt (estable -> se cachea) ─────────────────
function construirSystemPrompt(negocio) {
  const servicios = negocio.servicios
    .map(
      (s) =>
        `- ${s.nombre} (hasta ${s.max_personas} personas): $${s.precio_por_persona.toLocaleString("es-AR")} por persona. Incluye: ${s.incluye}`
    )
    .join("\n");
  const extras = negocio.extras
    .map((e) => {
      const precio = e.precio_total
        ? `$${e.precio_total.toLocaleString("es-AR")} (total)`
        : `$${e.precio_por_persona.toLocaleString("es-AR")} por persona`;
      return `- ${e.nombre}: ${precio}`;
    })
    .join("\n");

  return `Sos el asistente virtual de "${negocio.nombre}", un servicio de ${negocio.rubro} en ${negocio.ubicacion}.

## INFORMACION DEL NEGOCIO
- Nombre: ${negocio.nombre}
- Rubro: ${negocio.rubro}
- Ubicacion: ${negocio.ubicacion}
- Horario de atencion: ${negocio.horario_atencion}

## SERVICIOS Y PRECIOS BASE
${servicios}

## EXTRAS OPCIONALES
${extras}

## INSTRUCCIONES
- Respondé siempre en español rioplatense (vos, ustedes).
- Sé amable, profesional y conciso. Respuestas cortas para WhatsApp/Instagram.
- Usá emojis con moderación (máximo 1-2 por mensaje).
- No inventes informacion ni precios: usá solo lo de arriba o las herramientas.
- Para armar un presupuesto usá la herramienta generar_presupuesto (ella calcula los montos con IVA correctamente). Antes pedí: tipo de evento, cantidad de personas y fecha.
- Si preguntan por una fecha puntual, usá verificar_disponibilidad.
- Si el cliente pide hablar con una persona, o es un reclamo, o algo que no podés resolver, usá derivar_humano.
- Cuando derivás a un humano, avisale al cliente que en breve lo atiende alguien del equipo.`;
}

// ── Definicion de herramientas ────────────────────────────────────────────
const TOOLS = [
  {
    name: "generar_presupuesto",
    description:
      "Calcula un presupuesto detallado con subtotal, IVA y total. Usala cuando el cliente quiere un presupuesto y ya sabés tipo de evento, cantidad de personas y fecha.",
    input_schema: {
      type: "object",
      properties: {
        servicio_id: {
          type: "string",
          enum: ["basico", "premium", "deluxe", "corporativo"],
          description: "El id del servicio de catering elegido"
        },
        cantidad_personas: { type: "integer", description: "Cantidad de invitados" },
        fecha: { type: "string", description: "Fecha del evento en formato YYYY-MM-DD" },
        extras_ids: {
          type: "array",
          items: { type: "string" },
          description: "Lista de ids de extras opcionales (puede ir vacia)"
        }
      },
      required: ["servicio_id", "cantidad_personas", "fecha"]
    }
  },
  {
    name: "verificar_disponibilidad",
    description:
      "Verifica si una fecha esta libre para tomar un evento. Devolvé el resultado al cliente.",
    input_schema: {
      type: "object",
      properties: {
        fecha: { type: "string", description: "Fecha a consultar en formato YYYY-MM-DD" }
      },
      required: ["fecha"]
    }
  },
  {
    name: "derivar_humano",
    description:
      "Deriva la conversacion a un agente humano (abre la conversacion en Chatwoot y deja una nota interna). Usala para reclamos, casos complejos o cuando el cliente lo pide.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "Por que se deriva (breve)" }
      },
      required: ["motivo"]
    }
  }
];

// ── Implementacion de las herramientas ────────────────────────────────────
function ejecutarGenerarPresupuesto(input, negocio) {
  const servicio = negocio.servicios.find((s) => s.id === input.servicio_id);
  if (!servicio) return "Error: servicio no encontrado.";

  const personas = Number(input.cantidad_personas) || 0;
  let subtotal = servicio.precio_por_persona * personas;
  const lineas = [
    `${servicio.nombre}: ${personas} personas x $${servicio.precio_por_persona.toLocaleString("es-AR")} = $${subtotal.toLocaleString("es-AR")}`
  ];

  for (const id of input.extras_ids || []) {
    const extra = negocio.extras.find((e) => e.id === id);
    if (!extra) continue;
    const monto = extra.precio_total
      ? extra.precio_total
      : extra.precio_por_persona * personas;
    subtotal += monto;
    lineas.push(`${extra.nombre}: $${monto.toLocaleString("es-AR")}`);
  }

  const iva = Math.round((subtotal * negocio.iva_porcentaje) / 100);
  const total = subtotal + iva;

  let aviso = "";
  if (personas > servicio.max_personas) {
    aviso = `\n(Nota: ${servicio.nombre} es hasta ${servicio.max_personas} personas. Para ${personas} conviene confirmar con el equipo.)`;
  }

  return (
    `Presupuesto ${negocio.nombre}\n` +
    `Evento: ${servicio.nombre}\n` +
    `Fecha: ${input.fecha}\n` +
    `Cantidad: ${personas} personas\n\n` +
    lineas.join("\n") +
    `\n\nSubtotal: $${subtotal.toLocaleString("es-AR")}\n` +
    `IVA (${negocio.iva_porcentaje}%): $${iva.toLocaleString("es-AR")}\n` +
    `TOTAL: $${total.toLocaleString("es-AR")}\n\n` +
    `Vigencia: ${negocio.vigencia_presupuesto_dias} dias.` +
    aviso
  );
}

function ejecutarVerificarDisponibilidad(input) {
  const reservas = cargarReservas();
  const ocupada = (reservas.fechas_ocupadas || []).includes(input.fecha);
  if (ocupada) {
    return `La fecha ${input.fecha} ya esta reservada. Ofrecele al cliente buscar otra fecha cercana.`;
  }
  return `La fecha ${input.fecha} figura disponible. Confirmá igualmente con el equipo antes de cerrar.`;
}

async function ejecutarDerivarHumano(input, conversationId) {
  await chatwootCambiarEstado(conversationId, "open");
  await chatwootNotaPrivada(
    conversationId,
    `[Agente IA] Derivado a humano. Motivo: ${input.motivo}`
  );
  return "Conversacion derivada a un agente humano. Avisale al cliente que en breve lo atienden.";
}

// ── Chatwoot API ──────────────────────────────────────────────────────────
function chatwootBase() {
  return `${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}`;
}

async function chatwootGetHistorial(conversationId) {
  const res = await fetch(
    `${chatwootBase()}/conversations/${conversationId}/messages`,
    { headers: { api_access_token: CHATWOOT_API_TOKEN } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  const payload = data.payload || [];
  return payload
    .slice(-12)
    .filter((m) => m.content)
    .map((m) => ({
      role: m.message_type === 0 ? "user" : "assistant",
      content: String(m.content)
    }));
}

async function chatwootEnviarMensaje(conversationId, contenido) {
  await fetch(`${chatwootBase()}/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      api_access_token: CHATWOOT_API_TOKEN
    },
    body: JSON.stringify({ content: contenido, message_type: "outgoing" })
  });
}

async function chatwootNotaPrivada(conversationId, contenido) {
  await fetch(`${chatwootBase()}/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      api_access_token: CHATWOOT_API_TOKEN
    },
    body: JSON.stringify({
      content: contenido,
      message_type: "outgoing",
      private: true
    })
  });
}

async function chatwootCambiarEstado(conversationId, estado) {
  await fetch(
    `${chatwootBase()}/conversations/${conversationId}/toggle_status`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        api_access_token: CHATWOOT_API_TOKEN
      },
      body: JSON.stringify({ status: estado })
    }
  );
}

// ── Loop de Claude con herramientas ───────────────────────────────────────
async function responderConClaude(historial, conversationId) {
  const negocio = cargarNegocio();
  const systemPrompt = construirSystemPrompt(negocio);

  const messages = historial.length
    ? historial
    : [{ role: "user", content: "Hola" }];

  for (let i = 0; i < 5; i++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: [
        { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }
      ],
      tools: TOOLS,
      messages
    });

    if (response.stop_reason !== "tool_use") {
      const texto = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return texto || "Disculpá, no pude generar una respuesta. Te paso con una persona.";
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      let result;
      try {
        if (block.name === "generar_presupuesto") {
          result = ejecutarGenerarPresupuesto(block.input, negocio);
        } else if (block.name === "verificar_disponibilidad") {
          result = ejecutarVerificarDisponibilidad(block.input);
        } else if (block.name === "derivar_humano") {
          result = await ejecutarDerivarHumano(block.input, conversationId);
        } else {
          result = "Herramienta desconocida.";
        }
      } catch (err) {
        console.error("Error en herramienta", block.name, err);
        result = "Error al ejecutar la herramienta.";
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: String(result)
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return "Disculpá, esto se complico un poco. Te derivo con una persona del equipo.";
}

// ── Webhook de Chatwoot ───────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, model: MODEL }));

app.post("/webhook/chatwoot", async (req, res) => {
  // Responder rapido para que Chatwoot no reintente
  res.json({ received: true });

  try {
    const body = req.body || {};
    if (body.event !== "message_created") return;
    if (body.message_type !== "incoming") return; // solo mensajes del cliente
    if (body.private) return;

    const conversationId =
      body.conversation && body.conversation.id ? body.conversation.id : null;
    if (!conversationId) return;

    const historial = await chatwootGetHistorial(conversationId);
    const respuesta = await responderConClaude(historial, conversationId);
    await chatwootEnviarMensaje(conversationId, respuesta);
  } catch (err) {
    console.error("Error procesando webhook:", err);
  }
});

app.listen(PORT, () => {
  console.log(`Agente IA escuchando en puerto ${PORT} (modelo: ${MODEL})`);
});
