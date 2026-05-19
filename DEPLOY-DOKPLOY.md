# Deploy con Dokploy (panel web, sin tocar Docker a mano)

Dokploy es un panel tipo Heroku, open-source, que corre en tu propio VPS.
Maneja el deploy, SSL y dominios automáticamente.

## 1. Conseguir un VPS

Hetzner CX22 (~€4.51/mes) o similar. Anotá la IP y entrá por SSH.

## 2. Instalar Dokploy (1 comando, en el VPS)

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Abrí `http://IP_DEL_VPS:3000` y creá el usuario admin de Dokploy.

## 3. Crear el proyecto

1. En Dokploy: **Create Project → Compose**.
2. Conectá este repositorio de GitHub (o pegá el `docker-compose.yml`).
3. En **Environment**, cargá las variables (las mismas del `.env`):
   - `POSTGRES_PASSWORD`
   - `SECRET_KEY_BASE`
   - `ANTHROPIC_API_KEY`
   - `ANTHROPIC_MODEL` (opcional)
   - `CHATWOOT_API_TOKEN` (lo completás después del paso 3 de QUICK-START)
4. **Deploy**.

## 4. Dominio y HTTPS

En Dokploy → tu servicio `nginx` → **Domains**: agregá tu dominio.
Dokploy saca el certificado SSL (Let's Encrypt) solo.

## 5. Pasos manuales restantes

Seguí **QUICK-START.md** Parte B (Chatwoot, webhook, canales de Meta).

---

Ventaja: actualizar el sistema es un click en **Redeploy**. Logs, reinicios
y variables se manejan desde el panel, sin SSH ni comandos.
