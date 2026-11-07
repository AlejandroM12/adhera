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
`render.yaml` usa **sólo el plan free** de Render: dos servicios web, sin bases, workers, discos,
servicios privados ni `preDeployCommand` (todo eso es pago). No debería pedir tarjeta para crearlo.

| Servicio | Plan | Costo aprox. | Limitaciones |
|---|---|---|---|
| Neon | Free | USD 0 | ~0,5 GB por proyecto y horas de cómputo mensuales limitadas; la base se suspende sin uso (arranca en ~1 s). |
| Render (API) | Free | USD 0 | 512 MB de RAM y CPU compartida. Se duerme tras ~15 min sin tráfico: la primera petición tarda 30–60 s y un webhook puede fallar mientras despierta (ver limitaciones). |
| Render (web) | Free | USD 0 | Mismas condiciones: la primera visita tras inactividad tarda. |
| Render (opcional) | Starter | ~USD 7/mes por servicio | Siempre activo. Sólo si más adelante decidís pagar (cambiar `plan: free` → `starter`). |
| WhatsApp Cloud API | — | USD 0 en esta demo | Sólo respondemos dentro de la ventana de 24 h (mensajes de servicio, sin plantillas). Ver docs/WHATSAPP.md. |

**Limitaciones del plan free de Render** (verificá las condiciones vigentes):
- Horas de instancia gratuitas mensuales compartidas por todo el workspace (~750 h). Dos servicios despiertos todo el mes
  superarían ese total; como se duermen sin tráfico, en una demo normalmente alcanza. Si se agotan, se suspenden hasta el mes siguiente.
- Minutos de build mensuales limitados: `autoDeploy` está apagado para no compilar en cada push.
- Sin `preDeployCommand`: las migraciones corren al final del build (ver paso 3). Sin shell ni disco persistente.
- Los servicios pueden reiniciarse en cualquier momento: los límites anti-abuso en memoria se reinician con ellos.
- **WhatsApp con la API dormida:** si un webhook llega mientras la API arranca, puede fallar o demorarse. Meta reintenta
  las entregas fallidas durante un tiempo, pero **no hay garantía** de que todos los mensajes se procesen ni de cuándo:
  un mensaje puede llegar tarde o perderse, y el interesado tendría que volver a escribir (o usar `CONTINUAR`).
  Es una limitación del plan gratuito; con una instancia siempre activa (plan pago) el riesgo baja mucho.
  Para una prueba en vivo, abrí `https://<api>/health` un minuto antes para despertarla.

## Paso a paso

### 1. Repositorio (lo hacés vos)
1. El proyecto está versionado en el repositorio **privado** de GitHub `alejandrom12/adhera` (rama `main`).
2. Verificá que **no** se suban `apps/api/.env` ni otros `.env` (están en `.gitignore`).

### 2. Neon
1. Creá una cuenta en neon.tech y un proyecto nuevo `adhera` (región sugerida: AWS US East / N. Virginia, cerca de Render "Virginia").
2. En **Connection details** copiá dos cadenas para la base `neondb` (o creá `adhera`):
   - **Pooled** (host con `-pooler`) → `DATABASE_URL`, agregando `?sslmode=require&pgbouncer=true&connect_timeout=15`.
   - **Direct** (sin `-pooler`) → `DIRECT_URL`, con `?sslmode=require&connect_timeout=15`.
3. No importes ningún dump local: las migraciones y el seed crean todo en el primer deploy.

### 3. Render (Blueprint)
1. En Render: **New → Blueprint**, conectá el repositorio. Render lee `render.yaml` y propone dos servicios:
   `adhera-api` y `adhera-web`, ambos en plan **Free**. Si Render muestra un plan pago o pide tarjeta, revisá que
   el Blueprint lea la última versión de `render.yaml` (rama `main`).
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

3. **Apply**. El build de la API instala, compila y aplica migraciones con `prisma migrate deploy`
   (usa `DIRECT_URL`; sólo aplica migraciones pendientes, nunca borra ni resetea; si falla, el build falla y
   sigue activo el deploy anterior). Después corre el seed con `SEED_IF_EMPTY=true`: **sólo en el primer deploy**
   (base nueva, sin usuarios, cuestionarios ni solicitudes) crea tu administrador, el cuestionario y
   (si `SEED_DEMO_DATA=true`) casos ficticios. En los builds siguientes el seed no escribe nada. Nunca
   sobrescribe registros existentes; si la base tiene datos pero no usuarios, sólo crea el administrador.
4. Si Render asignó URLs distintas (por ejemplo con sufijo), corregí `WEB_ORIGIN` y `API_URL` y redeployá.
   `API_URL` se fija al compilar el panel: después de cambiarla usá **Manual Deploy → Clear build cache & deploy** en `adhera-web`.

### 4. Verificación
1. `https://<api>/health` → `{"status":"ok","db":"ok","env":"production",...}`.
2. `https://<web>/login` → ingresá con `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Las credenciales demo no existen en producción.
3. `https://<web>/demo` (sin iniciar sesión) → completá una conversación ficticia y verificá que aparece en `/solicitudes`.

### 5. WhatsApp
Seguí `docs/WHATSAPP.md`. Al final: cargar las 3 variables de Meta, `WHATSAPP_ENABLED=true`, redeploy de la API
y configurar el webhook en Meta.

### 6. Preentrevista de salud (v2)
Seguí "Publicar la v2 de forma segura" en `docs/PREENTREVISTA.md`: probar la migración en una rama de Neon,
deploy manual de la API y del panel, importar la plantilla como borrador y publicarla.

## Seguridad aplicada

- Dashboard y endpoints administrativos exigen sesión (cookie HttpOnly firmada, Secure en producción, 8 h).
- Demo pública `/demo` (y `/simulador`): sin login, usa los mismos endpoints `/sessions` y el mismo motor; cada sesión sólo se abre con su propio token.
- Límites anti-abuso del simulador: conversaciones nuevas por visitante y por hora (`SIMULATOR_STARTS_PER_HOUR`, 30),
  tope global por hora (`SIMULATOR_STARTS_PER_HOUR_GLOBAL`, 300) y hasta 300 respuestas cada 10 min por conversación (la preentrevista con grupo familiar es larga).
  Se puede apagar con `SIMULATOR_ENABLED=false`.
- IP del visitante: el panel reenvía la IP original a la API con la clave compartida `PROXY_SECRET`
  (Render la genera en `adhera-api` y `adhera-web` la copia). La API ignora esa IP si la clave no coincide.
  Sin `PROXY_SECRET`, todos los visitantes comparten un único límite por IP (sigue activo el tope global) y la API lo avisa en el log.
- Login con límite de intentos fallidos (10 cada 15 min por email+IP del visitante).
- Webhook: firma `X-Hub-Signature-256` verificada sobre el cuerpo crudo, deduplicación por id de mensaje, límite por contacto, sólo acepta el `WHATSAPP_PHONE_NUMBER_ID` configurado.
- Cada conversación se identifica por remitente + número receptor; el token del simulador sólo abre su propia sesión.
- Registros sin contenido personal: sólo conteos, códigos de error e ids internos (ni teléfonos ni respuestas).
- Cabeceras: HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Sin secretos en el repositorio: todo se carga en Render. `.env.example` sólo tiene valores locales de demo.

## Limitaciones conocidas

- Rate limit y mutex en memoria: correctos con **una** instancia de la API (no escalar horizontalmente sin moverlos a un almacenamiento compartido).
- La IP del visitante la toma el panel de `cf-connecting-ip`: Render recibe todo el tráfico a través de Cloudflare
  (respuestas con `Server: cloudflare` y `CF-RAY`), que reemplaza ese header con la IP real, así que el visitante no puede imponerla.
  Si faltara, se usa el último valor de `x-forwarded-for` (lo agrega el proxy, no el visitante); en ese caso varios
  visitantes podrían compartir límite. El tope global por hora protege la base en cualquier caso.
- No hay pantalla para cambiar la contraseña del administrador: para rotarla, eliminá el usuario en Neon (SQL Editor) y redeployá con la nueva `ADMIN_PASSWORD`.
- Antes de usar datos reales: revisión legal de consentimiento, retención, acceso por rol, cifrado y proveedores (ver docs/RFC.md).
