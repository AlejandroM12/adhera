Actuá como un ingeniero full stack responsable de IMPLEMENTAR una demo funcional de Adhera en este repositorio usando Claude Code en la terminal de Cursor (o Cursor Agent con Claude).

1. Leé `README.md`, `docs/PRD.md`, `docs/RFC.md`, `docs/DATA_API.md` y `docs/PLAN.md` como especificación. No reescribas la documentación salvo correcciones necesarias.
2. Empezá a crear código inmediatamente. El objetivo es el HITO 1 completo, no un plan ni una maqueta estática.
3. Stack: Next.js + TypeScript + Tailwind + shadcn/ui, NestJS, PostgreSQL, Prisma; Docker Compose para DB. Usá un monorepo liviano.
4. Priorizá el camino funcional: simulador conversacional → persistencia → listado → ficha. Implementá el motor de cuestionarios con preguntas configurables y versión publicada, sin IA ni WhatsApp real.
5. Usá únicamente datos ficticios y preguntas no médicas. No incluyas marcas ajenas. Identidad neutral bajo el nombre Adhera.
6. Implementá UI profesional y responsive con navegación real, no botones falsos. Los indicadores deben provenir de la DB, no de valores hardcodeados.
7. Evitá sobreingeniería: no SaaS, multiempresa, Redis, colas, microservicios, integraciones externas ni servicios pagos.
8. Agregá autenticación demo mínima para las rutas de asesor y protección de mutaciones. Asegurá que los tokens de sesión del interesado solo permitan acceder a su propia conversación.
9. Ejecutá instalaciones, migraciones, seed y verificaciones. Corregí errores reales. Si falta Docker o algún requisito del entorno, informá el bloqueo y dejá instrucciones exactas, sin fingir que ejecutaste pruebas.
10. No hagas commits, push ni deploy sin mi autorización.
11. Cuando el Hito 1 funcione, seguí con los Hitos 2 y 3 si hay tiempo, sin pedir permiso por detalles menores.
12. Al final reportá en forma breve: funcionalidades que funcionan, comandos para correr, tests ejecutados, bloqueos y próximo paso.

CRITERIO DE ÉXITO: puedo completar una conversación ficticia en `/simulador`, refrescar y continuar, terminarla y encontrar inmediatamente esa solicitud en `/solicitudes` con sus respuestas originales en `/solicitudes/[id]`. No entregues solo una propuesta: implementá y probá.
