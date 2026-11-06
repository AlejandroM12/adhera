# Integración con WhatsApp Cloud API (Meta)

## Cómo funciona en Adhera

1. El interesado escribe al número de WhatsApp de la empresa.
2. Meta envía un webhook firmado a `POST /webhooks/whatsapp`. La API verifica la firma, descarta duplicados
   (por id de mensaje) y procesa los mensajes de cada contacto en orden.
3. Primer contacto: aviso de datos ficticios con botones **Acepto / No acepto**. Sin aceptación no se guarda nada.
4. El mismo motor del simulador decide la siguiente pregunta. Se envía con:
   botones (Sí/No o hasta 3 opciones cortas), lista (hasta 10) o texto numerado. Siempre se puede responder escribiendo.
5. Al terminar, la solicitud queda **Pendiente de revisión** en el panel, con canal WhatsApp y el número (oculto hasta que el asesor lo muestra).

| El interesado escribe | Qué pasa |
|---|---|
| `ASESOR` | Se marca "Pidió asesor" en el panel y el bot se pausa. No responde consultas ni decide sobre afiliación. |
| `CONTINUAR` | Retoma el cuestionario donde quedó (también sirve si un mensaje no llegó). |
| `NUEVA` | Inicia otra solicitud. |
| `OMITIR` | Saltea una pregunta opcional. |
| `BAJA` / `ALTA` | Deja de recibir mensajes / vuelve a habilitarlos. |
| Foto, audio, documento | Se responde que sólo se aceptan texto y botones; el archivo **no** se descarga ni se guarda. |

**Ventana de 24 h:** Adhera sólo responde a mensajes recibidos (mensajes de servicio, sin plantillas).
Si pasaron más de 24 h desde el último mensaje del interesado, no se envía nada (queda registrado como "No enviado").

**Reintentos:** errores 429/5xx y de red se reintentan 2 veces (300 ms y 1 s). Errores 4xx no se reintentan.
Cada envío queda registrado (sin contenido) con su estado: enviado → entregado → leído / no entregado, según los eventos de estado de Meta.

## Configuración en Meta for Developers (paso a paso)

> Necesitás una cuenta de Facebook personal y, en el proceso, se crea un *portfolio comercial* (Meta Business).
> Los nombres de menús pueden variar levemente según la versión de la consola de Meta.

### 1. Crear la app
1. Entrá a **developers.facebook.com** → **My Apps → Create App**.
2. Caso de uso: **Conectarte con clientes por WhatsApp** (o tipo **Business**). Asociá o creá un portfolio comercial.
3. En el panel de la app, agregá el producto **WhatsApp** (si no se agregó solo).

### 2. Número de prueba (gratis, sin registrar un número propio)
1. En **WhatsApp → API Setup** Meta te asigna un **número de prueba** y te muestra:
   - **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID` (no es el número de teléfono).
   - **WhatsApp Business Account ID** (para referencia).
   - Un **token temporal** (vence en 24 h; sirve para una primera prueba).
2. En **To / Destinatarios**, agregá **tu celular** y confirmalo con el código que te llega por WhatsApp.
   Con el número de prueba sólo podés intercambiar mensajes con hasta 5 números verificados.

### 3. App Secret
**App settings → Basic → App secret → Show** → `WHATSAPP_APP_SECRET`. Se usa para verificar la firma de cada webhook.

### 4. Token permanente (recomendado)
1. Entrá a **business.facebook.com → Configuración → Usuarios → Usuarios del sistema → Agregar** (rol administrador).
2. **Asignar activos**: la app (control total) y la cuenta de WhatsApp (administrar).
3. **Generar token** para la app, con permisos `whatsapp_business_messaging` y `whatsapp_business_management`, sin vencimiento.
4. Ese valor va en `WHATSAPP_ACCESS_TOKEN`. Guardalo sólo en Render: es un secreto.

### 5. Cargar variables y habilitar
En Render, servicio `adhera-api` → **Environment**:
`WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_ENABLED=true`.
Copiá el valor generado de `WHATSAPP_VERIFY_TOKEN` (lo necesitás en el paso siguiente). Guardá y esperá el redeploy.
Comprobá `https://<api>/health` → `"whatsapp": true`.

### 6. Webhook
1. En la app de Meta: **WhatsApp → Configuration → Webhook → Edit**.
2. **Callback URL**: `https://<api>/webhooks/whatsapp` (por ejemplo `https://adhera-api.onrender.com/webhooks/whatsapp`).
3. **Verify token**: el valor de `WHATSAPP_VERIFY_TOKEN`. → **Verify and save** (Meta hace el GET de verificación).
4. En **Webhook fields**, suscribí **`messages`** (incluye mensajes entrantes y estados de entrega).

### 7. Probar
Desde tu celular (el número verificado en el paso 2) escribí "Hola" al número de prueba. Deberías recibir el aviso
con los botones. Completá el cuestionario y abrí `https://<web>/solicitudes`: la solicitud aparece con la etiqueta WhatsApp.

## Pasar a un número propio (más adelante, requiere tu decisión)

- Se agrega en **WhatsApp Manager → Números de teléfono**, se verifica por SMS o llamada y Meta revisa el **nombre visible**.
- Ese número **no puede estar en uso** en la app de WhatsApp o WhatsApp Business al mismo tiempo.
- Para salir de los límites iniciales (y para operar con clientes reales) Meta pide **verificación del negocio**.
- Con número propio, puede ser necesario suscribir la app a la cuenta: `POST /<WABA_ID>/subscribed_apps` con el token.
- Para publicar la app (modo Live) Meta exige URL de política de privacidad y otros datos del negocio.

## Costos y restricciones de Meta (verificá la documentación vigente)

- Las respuestas a mensajes iniciados por el usuario **dentro de la ventana de 24 h** (mensajes de servicio, sin plantilla) no tienen costo.
- Los mensajes **iniciados por la empresa** fuera de esa ventana requieren **plantillas aprobadas** y se cobran por mensaje según categoría y país. Adhera **no** los envía.
- Hay límites de mensajería por número y calidad; los números nuevos o sin verificación empiezan con límites bajos.
- Políticas de WhatsApp Business: no solicitar datos sensibles (como salud) sin las bases legales correspondientes; esta demo usa sólo datos ficticios y rechaza archivos.
- Referencias: documentación de WhatsApp Cloud API y precios en developers.facebook.com/docs/whatsapp.

## Errores frecuentes

| Síntoma / código | Causa probable | Qué hacer |
|---|---|---|
| Meta no puede verificar el webhook | URL incorrecta, API dormida o `WHATSAPP_ENABLED=false` | Revisá `/health` y el verify token; reintentá. |
| No llegan respuestas y la ficha dice "No entregado (190)" | Token vencido o inválido | Generá el token permanente (paso 4). |
| `131030` | Tu número no está en la lista de destinatarios de prueba | Agregalo y verificalo en API Setup. |
| `131047` | Pasaron más de 24 h | Volvé a escribir desde el celular para reabrir la ventana. |
| `401 Firma inválida` en los logs de Render | `WHATSAPP_APP_SECRET` incorrecto | Copiá de nuevo el App Secret. |
| La primera respuesta tarda | Plan Free de Render (instancia dormida) | Usá Starter para la API o esperá: Meta reintenta. |
