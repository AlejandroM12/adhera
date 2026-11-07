# Preentrevista de salud (cuestionario v2)

Prepara la entrevista humana con información estructurada y validada. **No es una declaración jurada**,
no diagnostica, no interpreta clínicamente, no puntúa, no clasifica por costo y no rechaza a nadie.
En esta etapa se usa **sólo con datos ficticios**.

## Estructura

| # | Sección | Contenido |
|---|---|---|
| 1 | Identificación y contacto | Nombre, apellido, DNI (o "No tengo DNI argentino"), fecha de nacimiento, sexo según DNI, teléfono, correo, canal y franja de contacto |
| 2 | Domicilio | Provincia (24) → localidad o barrio (catálogo oficial, búsqueda tolerante a errores), calle, piso/depto., código postal |
| 3 | Cobertura y grupo familiar | Cobertura actual, situación laboral, derivación de aportes, tipo de plan, integrantes adicionales → **por integrante**: vínculo, nombre, DNI, fecha de nacimiento, sexo según DNI |
| 4–9 | Salud, **por persona** (incluida la titular) | Antecedentes declarados; crónicas, internaciones (5 años) y cirugías; medicación y tratamientos; embarazo y controles; antecedentes familiares conocidos; estudios/tratamientos pendientes |
| 10 | Revisión y consentimiento | Resumen por sección y persona con "Corregir", confirmación y consentimiento de preentrevista |

- Cada "Sí" abre el detalle; un "No", "No sé" o "Prefiero no responder" no lo abre.
- **Embarazo:** se pregunta a las personas de 10 a 60 años según la fecha de nacimiento declarada, con la opción
  "No corresponde". **No depende del sexo del DNI.**
- **"No sé" y "Prefiero no responder"** son respuestas válidas (no errores). La ficha los muestra como datos faltantes.
- **"Otro"** (vínculo, situación laboral, tratamientos…) se escribe con palabras propias y queda "a verificar".

## Validaciones y confirmaciones

| Dato | Regla |
|---|---|
| DNI | 7 u 8 dígitos (acepta puntos y espacios) |
| Fechas | `DD/MM/AAAA`, `D-M-AA`, `AAAA-MM-DD` o "3 de mayo de 1985". Año de 2 dígitos: sólo pregunta si los dos siglos son posibles. Nacimiento no futuro y ≤ 110 años; titular mayor de edad; fecha probable de parto futura |
| Teléfono | Argentina, con código de área (`libphonenumber-js`); se guarda en formato +54… |
| Correo | Sintaxis válida; si el dominio parece mal escrito (`gmial.com`), propone la corrección |
| Localidad | Catálogo Georef AR (INDEC, datos.gob.ar, CC BY 4.0) guardado en el código. Sin tildes, abreviaturas (gral., sta., cdad.) y errores de tipeo. Coincidencia exacta: se acepta; parecida: "¿Cuál de estas es la tuya?"; inexistente: se registra "a verificar" |
| Opciones escritas | Si el texto coincide con una opción se acepta; si es parecido, se confirma; si no, se ofrece "Otro" |

Cada respuesta guarda **el texto original**, **el valor normalizado** y, si hubo, **la confirmación** elegida.
Las **correcciones** de la revisión final crean un registro en `AnswerRevision` con el valor anterior (no se pisa).

## Ficha del asesor y PDF

- **Para revisar en la entrevista:** datos faltantes, contradicciones **explícitas** entre datos declarados
  (hijo/a mayor que la titular, padre/madre menor, DNI repetido, semanas de embarazo incoherentes con la fecha
  probable de parto) y aclaraciones pendientes (localidades no encontradas, respuestas "Otro" y las que abre el asesor).
- Secciones generales y **una tarjeta por persona** con su declaración de salud por separado.
- **Observaciones del asesor** por respuesta (observación o aclaración pendiente, que se puede marcar resuelta).
  Se guardan aparte (`Note`), nunca modifican la declaración.
- **PDF A4** (`GET /applications/:id/pdf`, sólo asesores, sin caché, queda registrado en la actividad):
  aviso de preentrevista, marca "DATOS FICTICIOS", una página por persona, renglones para observaciones después de
  cada sección y hoja final de notas de la entrevista.

## Simulador y demo pública

`/demo` y `/simulador` usan el mismo motor y los mismos endpoints. La v2 agrega selección múltiple, autocompletado
de localidades, "No sé" / "Prefiero no responder", confirmaciones, revisión con "Corregir" y el botón
**"Completar con datos ficticios"** (llega hasta la revisión; la confirmación y el consentimiento los da quien presenta).

## Modelo de datos (migración `20261107180000_health_preinterview_v2`, aditiva)

- `QuestionType`: + `multi_choice`, `dni`, `phone`, `email`, `locality`.
- `Question.metaJson` (sección, repetición por integrante, opciones especiales, catálogo).
- `QuestionnaireVersion.title`, `templateKey`.
- `Answer.instance` (`""` general, `m0` titular, `m1…` integrantes) y `confirmationJson`; único por (sesión, pregunta, integrante).
- `AnswerRevision` (historial de correcciones).
- `ConversationSession.pendingJson`, `reviewConfirmedAt`, `consentAt`, `consentVersion`.
- `Note.kind` (`NOTE` / `OBSERVATION` / `CLARIFICATION`), `questionKey`, `resolvedAt`, `resolvedById`.

Las solicitudes y versiones anteriores no cambian: la v1 se sigue mostrando con su ficha original.

## Publicar la v2 de forma segura

1. **Código:** commit y push aprobados.
2. **Probar la migración sobre una copia de producción:** en Neon, *Branches → Create branch* desde `main`
   (por ejemplo `prueba-v2`). Con la cadena **directa** de esa rama, en tu máquina:
   `DIRECT_URL=<rama> DATABASE_URL=<rama> pnpm --filter @adhera/api exec prisma migrate deploy`.
   Verificá que las solicitudes siguen iguales. La rama sirve además como punto de restauración.
3. **Render:** *Manual Deploy* de `adhera-api` (el build aplica la migración en Neon; el seed se omite porque la base
   ya tiene usuarios) y después de `adhera-web`.
4. **Panel → Cuestionarios → "Importar como borrador"**, revisá y **Publicar**. Opcional: "Crear 4 casos ficticios de ejemplo"
   (ids fijos: no duplica ni modifica nada).
5. **Verificar:** `/demo` con "Completar con datos ficticios", la ficha nueva y el PDF.

**Volver atrás:**
- *Antes del paso 4* (v2 sin importar): la migración sólo agrega, así que el código anterior funciona con la base migrada.
  Alcanza con volver a desplegar el commit anterior.
- *Después de importar o publicar la v2*: la base ya tiene preguntas con tipos nuevos (`multi_choice`, `dni`, `phone`,
  `email`, `locality`) que el código anterior no reconoce; al leerlas fallaría (por ejemplo al iniciar una conversación
  o al abrir Cuestionarios). En ese caso, corregí hacia adelante o restaurá la base desde la rama de Neon del paso 2
  (se pierden los datos cargados después de crearla).
- Las conversaciones v2 iniciadas quedan con su versión.
