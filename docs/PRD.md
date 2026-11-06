# PRD — Adhera v0.1
Estado: aprobado para demo | Objetivo: primera demo funcional, no producción.

## Problema
Los asesores repiten cuestionarios previos a la entrevista. Se busca recopilar respuestas antes de la intervención humana y ofrecer una ficha consultable.

## Usuarios
- Interesado: completa un cuestionario en una experiencia tipo WhatsApp.
- Asesor: revisa solicitudes, respuestas, historial, notas y entrevistas.
- Administrador demo: edita y publica cuestionarios y revisa métricas.

## Flujo principal
1. Interesado inicia una sesión en `/simulador` y acepta aviso de uso de datos ficticios.
2. Responde preguntas del cuestionario publicado; se permite retomar con un enlace/token de demo.
3. El motor guarda cada respuesta y evento; valida tipos y ramificaciones.
4. Al completar, crea/actualiza la solicitud con estado `PENDING_REVIEW`.
5. El asesor abre `/solicitudes`, filtra y entra en `/solicitudes/[id]`.
6. Revisa datos, respuestas originales y línea de tiempo; asigna responsable, registra nota y programa entrevista.
7. Cambia estado y agrega seguimiento. No hay decisiones automáticas de elegibilidad.

## Pantallas
- `/` resumen: KPIs (nuevas, en curso, pendientes, entrevistas), actividad reciente.
- `/simulador`: chat responsive estilo mensajería, barra de progreso, reintentos y reinicio.
- `/solicitudes`: tabla con nombre ficticio, fecha, estado, asesor, búsqueda y filtros.
- `/solicitudes/[id]`: resumen, respuestas, historial, notas, entrevistas y acciones.
- `/entrevistas`: agenda/lista, creación, edición, cancelación, resultado.
- `/cuestionarios`: listado, edición de preguntas y publicación de versiones.

## Preguntas de demo
Usar únicamente preguntas no médicas: nombre ficticio, tipo de cobertura, cantidad de integrantes, ciudad, canal de contacto preferido, disponibilidad horaria y observaciones generales. No solicitar diagnósticos, embarazo, antecedentes familiares ni documentos reales.

## Requisitos funcionales
- Preguntas `text`, `single_choice`, `number`, `yes_no` y `date` (fecha opcional si agrega complejidad).
- Campos requeridos, validación y saltos condicionales simples.
- Versionado inmutable del cuestionario publicado; sesiones nuevas usan versión activa.
- Persistencia por mensaje/respuesta y continuidad después de refrescar.
- Estados: `IN_PROGRESS`, `PENDING_REVIEW`, `CONTACTED`, `INTERVIEW_SCHEDULED`, `CLOSED`.
- Notas internas y cambios de estado con timestamp.
- Asignación de asesor (usuarios demo seed).
- Entrevista: fecha/hora, estado, observaciones y próximo paso.
- Resumen determinístico a partir de respuestas, claramente identificado como resumen automático; no inferir datos ausentes.
- Seed con al menos 12 solicitudes ficticias y 1 cuestionario publicado.

## Criterios de aceptación E2E
1. Iniciar conversación, responder y finalizar sin errores.
2. Recargar a mitad de sesión y continuar sin perder respuestas.
3. Ver nueva solicitud en dashboard sin reiniciar servicios.
4. Abrir ficha y ver exactamente las respuestas originales en orden.
5. Registrar nota, asignar asesor y programar entrevista; persistir tras refrescar.
6. Editar borrador y publicar nueva versión sin alterar sesiones anteriores.
7. No mostrar datos médicos reales, marcas ajenas ni credenciales en repositorio.

## Fuera de alcance v0.1
WhatsApp API real, IA paga, transcripción/voz, multiempresa, pagos, CRM externo, notificaciones reales, importación de datos sensibles, verificación de identidad, automatización de aceptación/rechazo, despliegue público sin revisión de seguridad.

## Éxito de la demo
Un espectador entiende en menos de 5 minutos cómo un interesado completa el prefiltrado y cómo un asesor lo recibe listo para continuar.
