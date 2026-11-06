# RFC-001 — Arquitectura de Adhera v0.1
Estado: propuesta de implementación para demo.

## Principios
Vertical slice primero; modularidad suficiente; cero servicios pagos; datos ficticios; sin infraestructura SaaS.

## Estructura sugerida
```
apps/
  web/                  # Next.js App Router, TS, Tailwind, shadcn/ui
  api/                  # NestJS, Prisma, DTOs y validación
packages/
  contracts/            # Zod schemas/types compartidos (si simplifica)
docs/
compose.yaml            # PostgreSQL local
.env.example
```
Monorepo con pnpm workspaces (o Bun si Claude verifica compatibilidad). No añadir Nx/Turborepo sin necesidad.

## Backend
Módulos: `questionnaires`, `sessions`, `applications`, `interviews`, `activity`, `demo-auth`. Separar `ConversationEngine` de `ChannelAdapter` para conectar WhatsApp después. El motor determina la siguiente pregunta según versión y reglas; el canal solo transporta mensajes. No usar LLM para decidir el flujo.

## Frontend
App Router, React Query/TanStack Query para servidor si necesario; componentes reutilizables, formularios con React Hook Form + Zod si resulta práctico. Layout con sidebar y navegación mobile. Loading/empty/error states.

## Persistencia
PostgreSQL local en Docker Compose; Prisma migrations y seed idempotente. Eventos append-only para auditoría básica. Guardar pregunta y respuesta asociadas a versión de cuestionario. No modificar respuestas originales silenciosamente.

## Auth demo
Una cuenta local de asesor sembrada y acceso protegido por sesión/cookie HttpOnly. No construir un sistema completo de roles. Credenciales ficticias documentadas en README local; jamás usar en producción. Proteger mutaciones de API, CORS y validación de entradas.

## Seguridad y privacidad
Solo datos ficticios en demo. Sin PHI/datos sensibles. No incluir números reales, DNI, diagnósticos ni antecedentes. No registrar contenidos completos en logs. Variables de entorno fuera del repositorio; `.env.example` sin secretos. Antes de operar con datos reales: revisión legal de consentimiento, minimización, retención, acceso por rol, cifrado, proveedores y seguridad.

## Diseño
Nombre Adhera. Marca neutral; paleta azul petróleo, turquesa y neutros, alto contraste. Dashboard profesional con tabla, filtros, indicadores y ficha con pestañas. Chat inspirado en mensajería, sin copiar logos o interfaces propietarias.

## Integración futura
`ChannelAdapter` con `sendMessage`, `receiveMessage`, `normalizeInbound` y `acknowledge`; implementación `SimulatorAdapter` ahora y `WhatsAppCloudAdapter` después. Configurar webhooks y plantillas solo en fase posterior. IA futura como `SummaryProvider` opcional; resumen determinístico predeterminado.

## Decisiones para rapidez
No colas, Redis, microservicios, event bus, RBAC complejo, IA, multi-tenant, analytics externos ni CI elaborada. Agregar solo si aparece una necesidad concreta.

## Calidad
Lint, typecheck, test unitario de branching y flujo E2E básico (Playwright si está disponible). Probar rutas y endpoints reales. Sin commits ni deploy automáticos.
