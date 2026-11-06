# Despliegue público de Adhera (Render + Neon)

Objetivo: panel web y API accesibles por HTTPS, base PostgreSQL gestionada y webhook de WhatsApp listo.
Todo con **datos ficticios**. No se traslada la base local ni datos reales.

## Arquitectura

```
Celular ──WhatsApp──▶ Meta Cloud API ──webhook HTTPS──▶ adhera-api (Render, NestJS) ──▶ Neon (PostgreSQL)
                                     ◀──Graph API──────┘        ▲
Navegador ──HTTPS──▶ adhera-web (Render, Next.js) ──/api/*──────┘  (proxy: la cookie queda en el dominio del panel)
```

- El navegador sólo habla con `adhera-web`; Next reenvía `/api/*` a la API. Por eso la cookie de sesión es
  HttpOnly + Secure + SameSite=Lax en el dominio del panel y no hace falta CORS para el navegador.
- Meta llama directo a `https://<api>/webhooks/whatsapp`.

## Entornos (separados por completo)

| Entorno | Base de datos | Cómo se usa |
|---|---|---|
| Desarrollo | Docker local `adhera` (puerto 5433) | `pnpm dev` con `apps/api/.env` |
| Pruebas | Docker local `adhera_test` (se recrea en cada corrida) | `pnpm test:e2e` (puertos 3100/4100, Graph API falso en 4199) |
| Público | Neon (proyecto propio) | Render, variables cargadas en el dashboard |

`APP_ENV` define el entorno lógico. Con `APP_ENV=production` la API **no arranca** si falta algo crítico:
secreto de sesión de 32+ caracteres, `WEB_ORIGIN` con `https://`, credenciales de WhatsApp (si se habilita)
y Graph API oficial.

## Costos aproximados (verificá los precios vigentes antes de contratar)

| Servicio | Plan | Costo aprox. | Limitaciones |
|---|---|---|---|
| Neon | Free | USD 0 | ~0,5 GB por proyecto; la base se suspende sin uso (arranca en ~1 s). |
| Render (API) | Free | USD 0 | Se duerme tras ~15 min sin tráfico: el primer webhook puede tardar 30–60 s (Meta reintenta). |
| Render (API) | Starter | ~USD 7/mes | Siempre activo. **Recomendado para la API** si probás WhatsApp en vivo. |
| Render (web) | Free / Starter | 0 / ~USD 7/mes | En Free, la primera visita tras inactividad tarda. |
| WhatsApp Cloud API | — | USD 0 en esta demo | Sólo respondemos dentro de la ventana de 24 h (mensajes de servicio, sin plantillas). Ver docs/WHATSAPP.md. |

## Paso a paso

### 1. Repositorio (lo hacés vos)
1. Inicializá git y subí el proyecto a un repositorio **privado** de GitHub (no hay commits hechos por Claude).
2. Verificá que **no** se suban `apps/api/.env` ni otros `.env` (están en `.gitignore`).

### 2. Neon
1. Creá una cuenta en neon.tech y un proyecto nuevo `adhera` (región sugerida: AWS US East / N. Virginia, cerca de Render "Virginia").
2. En **Connection details** copiá dos cadenas para la base `neondb` (o creá `adhera`):
   - **Pooled** (host con `-pooler`) → `DATABASE_URL`, agregando `?sslmode=require&pgbouncer=true&connect_timeout=15`.
   - **Direct** (sin `-pooler`) → `DIRECT_URL`, con `?sslmode=require`.
3. No importes ningún dump local: las migraciones y el seed crean todo en el primer deploy.

### 3. Render (Blueprint)
1. En Render: **New → Blueprint**, conectá el repositorio. Render lee `render.yaml` y propone dos servicios:
   `adhera-api` y `adhera-web` (plan Starter; podés cambiar a Free).
2. Completá las variables marcadas como `sync: false`:

   **adhera-api**
   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | cadena pooled de Neon (paso 2) |
   | `DIRECT_URL` | cadena directa de Neon |
   | `WEB_ORIGIN` | `https://adhera-web.onrender.com` (la URL real del panel) |
   | `ADMIN_EMAIL` | tu email de administrador |
   | `ADMIN_PASSWORD` | contraseña nueva de 12+ caracteres (no reutilices `adhera-demo`) |
   | `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | dejar vacías por ahora |

   Se generan solos: `SESSION_SECRET` y `WHATSAPP_VERIFY_TOKEN`.

   **adhera-web**
   | Variable | Valor |
   |---|---|
   | `API_URL` | `https://adhera-api.onrender.com` (la URL real de la API) |

3. **Apply**. El build de la API instala, compila, aplica migraciones (`prisma migrate deploy`) y corre el
   seed de producción, que crea **sólo** tu administrador, el cuestionario y (si `SEED_DEMO_DATA=true`) casos ficticios.
4. Si Render asignó URLs distintas (por ejemplo con sufijo), corregí `WEB_ORIGIN` y `API_URL` y redeployá.
   `API_URL` se fija al compilar el panel: después de cambiarla usá **Manual Deploy → Clear build cache & deploy** en `adhera-web`.

### 4. Verificación
1. `https://<api>/health` → `{"status":"ok","db":"ok","env":"production",...}`.
2. `https://<web>/login` → ingresá con `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Las credenciales demo no existen en producción.
3. `https://<web>/simulador` → completá una conversación ficticia y verificá que aparece en `/solicitudes`.

### 5. WhatsApp
Seguí `docs/WHATSAPP.md`. Al final: cargar las 3 variables de Meta, `WHATSAPP_ENABLED=true`, redeploy de la API
y configurar el webhook en Meta.

## Seguridad aplicada

- Dashboard y endpoints administrativos exigen sesión (cookie HttpOnly firmada, Secure en producción, 8 h).
- Login con límite de intentos fallidos (10 cada 15 min por email+IP). Simulador limitado por IP (`SIMULATOR_STARTS_PER_HOUR`); se puede apagar con `SIMULATOR_ENABLED=false`.
- Webhook: firma `X-Hub-Signature-256` verificada sobre el cuerpo crudo, deduplicación por id de mensaje, límite por contacto, sólo acepta el `WHATSAPP_PHONE_NUMBER_ID` configurado.
- Cada conversación se identifica por remitente + número receptor; el token del simulador sólo abre su propia sesión.
- Registros sin contenido personal: sólo conteos, códigos de error e ids internos (ni teléfonos ni respuestas).
- Cabeceras: HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Sin secretos en el repositorio: todo se carga en Render. `.env.example` sólo tiene valores locales de demo.

## Limitaciones conocidas

- Rate limit y mutex en memoria: correctos con **una** instancia de la API (no escalar horizontalmente sin moverlos a un almacenamiento compartido).
- No hay pantalla para cambiar la contraseña del administrador: para rotarla, eliminá el usuario en Neon (SQL Editor) y redeployá con la nueva `ADMIN_PASSWORD`.
- Antes de usar datos reales: revisión legal de consentimiento, retención, acceso por rol, cifrado y proveedores (ver docs/RFC.md).
