# Adhera — Demo de preafiliación

MVP demostrativo de preafiliación conversacional y gestión comercial. Todos los datos son ficticios.

## Inicio rápido con Cursor + Claude
1. Abrí esta carpeta en Cursor.
2. Si usás Claude Code, abrí la terminal de Cursor y ejecutá `claude`; pedile que lea `PROMPT_CLAUDE.md`. Alternativamente, usá Cursor Agent con modelo Claude.
3. En Cursor Agent, pegá el contenido de `PROMPT_CLAUDE.md`.
4. Claude debe implementar, ejecutar y verificar el flujo completo. Los documentos son especificaciones, no código implementado.

## Objetivo verificable
Completar una conversación en `/simulador`, abrir `/solicitudes` y consultar las respuestas persistidas en `/solicitudes/[id]`.

## Documentos
- `docs/PRD.md`: producto, alcance y criterios de aceptación.
- `docs/RFC.md`: arquitectura, seguridad y decisiones.
- `docs/DATA_API.md`: esquema y contrato HTTP.
- `docs/PLAN.md`: orden de implementación y pruebas.
- `PROMPT_CLAUDE.md`: instrucciones ejecutables para el agente.

---

## Cómo correr la demo (implementación v0.1)

Requisitos: Node 20.12+ (probado con 24), pnpm 10+ (probado con 11), Docker Desktop corriendo.

```bash
pnpm install
cp .env.example apps/api/.env      # y poné un SESSION_SECRET propio
pnpm db:up                         # PostgreSQL 16 en localhost:5433
pnpm db:deploy                     # aplica migraciones (o pnpm db:migrate en desarrollo)
pnpm db:seed                       # 3 asesores, cuestionario v1 publicado y 12 solicitudes ficticias (idempotente)
pnpm dev                           # API en :4000 (Nest watch) + web en :3000 (Next dev)
```

- Web: http://localhost:3000 → `/simulador` (público), `/login`, `/`, `/solicitudes`, `/entrevistas`, `/cuestionarios`.
- Credenciales **ficticias** de demo: `asesor@adhera.demo` / `adhera-demo` (también `martin@` y `sofia@adhera.demo`). Nunca usar en producción.
- La web reenvía `/api/*` al backend (mismo origen, cookie HttpOnly `adhera_session`).

Verificaciones:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
npx playwright install chromium    # una sola vez
pnpm test:e2e                      # entorno aislado: recrea la base `adhera_test`, compila y levanta API :4100 y web :3100
                                   # (no toca la base `adhera` ni los servidores de desarrollo; requiere Docker)
pnpm db:reset                      # base limpia + seed (borra todo lo creado)
```

Si `pnpm install` falla en Windows con `EPERM ... query_engine-windows.dll.node`, detené la API y reintentá (el proceso bloquea el binario de Prisma).

### Guion de demo (5 minutos)
1. Abrí `/simulador`, aceptá el aviso y respondé: nombre ficticio → "Familiar" → 4 integrantes (probá antes "1" para ver la validación).
2. Refrescá la página: la conversación sigue donde estaba. El ícono de enlace copia un link para retomar desde otro navegador.
3. Terminá las preguntas (si respondés "Sí" a observaciones aparece una pregunta extra) y tocá **Enviar solicitud**.
4. Ingresá como asesor: la solicitud aparece primera en `/solicitudes` como "Pendiente de revisión"; el resumen `/` actualiza los KPIs.
5. Abrí la ficha: resumen automático, respuestas originales en orden, historial. Asigná un asesor, agregá una nota y programá una entrevista (el estado cambia solo a "Entrevista programada").
6. En `/entrevistas` marcala como realizada con el próximo paso.
7. En `/cuestionarios` creá un borrador, cambiá un texto o una condición, guardá y publicá: las sesiones nuevas usan la versión nueva; las anteriores conservan la suya.

### Preentrevista de salud (v2)
- Cuestionario por secciones con datos y declaración de salud **de cada integrante**, validaciones (DNI, fechas,
  teléfono, correo, localidades del catálogo oficial), "No sé" / "Prefiero no responder" / "Otro", confirmación de
  respuestas ambiguas y revisión final con correcciones. **No es una declaración jurada** ni una evaluación.
- Ficha profesional del asesor (faltantes, contradicciones explícitas, aclaraciones, observaciones) y PDF A4.
- Se importa como borrador desde **Cuestionarios**. Detalle y publicación segura: [`docs/PREENTREVISTA.md`](docs/PREENTREVISTA.md).
  Datos sensibles y retención: [`docs/PRIVACIDAD.md`](docs/PRIVACIDAD.md).

### Demo pública `/demo`
- Simulador conversacional para mostrar a interesados, **sin login**, identificado como simulador y con aviso de datos ficticios.
  Usa el mismo componente y los mismos endpoints que `/simulador` (sin enlace al panel). Las solicitudes llegan al panel del asesor.
- Límites: 30 conversaciones nuevas por visitante y por hora, 300 en total por hora, 300 respuestas cada 10 min por conversación.

### WhatsApp y despliegue público
- **WhatsApp Cloud API:** `WhatsAppCloudAdapter` sobre el mismo motor conversacional (`apps/api/src/whatsapp`). Webhook firmado en `/webhooks/whatsapp`, consentimiento, derivación a asesor, deduplicación, reintentos y estados de entrega. Configuración en [`docs/WHATSAPP.md`](docs/WHATSAPP.md).
- **Despliegue:** Render (API y panel) + Neon (PostgreSQL) con `render.yaml`. Guía y costos en [`docs/DEPLOY.md`](docs/DEPLOY.md).
- Las E2E usan un Graph API falso local (`e2e/mock-graph.mjs`): nunca contactan a Meta.

### Novedades v0.2 (experiencia comercial)
- **Dashboard:** indicadores comerciales (nuevas vs. semana anterior, pendientes sin asesor, entrevistas de la semana, tasa de finalización a 30 días), lista "Para revisar" con acción **Asignarme**, próximas entrevistas, embudo comercial, conversaciones para recuperar y actividad reciente.
- **Solicitudes:** pestañas *Enviadas / En curso / Abandonadas / Todas*. Una conversación se considera **abandonada** si lleva más de 24 h sin respuestas del interesado (`apps/api/src/applications/segments.ts`); se calcula a partir de las respuestas, sin columnas extra. Asignar o anotar no la "reactiva".
- **Ficha:** perfil comercial con etiquetas profesionales ("Tipo de cobertura", "Ciudad"…), respuestas originales en su propia pestaña y gestión/seguimiento en la columna lateral.
- **Editor de cuestionarios:** sin valores internos: claves y valores de opciones se generan a partir del texto, opciones como lista editable, condiciones con casillas, mínimo/máximo para números, "Etiqueta en la ficha", vista previa, validación en vivo y descarte de borradores.
- **Modelo:** columna opcional `Question.shortLabel` (migración `question_short_label`, sólo agrega una columna). Las versiones publicadas antes usan etiquetas por defecto según la clave.
- **Seed demo:** 20 casos ficticios coherentes (pendientes, contactadas, entrevistas en días hábiles, cerradas, conversaciones activas y abandonadas). El seed no modifica registros existentes; para ver sólo los datos demo, usar una base limpia (`pnpm db:reset`, borra todo).

### Decisiones tomadas
- Componentes UI propios con el estilo de shadcn/ui (sin el CLI interactivo) sobre Tailwind 4.
- Se omitió `packages/contracts`: la validación Zod vive en la API y la web tiene tipos propios.
- Un único cuestionario; `POST /questionnaires` no se implementó (el borrador se crea con `PATCH /questionnaires/:id/draft`).
- Cuestionario demo: 8 preguntas (7 temas del PRD + la pregunta Sí/No que habilita las observaciones).
- Se acepta respuesta sólo para la pregunta actual; las respuestas guardadas no se editan.
