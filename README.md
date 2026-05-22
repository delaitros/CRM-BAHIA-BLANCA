# Lo de Juan — CRM Bahía Blanca

Sistema de gestión para salón de eventos y catering en Bahía Blanca. Landing page, panel admin, bot de WhatsApp con IA y calendario de disponibilidad.

## Stack

- **Frontend**: Landing page + panel admin (HTML/Tailwind/JS)
- **CRM**: Chatwoot (self-hosted) — bandeja de WhatsApp, Instagram, Facebook
- **Bot IA**: Node.js + Claude API — responde consultas, genera links de pago
- **Pagos**: MercadoPago — cobro de seña automático
- **Calendario**: Google Calendar (ICS) + Open-Meteo (clima)
- **Infra**: Docker Compose, PostgreSQL, Redis, Nginx

## Instalación rápida

```bash
git clone https://github.com/delaitros/CRM-BAHIA-BLANCA.git
cd CRM-BAHIA-BLANCA
cp .env.example .env
# Editar .env con tus claves
docker compose up -d
```

## Guía completa de deploy

Ver **[DEPLOY.md](DEPLOY.md)** para el paso a paso completo (VPS, HTTPS, Chatwoot, WhatsApp, etc.)

## Estructura

```
├── index.html              # Landing page (single-page)
├── admin/                  # Panel de administración
│   ├── login.html
│   ├── dashboard.html
│   ├── calendario.html
│   ├── configuracion.html
│   ├── inventario.html
│   └── mensajes.html
├── ai-agent/               # Bot IA (Node.js + Claude)
│   ├── server.js
│   └── negocio.json        # Precios y servicios (editable)
├── docker/
│   ├── nginx.conf
│   └── init-db.sql
├── docker-compose.yml
└── .env.example
```
