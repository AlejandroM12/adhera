# Modelo de datos y API — contrato inicial

## Entidades Prisma sugeridas
- `User`: id, displayName, email, passwordHash, createdAt.
- `Questionnaire`: id, name, createdAt.
- `QuestionnaireVersion`: id, questionnaireId, version, status (`DRAFT|PUBLISHED`), publishedAt, createdAt.
- `Question`: id, versionId, key, label, type, required, order, optionsJson, conditionJson, validationJson.
- `Application`: id, displayName, status, assignedUserId?, channel (`SIMULATOR`), createdAt, updatedAt, completedAt?.
- `ConversationSession`: id, applicationId, versionId, currentQuestionKey?, status, resumeTokenHash, startedAt, completedAt?.
- `Answer`: id, sessionId, questionId, valueJson, rawText?, createdAt, updatedAt. Unique(sessionId, questionId) para reintentos idempotentes.
- `ActivityEvent`: id, applicationId, actorType, actorId?, kind, payloadJson, createdAt. Append-only.
- `Note`: id, applicationId, authorId, content, createdAt.
- `Interview`: id, applicationId, advisorId, scheduledAt, status (`SCHEDULED|COMPLETED|CANCELLED`), notes?, createdAt, updatedAt.

## API REST sugerida
- `GET /health` → estado API.
- `GET /questionnaires/active` → cuestionario publicado para simulador (sin información interna).
- `POST /sessions` → crear solicitud/sesión, devolver `sessionId` y `resumeToken`.
- `GET /sessions/:id?token=...` → estado, respuestas y próxima pregunta; usar header token en implementación si es preferible.
- `POST /sessions/:id/answers` → `{questionKey, value, requestId}`; validar token, guardar respuesta, avanzar; idempotencia por requestId.
- `POST /sessions/:id/complete` → marcar completado si no quedan requeridas.
- `GET /applications?search=&status=&page=&limit=` → listado paginado (requiere sesión asesor).
- `GET /applications/:id` → ficha y respuestas (requiere asesor).
- `PATCH /applications/:id` → estado/asignación.
- `POST /applications/:id/notes` → nota.
- `GET /applications/:id/activity` → timeline.
- `GET /interviews` / `POST /interviews` / `PATCH /interviews/:id`.
- `GET /questionnaires` / `POST /questionnaires` / `PATCH /questionnaires/:id/draft` / `POST /questionnaires/:id/publish`.
- `POST /auth/login` / `POST /auth/logout` / `GET /auth/me`.

## Respuesta de avance de sesión (ejemplo)
```json
{
  "sessionId": "demo-session-id",
  "status": "IN_PROGRESS",
  "progress": { "answered": 2, "total": 7 },
  "nextQuestion": { "key": "city", "label": "¿En qué ciudad vivís?", "type": "text", "required": true }
}
```

## Reglas
- Toda escritura valida payload con DTO/Zod y devuelve errores claros.
- El backend, no el frontend, decide qué pregunta sigue.
- El cliente no puede consultar solicitudes ajenas con el token de una sesión.
- Las mutaciones de asesor exigen autenticación de demo.
- Paginación y orden determinísticos; timestamps ISO 8601.
- Si el cuestionario cambia, una sesión conserva su `versionId`.
