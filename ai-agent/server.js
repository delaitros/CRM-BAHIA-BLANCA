"use strict";

/*
 * Lo de Juan - Agente IA para Chatwoot
 *
 * - Responde con Claude: info, presupuestos, disponibilidad.
 * - Cierra la venta cobrando una sena con MercadoPago (link de pago).
 * - Cuando el pago se confirma, deriva a un humano y el bot se calla.
 * - Junta los mensajes seguidos del cliente (cola con debounce) para no
 *   pisar ni ignorar ninguno y que la conversacion sea realista.
 *
 * Para cambiar precios/sena: edita negocio.json (no hace falta programar).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");

// ── Config ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";
const CHATWOOT_URL = process.env.CHATWOOT_URL || "http://chatwoot-web:3000";
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || "1";
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN || "";
const MP_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || "";
const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "";
const GOOGLE_SA_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_FILE || "/app/google-service-account.json";
const DATA_DIR = process.env.DATA_DIR || "/data";
const DEBOUNCE_MS = Number(process.env.DEBOUNCE_MS || 60000);
const MAX_MSGS_PER_CONV = Number(process.env.MAX_MSGS_PER_CONV || 30);
const MAX_MSG_LENGTH = Number(process.env.MAX_MSG_LENGTH || 1000);
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 6);
const RESERVAS_FILE = path.join(DATA_DIR, "reservas.json");
const ESTADO_FILE = path.join(DATA_DIR, "estado.json");

if (!process.env.ANTHROPIC_API_KEY)
  console.error("FALTA ANTHROPIC_API_KEY - el agente no puede responder.");
if (!CHATWOOT_API_TOKEN)
  console.error("FALTA CHATWOOT_API_TOKEN - el agente no puede contestar.");
if (!MP_ACCESS_TOKEN)
  console.warn("AVISO: sin MERCADOPAGO_ACCESS_TOKEN no se generan links de pago.");

const anthropic = new Anthropic(); // usa ANTHROPIC_API_KEY del entorno

// ── Datos del negocio (editables) ───────────────────────────────────────
function cargarNegocio() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "negocio.json"), "utf8"));
}

// ── Reservas locales (fallback sin Google Calendar) ───────────────────────
function leerEventosLocal() {
  try {
    const data = JSON.parse(fs.readFileSync(RESERVAS_FILE, "utf8"));
    if (Array.isArray(data.eventos)) return data.eventos;
    return (data.fechas_ocupadas || []).map((f) => ({
      id: f, fecha: f, nombre: "Reservado", tipo: "otro"
    }));
  } catch (e) { return []; }
}

function guardarEventosLocal(eventos) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(RESERVAS_FILE, JSON.stringify({ eventos }, null, 2));
  } catch (e) { console.error("No se pudo guardar eventos:", e); }
}

// ── Google Calendar API ───────────────────────────────────────────────────
function googleCalendarActivo() {
  return GOOGLE_CALENDAR_ID && fs.existsSync(GOOGLE_SA_FILE);
}

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text, json: JSON.parse(text) });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

let gcalTokenCache = { token: null, exp: 0 };

async function getGCalToken() {
  const now = Math.floor(Date.now() / 1000);
  if (gcalTokenCache.token && gcalTokenCache.exp > now + 60) return gcalTokenCache.token;

  const sa = JSON.parse(fs.readFileSync(GOOGLE_SA_FILE, "utf8"));
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claim = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  })).toString("base64url");
  const unsigned = `${header}.${claim}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(unsigned);
  const sig = sign.sign(sa.private_key).toString("base64url");
  const jwt = `${unsigned}.${sig}`;

  const bodyStr = "grant_type=urn%3Aietf%3Aparams%3Aoauth2%3Agrant_type%3Ajwt-bearer&assertion=" + encodeURIComponent(jwt);
  const res = await httpsRequest({
    hostname: "oauth2.googleapis.com",
    path: "/token",
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(bodyStr)
    }
  }, bodyStr);
  const data = res.json;
  if (!data.access_token) throw new Error("GCal token error: " + JSON.stringify(data));
  gcalTokenCache = { token: data.access_token, exp: now + 3600 };
  return data.access_token;
}

async function gcalRequest(method, endpoint, body) {
  const token = await getGCalToken();
  const path = `/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}${endpoint}`;
  const bodyStr = body ? JSON.stringify(body) : null;
  const res = await httpsRequest({
    hostname: "www.googleapis.com",
    path,
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {})
    }
  }, bodyStr);
  if (!res.ok) throw new Error(`GCal ${res.status}: ${res.text}`);
  if (method === "DELETE") return null;
  return res.json;
}

function parsearMetaEvento(ev) {
  const desc = ev.description || "";
  const meta = {};
  desc.split("|").forEach((p) => {
    const i = p.indexOf(":");
    if (i > 0) meta[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return {
    id: ev.id,
    fecha: (ev.start.date || ev.start.dateTime || "").slice(0, 10),
    nombre: ev.summary || "Reservado",
    tipo: meta.tipo || "otro",
    personas: Number(meta.personas) || 0,
    notas: meta.notas || ""
  };
}

async function leerEventos() {
  if (!googleCalendarActivo()) return leerEventosLocal();
  const hoy = new Date().toISOString();
  const data = await gcalRequest("GET", `/events?timeMin=${hoy}&maxResults=200&singleEvents=true&orderBy=startTime`);
  return (data.items || []).map(parsearMetaEvento);
}

async function crearEvento(evento) {
  if (!googleCalendarActivo()) {
    const eventos = leerEventosLocal();
    eventos.push(evento);
    guardarEventosLocal(eventos);
    return evento;
  }
  const endDate = new Date(evento.fecha);
  endDate.setDate(endDate.getDate() + 1);
  const ev = await gcalRequest("POST", "/events", {
    summary: evento.nombre,
    description: `tipo:${evento.tipo}|personas:${evento.personas}|notas:${evento.notas}`,
    start: { date: evento.fecha },
    end: { date: endDate.toISOString().slice(0, 10) }
  });
  return { ...evento, id: ev.id };
}

async function eliminarEvento(id) {
  if (!googleCalendarActivo()) {
    const eventos = leerEventosLocal();
    const nuevos = eventos.filter((e) => e.id !== id);
    if (nuevos.length === eventos.length) throw new Error("not_found");
    guardarEventosLocal(nuevos);
    return;
  }
  await gcalRequest("DELETE", `/events/${encodeURIComponent(id)}`);
}

// ── Estado persistente (modo bot/humano y pagos procesados) ─────────────────
function leerEstado() {
  try {
    return JSON.parse(fs.readFileSync(ESTADO_FILE, "utf8"));
  } catch (e) {
    return { conversaciones: {}, pagos: {} };
  }
}

function guardarEstado(estado) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ESTADO_FILE, JSON.stringify(estado, null, 2));
  } catch (e) {
    console.error("No se pudo guardar estado:", e);
  }
}

function modoConversacion(convId) {
  const est = leerEstado();
  return (est.conversaciones[String(convId)] || {}).modo || "bot";
}

function marcarHumano(convId) {
  const est = leerEstado();
  est.conversaciones[String(convId)] = { modo: "humano" };
  guardarEstado(est);
}

// ── Calculo de presupuesto ──────────────────────────────────────────
function calcularPresupuesto(input, negocio) {
  const servicio = negocio.servicios.find((s) => s.id === input.servicio_id);
  if (!servicio) return null;

  const personas = Number(input.cantidad_personas) || 0;
  const servicioMonto = servicio.precio_total
    ? servicio.precio_total
    : (servicio.precio_por_persona || 0) * personas;
  let subtotal = servicioMonto;
  const lineas = [
    servicio.precio_total
      ? `${servicio.nombre}: $${servicioMonto.toLocaleString("es-AR")} (precio fijo)`
      : `${servicio.nombre}: ${personas} personas x $${servicio.precio_por_persona.toLocaleString("es-AR")} = $${servicioMonto.toLocaleString("es-AR")}`
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
  const sena = Math.round((total * (negocio.sena_porcentaje || 40)) / 100);
  return { servicio, personas, lineas, subtotal, iva, total, sena };
}

// ── MercadoPago ─────────────────────────────────────────────────────
async function mpCrearPreferencia(convId, titulo, monto, negocio) {
  const body = {
    items: [
      {
        title: titulo,
        quantity: 1,
        unit_price: monto,
        currency_id: negocio.moneda || "ARS"
      }
    ],
    external_reference: String(convId),
    metadata: { conversation_id: String(convId) }
  };
  if (PUBLIC_URL) {
    body.notification_url = `${PUBLIC_URL}/webhook/mercadopago`;
    body.back_urls = { success: PUBLIC_URL, pending: PUBLIC_URL, failure: PUBLIC_URL };
    body.auto_return = "approved";
  }

  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    console.error("Error MP preferencia:", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return data.init_point || data.sandbox_init_point || null;
}

async function mpConsultarPago(pagoId) {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${pagoId}`, {
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` }
  });
  if (!res.ok) return null;
  return res.json();
}

// ── Herramientas de Claude ────────────────────────────────────────────
const TOOLS = [
  {
    name: "generar_presupuesto",
    description:
      "Calcula un presupuesto detallado con subtotal, IVA, total y monto de sena. Usala cuando ya sabes tipo de evento, cantidad de personas y fecha.",
    input_schema: {
      type: "object",
      properties: {
        servicio_id: {
          type: "string",
          enum: ["cumple_noche_salon", "cumple_noche_menu", "cumple_teens"]
        },
        cantidad_personas: { type: "integer" },
        fecha: { type: "string", description: "YYYY-MM-DD" },
        extras_ids: {
          type: "array",
          items: { type: "string" },
          description: "IDs de opcionales: dj_noche, dj_teens, daikiris, fluo, rueda_hamster, tobogan_pelotas, circuito_multiaventura, cuatris, tobogan_acuatico, bowling_humano, pile_rueda, combo_tobogan_pile, super_combo_verano"
        }
      },
      required: ["servicio_id", "cantidad_personas", "fecha"]
    }
  },
  {
    name: "verificar_disponibilidad",
    description: "Verifica si una fecha esta libre para tomar un evento.",
    input_schema: {
      type: "object",
      properties: { fecha: { type: "string", description: "YYYY-MM-DD" } },
      required: ["fecha"]
    }
  },
  {
    name: "generar_link_pago",
    description:
      "Genera un link de pago de MercadoPago para cobrar la SENA y reservar la fecha. Usala SOLO cuando el cliente confirmo que quiere reservar. Devolve el link al cliente y explicale que al pagar la sena queda reservada la fecha y lo contacta una persona del equipo.",
    input_schema: {
      type: "object",
      properties: {
        servicio_id: {
          type: "string",
          enum: ["cumple_noche_salon", "cumple_noche_menu", "cumple_teens"]
        },
        cantidad_personas: { type: "integer" },
        fecha: { type: "string", description: "YYYY-MM-DD" },
        extras_ids: { type: "array", items: { type: "string" } }
      },
      required: ["servicio_id", "cantidad_personas", "fecha"]
    }
  },
  {
    name: "derivar_humano",
    description:
      "Deriva la conversacion a un agente humano y el bot deja de responder. Usala para reclamos, casos complejos o cuando el cliente lo pide explicitamente.",
    input_schema: {
      type: "object",
      properties: { motivo: { type: "string" } },
      required: ["motivo"]
    }
  }
];

function ejecutarGenerarPresupuesto(input, negocio) {
  const p = calcularPresupuesto(input, negocio);
  if (!p) return "Error: servicio no encontrado.";
  let aviso = "";
  if (p.servicio.max_personas && p.personas > p.servicio.max_personas) {
    aviso = `\n(Nota: ${p.servicio.nombre} es hasta ${p.servicio.max_personas} personas. Para ${p.personas} conviene confirmar con el equipo.)`;
  }
  if (p.servicio.min_personas && p.personas < p.servicio.min_personas) {
    aviso = `\n(Nota: el mínimo para ${p.servicio.nombre} es ${p.servicio.min_personas} personas.)`;
  }
  return (
    `Presupuesto ${negocio.nombre}\n` +
    `Evento: ${p.servicio.nombre}\nFecha: ${input.fecha}\n` +
    `Cantidad: ${p.personas} personas\n\n` +
    p.lineas.join("\n") +
    `\n\nTOTAL: $${p.total.toLocaleString("es-AR")}\n` +
    `Sena para reservar (${negocio.sena_porcentaje}%): $${p.sena.toLocaleString("es-AR")}\n\n` +
    `Vigencia: ${negocio.vigencia_presupuesto_dias} dias.` +
    aviso
  );
}

async function ejecutarVerificarDisponibilidad(input) {
  const eventos = await leerEventos();
  const ocupada = eventos.some((e) => e.fecha === input.fecha);
  return ocupada
    ? `La fecha ${input.fecha} ya esta reservada. Ofrecele al cliente otra fecha.`
    : `La fecha ${input.fecha} figura disponible.`;
}

async function ejecutarGenerarLinkPago(input, negocio) {
  if (!MP_ACCESS_TOKEN)
    return "MercadoPago no esta configurado. Deriva al cliente con un humano para coordinar el pago.";
  const p = calcularPresupuesto(input, negocio);
  if (!p) return "Error: servicio no encontrado.";
  const titulo = `Sena ${p.servicio.nombre} - ${input.fecha} (${p.personas} personas)`;
  const link = await mpCrearPreferencia(
    input._conversation_id,
    titulo,
    p.sena,
    negocio
  );
  if (!link)
    return "No se pudo generar el link de pago. Deriva al cliente con un humano.";
  return (
    `LINK DE PAGO GENERADO. Envialo al cliente con este texto:\n\n` +
    `Para reservar la fecha ${input.fecha} aboná la seña de ` +
    `$${p.sena.toLocaleString("es-AR")} (${negocio.sena_porcentaje}% del total ` +
    `$${p.total.toLocaleString("es-AR")}) desde este link seguro de MercadoPago:\n` +
    `${link}\n\n` +
    `Apenas se acredite el pago te contacta una persona del equipo para coordinar todos los detalles. ` +
    `El link es valido y podes pagar con tarjeta, debito o dinero en cuenta.`
  );
}

async function ejecutarDerivarHumano(input, convId) {
  marcarHumano(convId);
  await chatwootCambiarEstado(convId, "open");
  await chatwootNotaPrivada(
    convId,
    `[Agente IA] Derivado a humano. Motivo: ${input.motivo}`
  );
  return "Conversacion derivada. Avisale al cliente que en breve lo atiende una persona del equipo. No sigas respondiendo despues de esto.";
}

// ── Chatwoot API ──────────────────────────────────────────────────────
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
  return (data.payload || [])
    .filter((m) => m.content && !m.private)
    .slice(-20)
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

async function chatwootTyping(conversationId, status) {
  try {
    await fetch(
      `${chatwootBase()}/conversations/${conversationId}/toggle_typing_status`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          api_access_token: CHATWOOT_API_TOKEN
        },
        body: JSON.stringify({ typing_status: status })
      }
    );
  } catch (e) {
    /* indicador de "escribiendo", no critico */
  }
}

// ── Transcripción de audio (Whisper) ─────────────────────────────────────
async function transcribeAudio(audioUrl) {
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) throw new Error(`Download failed: ${audioRes.status}`);
  const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

  const boundary = "----WhisperBoundary" + Date.now();
  const fieldParts = [
    { name: "model", value: "whisper-1" },
    { name: "language", value: "es" }
  ];
  const chunks = [];
  chunks.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.ogg"\r\nContent-Type: audio/ogg\r\n\r\n`
  ));
  chunks.push(audioBuffer);
  for (const f of fieldParts) {
    chunks.push(Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"\r\n\r\n${f.value}`
    ));
  }
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const body = Buffer.concat(chunks);
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`
    },
    body
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper API ${res.status}: ${err}`);
  }
  const data = await res.json();
  return (data.text || "").trim();
}

// ── System prompt ────────────────────────────────────────────────────────
function construirSystemPrompt(negocio) {
  const servicios = negocio.servicios
    .map((s) => {
      const precioStr = s.precio_total
        ? `$${s.precio_total.toLocaleString("es-AR")} precio fijo`
        : `$${s.precio_por_persona.toLocaleString("es-AR")} por persona${s.min_personas ? ` (mínimo ${s.min_personas} personas)` : ""}`;
      const capacidad = s.max_personas ? ` | hasta ${s.max_personas} personas` : s.min_personas ? ` | mínimo ${s.min_personas} personas` : "";
      const dias = s.dias_disponibles ? ` | ${s.dias_disponibles}` : "";
      const horario = s.horario ? ` | Horario: ${s.horario}` : "";
      const noIncluye = s.no_incluye ? ` | El cliente trae: ${s.no_incluye}` : "";
      return `- ${s.nombre}${horario}${dias}${capacidad}: ${precioStr}. Incluye: ${s.incluye}${noIncluye}`;
    })
    .join("\n");
  const extras = negocio.extras
    .map((e) => {
      const precio = e.precio_total
        ? `$${e.precio_total.toLocaleString("es-AR")} (total)`
        : `$${e.precio_por_persona.toLocaleString("es-AR")} por persona`;
      return `- ${e.nombre}: ${precio}`;
    })
    .join("\n");

  return `Sos el asistente virtual de "${negocio.nombre}", ${negocio.rubro} en ${negocio.ubicacion}.

## NEGOCIO
- Horario: ${negocio.horario_atencion}

## SERVICIOS Y PRECIOS
${servicios}

## EXTRAS
${extras}

## COMO ATENDER (importante)
- Español rioplatense (vos, ustedes). Amable, profesional, conciso. Máximo 1-2 emojis.
- Te pueden llegar varios mensajes seguidos del cliente: leelos TODOS y respondé de forma integrada. Nunca ignores el último mensaje.
- No inventes precios: usá las herramientas.
- SOLO respondés sobre nuestro negocio: servicios, precios, disponibilidad, eventos y reservas. Si te preguntan sobre código, matemáticas, política, u otro tema que no sea del negocio, respondé amablemente que solo podés ayudar con consultas sobre nuestros servicios y eventos.

## FLUJO DE VENTA (seguilo)
1. Entendé qué evento quiere: tipo, cantidad de personas, fecha.
2. Si pregunta por una fecha puntual: verificar_disponibilidad.
3. Mostrá el presupuesto con generar_presupuesto (incluye la seña).
4. Si el cliente CONFIRMA que quiere reservar: usá generar_link_pago y mandale el link de la seña. Explicále que al pagar queda reservada la fecha y que después lo contacta una persona del equipo.
5. NO digas que el pago está confirmado vos: la confirmación es automática. Después de mandar el link, seguí respondiendo dudas pero no presiones.
6. Reclamos, casos raros o si pide una persona: derivar_humano.`;
}

// ── Loop de Claude ─────────────────────────────────────────────────────────
async function responderConClaude(historial, convId) {
  const negocio = cargarNegocio();
  const systemPrompt = construirSystemPrompt(negocio);
  const messages = historial.length
    ? historial
    : [{ role: "user", content: "Hola" }];

  for (let i = 0; i < 6; i++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
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
      return texto || "Disculpá, no pude generar una respuesta.";
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
          result = await ejecutarVerificarDisponibilidad(block.input);
        } else if (block.name === "generar_link_pago") {
          result = await ejecutarGenerarLinkPago(
            { ...block.input, _conversation_id: convId },
            negocio
          );
        } else if (block.name === "derivar_humano") {
          result = await ejecutarDerivarHumano(block.input, convId);
        } else {
          result = "Herramienta desconocida.";
        }
      } catch (err) {
        console.error("Error herramienta", block.name, err);
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
  return "Disculpá, esto se complicó. Te derivo con una persona del equipo.";
}

// ── Cola con debounce (junta mensajes seguidos, no pisa ni ignora) ────────
const pendientes = new Map(); // convId -> timeout
const procesando = new Set(); // convId en proceso
const rateLimiter = new Map(); // convId -> [timestamp, timestamp, ...]
const audioTranscriptions = new Map(); // convId -> [text, ...]

function isRateLimited(convId) {
  const now = Date.now();
  const timestamps = (rateLimiter.get(convId) || []).filter(t => now - t < RATE_LIMIT_WINDOW);
  timestamps.push(now);
  rateLimiter.set(convId, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

function encolar(convId) {
  if (pendientes.has(convId)) clearTimeout(pendientes.get(convId));
  pendientes.set(
    convId,
    setTimeout(() => {
      pendientes.delete(convId);
      procesarConversacion(convId);
    }, DEBOUNCE_MS)
  );
}

async function procesarConversacion(convId) {
  if (procesando.has(convId)) {
    // sigue llegando o todavia procesa: reintentar despues
    encolar(convId);
    return;
  }
  if (modoConversacion(convId) === "humano") return;

  if (isRateLimited(convId)) {
    console.warn(`Rate limit alcanzado para conversación ${convId}`);
    return;
  }

  procesando.add(convId);
  await chatwootTyping(convId, "on");
  try {
    let historial = await chatwootGetHistorial(convId);

    const pendingAudio = audioTranscriptions.get(convId);
    if (pendingAudio && pendingAudio.length > 0) {
      audioTranscriptions.delete(convId);
      for (const text of pendingAudio) {
        historial.push({ role: "user", content: `[Audio del cliente]: ${text}` });
      }
    }

    // Limitar mensajes por conversación
    const userMsgCount = historial.filter(m => m.role === "user").length;
    if (userMsgCount > MAX_MSGS_PER_CONV) {
      await chatwootEnviarMensaje(convId, "Para seguir atendiéndote mejor, te derivo con una persona del equipo.");
      await ejecutarDerivarHumano({ razon: "Límite de mensajes automáticos alcanzado" }, convId);
      return;
    }

    // Truncar mensajes muy largos
    historial = historial.map(m => ({
      ...m,
      content: m.content.length > MAX_MSG_LENGTH
        ? m.content.slice(0, MAX_MSG_LENGTH) + "... (mensaje recortado)"
        : m.content
    }));

    if (modoConversacion(convId) === "humano") return;
    const respuesta = await responderConClaude(historial, convId);
    await chatwootEnviarMensaje(convId, respuesta);
  } catch (err) {
    console.error("Error procesando conversacion", convId, err);
  } finally {
    procesando.delete(convId);
    await chatwootTyping(convId, "off");
  }
}

// ── Servidor ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, model: MODEL }));

const audioReplied = new Set();

app.post("/webhook/chatwoot", (req, res) => {
  res.json({ received: true });
  try {
    const body = req.body || {};
    if (body.event !== "message_created") return;
    if (body.message_type !== "incoming") return;
    if (body.private) return;
    const convId =
      body.conversation && body.conversation.id ? body.conversation.id : null;
    if (!convId) return;
    if (modoConversacion(convId) === "humano") return;

    const attachments = body.content_attributes?.attachments || body.attachments || [];
    const hasAudio = attachments.some(a =>
      a.file_type === "audio" || (a.content_type || "").startsWith("audio/")
    );
    const hasContent = body.content && body.content.trim().length > 0;

    if (hasAudio && !hasContent) {
      if (OPENAI_API_KEY) {
        const att = attachments.find(a =>
          a.file_type === "audio" || (a.content_type || "").startsWith("audio/")
        );
        const audioUrl = att && (att.data_url || att.url);
        if (audioUrl) {
          const fullUrl = audioUrl.startsWith("http") ? audioUrl : `${CHATWOOT_URL}${audioUrl}`;
          transcribeAudio(fullUrl).then(text => {
            if (text) {
              const pending = audioTranscriptions.get(convId) || [];
              pending.push(text);
              audioTranscriptions.set(convId, pending);
              chatwootNotaPrivada(convId, `[Transcripción de audio] ${text}`);
              encolar(convId);
            }
          }).catch(err => {
            console.error("Error transcribiendo audio:", err.message);
            chatwootEnviarMensaje(convId, "No pude procesar el audio. ¿Podrías escribirme tu consulta por texto? 😊");
          });
        }
      } else {
        const key = convId + "_audio";
        if (!audioReplied.has(key)) {
          audioReplied.add(key);
          setTimeout(() => audioReplied.delete(key), 5 * 60 * 1000);
          chatwootEnviarMensaje(convId, "¡Hola! No puedo escuchar audios por ahora. ¿Podrías escribirme tu consulta por texto así te ayudo mejor? 😊");
        }
      }
      return;
    }

    encolar(convId);
  } catch (err) {
    console.error("Error webhook chatwoot:", err);
  }
});

app.post("/webhook/mercadopago", async (req, res) => {
  res.sendStatus(200); // responder rapido siempre
  try {
    const tipo =
      (req.body && req.body.type) || req.query.type || req.query.topic;
    const pagoId =
      (req.body && req.body.data && req.body.data.id) ||
      req.query["data.id"] ||
      req.query.id;
    if (tipo !== "payment" || !pagoId) return;

    const est = leerEstado();
    if (est.pagos[String(pagoId)]) return; // ya procesado (idempotencia)

    const pago = await mpConsultarPago(pagoId);
    if (!pago || pago.status !== "approved") return;

    const convId = pago.external_reference;
    if (!convId) return;

    est.pagos[String(pagoId)] = true;
    est.conversaciones[String(convId)] = { modo: "humano" };
    guardarEstado(est);

    const monto = Number(pago.transaction_amount || 0).toLocaleString("es-AR");
    if (pendientes.has(Number(convId))) {
      clearTimeout(pendientes.get(Number(convId)));
      pendientes.delete(Number(convId));
    }
    await chatwootEnviarMensaje(
      convId,
      `¡Listo! Recibimos tu seña de $${monto} y tu fecha quedó reservada 🎉 ` +
        `En breve te contacta una persona del equipo para coordinar todos los detalles. ¡Gracias!`
    );
    await chatwootNotaPrivada(
      convId,
      `[Agente IA] PAGO CONFIRMADO seña $${monto} (MP ${pagoId}). Derivado a humano.`
    );
    await chatwootCambiarEstado(convId, "open");
  } catch (err) {
    console.error("Error webhook mercadopago:", err);
  }
});

// ── API de Reservas (para el panel admin) ─────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/api/reservas", async (_req, res) => {
  try {
    res.json({ eventos: await leerEventos() });
  } catch (e) {
    console.error("Error leyendo reservas:", e);
    res.status(500).json({ error: "No se pudo leer el calendario" });
  }
});

app.post("/api/reservas", async (req, res) => {
  const { fecha, nombre, tipo, personas, notas } = req.body || {};
  if (!fecha || !nombre) return res.status(400).json({ error: "fecha y nombre son obligatorios" });
  try {
    const evento = {
      id: `${fecha}-${Date.now()}`,
      fecha: String(fecha),
      nombre: String(nombre),
      tipo: String(tipo || "otro"),
      personas: Number(personas) || 0,
      notas: String(notas || "")
    };
    const creado = await crearEvento(evento);
    res.json({ ok: true, evento: creado });
  } catch (e) {
    console.error("Error creando reserva:", e);
    res.status(500).json({ error: "No se pudo crear la reserva" });
  }
});

app.delete("/api/reservas/:id", async (req, res) => {
  try {
    await eliminarEvento(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    if (e.message === "not_found") return res.status(404).json({ error: "evento no encontrado" });
    console.error("Error eliminando reserva:", e);
    res.status(500).json({ error: "No se pudo eliminar la reserva" });
  }
});

// Estado del sistema: qué integraciones están configuradas
app.get("/api/status", (_req, res) => {
  res.json({
    bot: !!process.env.ANTHROPIC_API_KEY,
    chatwoot: !!CHATWOOT_API_TOKEN,
    mercadopago: !!MP_ACCESS_TOKEN,
    public_url: !!PUBLIC_URL,
    google_calendar: !!GOOGLE_CALENDAR_ID,
    model: MODEL,
    debounce_ms: DEBOUNCE_MS
  });
});

// Negocio (lectura para el panel)
app.get("/api/negocio", (_req, res) => {
  try {
    res.json(cargarNegocio());
  } catch (e) {
    res.status(500).json({ error: "no se pudo leer negocio.json" });
  }
});

// Conversaciones recientes desde Chatwoot (para la bandeja del dashboard)
app.get("/api/messages/recent", async (_req, res) => {
  if (!CHATWOOT_API_TOKEN) return res.json({ ok: false, configured: false, conversaciones: [] });
  try {
    const r = await fetch(`${chatwootBase()}/conversations?status=open&page=1`, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    if (!r.ok) return res.json({ ok: false, configured: true, conversaciones: [] });
    const data = await r.json();
    const convs = ((data.data && data.data.payload) || []).slice(0, 8).map((c) => {
      const meta = c.meta || {};
      const sender = meta.sender || {};
      const last = (c.messages && c.messages[c.messages.length - 1]) || {};
      return {
        id: c.id,
        nombre: sender.name || "Cliente",
        iniciales: (sender.name || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase(),
        canal: (meta.channel || "web").replace("Channel::", "").toLowerCase(),
        ultimo: (last.content || "").slice(0, 80),
        hora: last.created_at ? new Date(last.created_at * 1000).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "",
        no_leidos: c.unread_count || 0,
        modo: modoConversacion(c.id)
      };
    });
    res.json({ ok: true, configured: true, conversaciones: convs });
  } catch (e) {
    console.error("Error leyendo conversaciones:", e);
    res.json({ ok: false, configured: true, conversaciones: [] });
  }
});

// ── Disponibilidad pública (Google Calendar o reservas locales) ───────────
app.get("/api/disponibilidad", async (_req, res) => {
  try {
    const eventos = await leerEventos();
    const reservadas = new Set(eventos.map((e) => e.fecha));
    const hoy = new Date();
    const dias = [];
    for (let i = 0; i < 60; i++) {
      const d = new Date(hoy);
      d.setDate(d.getDate() + i);
      const str = d.toISOString().slice(0, 10);
      dias.push({ fecha: str, reservado: reservadas.has(str) });
    }
    res.json({ dias, fuente: googleCalendarActivo() ? "google" : "local" });
  } catch (e) {
    console.error("Error disponibilidad:", e);
    res.status(500).json({ error: "No se pudo leer disponibilidad" });
  }
});

app.listen(PORT, () =>
  console.log(`Agente IA en puerto ${PORT} (modelo: ${MODEL})`)
);
