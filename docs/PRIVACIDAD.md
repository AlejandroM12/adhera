# Datos sensibles: estado actual y requisitos antes de un uso real

> Lista de control técnica. **No es asesoramiento legal**: antes de recibir datos reales se necesita revisión
> de un profesional en protección de datos personales y en la normativa de medicina prepaga.

## Situación actual (demo)

- Sólo **datos ficticios**: el simulador y `/demo` lo piden al empezar, el aviso queda visible durante toda la conversación y el
  PDF lleva la marca "DATOS FICTICIOS". Igual, un visitante podría escribir datos reales: por eso la demo pública
  no debe difundirse como servicio para interesados reales.
- La preentrevista **no es una declaración jurada** y no toma decisiones: sin puntajes, sin rechazo automático,
  sin clasificación por costo esperado ni inferencias sobre enfermedades no declaradas.
- Panel y API administrativa con sesión de asesor (cookie HttpOnly, Secure en producción). El PDF sólo se descarga
  con sesión, sin caché y queda registrado (`PDF_EXPORTED`).
- Los registros (logs) no contienen respuestas ni teléfonos; la actividad guarda sólo claves de preguntas.
- Cada conversación pública sólo se abre con su propio token; límites anti-abuso por visitante y globales.

## Antes de habilitar datos reales (Argentina)

| Tema | Qué hace falta |
|---|---|
| Ley 25.326 — datos sensibles (salud) | Consentimiento **expreso y por escrito** con finalidad, destinatarios y derechos; revisión legal del texto (hoy es de demo, versión `preentrevista-v2-2026-11`) |
| Registro | Inscripción de la base de datos ante la AAIP |
| Derechos de los titulares | Procedimiento de acceso, rectificación y supresión (con plazos legales) |
| Ley 26.682 (prepagas) | Validar el circuito con la declaración jurada formal; las preexistencias no pueden ser motivo de rechazo |
| Cifrado | Cifrado de campos sensibles en la aplicación (además del cifrado en reposo del proveedor) y gestión de claves |
| Acceso | Roles (cada asesor ve sus solicitudes), registro de quién abre cada ficha, segundo factor en el login |
| Proveedores | Acuerdos de tratamiento con Render y Neon; los servidores están en EE. UU. (transferencia internacional) |
| WhatsApp | No recibir datos de salud por WhatsApp sin revisión legal y acuerdos con Meta |
| Retención | Ver política propuesta abajo |
| Incidentes | Procedimiento de notificación y respaldo/restauración probados |

## Política de retención (PROPUESTA, pendiente de aprobación)

No hay borrado automático implementado. Propuesta para discutir antes de usar datos reales:

1. **Demo pública:** conversaciones de `/demo` sin enviar → eliminar a los 7 días; enviadas → a los 30 días.
2. **Uso real:** preentrevistas que no avanzan a afiliación → eliminar o anonimizar a los N meses (definir con legales);
   las que avanzan → conservar según la normativa aplicable a la declaración jurada.
3. **Supresión a pedido** del titular dentro del plazo legal, con registro de la acción.
4. Respaldos con el mismo plazo de vida que los datos.
5. Implementación prevista: tarea programada que marque y elimine con registro de auditoría, desactivada por defecto
   y con vista previa de lo que se borraría.
