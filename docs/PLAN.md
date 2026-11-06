# Plan de ejecución — primero una demo real

## Hito 1 — Vertical slice (prioridad máxima)
- [ ] Monorepo y scripts `dev`, `lint`, `typecheck`, `test`, `db:migrate`, `db:seed`.
- [ ] PostgreSQL en Docker Compose y Prisma funcionando.
- [ ] Cuestionario demo publicado con 7 preguntas no médicas.
- [ ] API de iniciar sesión, responder, retomar y finalizar.
- [ ] `/simulador` usable y responsive.
- [ ] `/solicitudes` mostrando la solicitud recién completada.
- [ ] `/solicitudes/[id]` con respuestas persistidas.
**Demo de aceptación:** crear solicitud desde cero y verla en ficha sin tocar DB manualmente.

## Hito 2 — Gestión comercial
- [ ] Estados, asignación, notas, timeline.
- [ ] Agenda y edición de entrevistas.
- [ ] Filtros, búsqueda, KPIs derivados de DB.
- [ ] Estados vacíos, carga y errores.

## Hito 3 — Configuración y pulido
- [ ] Editor de borrador de cuestionario y publicación de versión.
- [ ] Validación de ramificaciones, compatibilidad con sesiones activas.
- [ ] Seed de 12 casos ficticios; UX desktop/mobile.
- [ ] Tests de motor y prueba E2E principal.
- [ ] README con pasos reproducibles y guion de demo de 5 minutos.

## Checklist de finalización
- [ ] `docker compose up -d` arranca DB.
- [ ] Migraciones y seed pasan en base limpia.
- [ ] API y web arrancan con comandos documentados.
- [ ] Flujo E2E real funciona, incluido refresh a mitad de sesión.
- [ ] No hay endpoints privados expuestos sin auth.
- [ ] No hay credenciales reales ni datos sensibles.
- [ ] `lint`, `typecheck`, `test` y `build` pasan (o bloqueos documentados).
- [ ] No se hizo commit ni deploy sin autorización.

## Límites de tiempo
No dedicar una fase entera a planificar. Implementar el hito 1 antes de añadir nuevas features. Si una decisión menor bloquea, elegir el camino simple, documentar en 1 línea y continuar.
