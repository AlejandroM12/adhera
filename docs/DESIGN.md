# Design system de Adhera

Guía corta para mantener la interfaz consistente. Los tokens viven en `apps/web/src/app/globals.css` y los componentes base en `apps/web/src/components/ui`.

## Principios

1. **Primero lo que se necesita para trabajar.** Estado, responsable y acciones arriba; el detalle después.
2. **Una acción principal por vista.** El resto, en variantes secundarias (`outline`, `ghost`, `link`).
3. **El color comunica estado, no decora.** Sin gradientes, sin sombras marcadas, sin emojis ni gráficos de relleno.
4. **Nada que sugiera una decisión.** Adhera prepara entrevistas: no aprueba, rechaza ni puntúa afiliaciones.

## Color

| Token | Uso |
| --- | --- |
| `brand-*` (azul profundo) | Marca, navegación, botón principal (`brand-800`), títulos y links (`brand-700`). |
| `petrol-*` (verde petróleo) | Acento: pestaña activa, progreso, acción del interesado (`petrol-600`), confirmaciones. |
| `slate-*` | Texto (`900` principal, `600`/`700` secundario, `500` mínimo sobre blanco), bordes (`200`/`300`). |
| `canvas` | Fondo de página (`#f5f7fa`). Las superficies son blancas con borde `slate-200`. |
| `amber` | Atención: pendiente de revisión, datos faltantes, "a verificar". |
| `rose` | Error, contradicción o conversación abandonada. |

Los estados usan fondo `-50`, texto `-800/-900` y borde `-200`. No usar texto `slate-400` sobre blanco: no alcanza contraste AA.

## Tipografía

Public Sans (servida por `next/font`). Escala: título de página `text-xl`/`sm:text-2xl` semibold; título de tarjeta `15px` semibold; cuerpo `text-sm`; etiquetas y metadatos `text-xs`/`13px`. En el chat del interesado, `15px` como mínimo y `16px` en los campos (evita el zoom automático en iOS).

## Forma y espacio

- Radios: `rounded-md` en controles, `rounded-lg` en tarjetas. Nada más redondo que eso, salvo avatares.
- Bordes en lugar de sombras.
- Espaciado de 4 px: `gap-2`/`gap-3` entre elementos, `p-4`/`p-5` en tarjetas, `mb-3`/`mb-5` entre bloques.

## Componentes

- **Button**: `default` (principal), `accent` (avanzar en el cuestionario), `outline`, `ghost`, `destructive`, `link`. Por defecto es `type="button"`; en formularios hay que indicar `type="submit"`. Deshabilitado = gris sólido, no transparencia.
- **Input / Select / Textarea**: alto `h-9` en el panel y `h-12` en el chat. Foco con anillo `petrol`. Con error: `aria-invalid` y mensaje con `role="alert"` asociado por `aria-describedby`.
- **Badge**: estados con `STATUS_STYLE` / `INTERVIEW_STYLE` de `lib/labels.ts`.
- **Tabs**: navegables con flechas; el contador va dentro de la pestaña.
- **EmptyState / ErrorState / LoadingState**: siempre con un texto que diga qué pasó y qué hacer.

## Accesibilidad

- Foco visible global (`:focus-visible`) en links y botones; los campos usan su anillo.
- Objetivos táctiles de 44 px como mínimo en el chat (opciones, enviar, confirmar).
- Íconos decorativos con `aria-hidden`; botones de solo ícono con `aria-label`.
- Enlace "Saltar al contenido" en el panel y `aria-current="page"` en la navegación.
- Se respeta `prefers-reduced-motion`.

## Patrones

- **Ficha del interesado**: aviso de preentrevista → "Para revisar" (neutro si está vacío) → índice de secciones → secciones → salud por persona. La acción "Agregar observación" es un ícono por fila, siempre visible en gris (contraste 4,8:1) y alcanzable con Tab; se resalta al pasar el mouse.
- **Correcciones**: badge "Corregido" y una línea "Antes: …" con la fecha. La declaración original nunca se edita.
- **Chat**: una pregunta por paso, una acción principal (enviar o elegir). El progreso muestra la sección actual y "N de M". Los errores de validación aparecen junto al campo; los de conexión, en el chat con "Reintentar".
