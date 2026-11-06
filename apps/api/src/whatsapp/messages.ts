/** Textos del asistente por WhatsApp. No responde consultas ni toma decisiones de afiliación. */

export const CONSENT_YES = 'consent_yes';
export const CONSENT_NO = 'consent_no';

export const MSG = {
  welcome:
    '¡Hola! Soy el asistente de preafiliación de *Adhera* (demo). Te haré unas preguntas breves para que un asesor pueda contactarte.\n\n' +
    '• Es una demostración: usá sólo datos ficticios.\n' +
    '• No envíes datos médicos, documentos ni fotos.\n' +
    '• Guardamos tus respuestas para que las revise un asesor.\n\n' +
    'En cualquier momento: ASESOR para hablar con una persona, BAJA para no recibir más mensajes.\n\n' +
    '¿Aceptás continuar?',
  consentDeclined: 'Entendido, no guardamos tus datos. Si cambiás de opinión, escribinos cuando quieras.',
  intro: '¡Gracias! Empecemos.',
  completed:
    '¡Gracias! Recibimos tu solicitud. Un asesor la revisará y te contactará por el canal que elegiste.\n\n' +
    'Este asistente no toma decisiones sobre afiliación ni coberturas: eso lo conversás con el asesor.',
  alreadyCompleted:
    'Ya recibimos tu solicitud y un asesor la está revisando. Escribí NUEVA para iniciar otra o ASESOR para hablar con una persona.',
  handoff:
    'Listo, avisamos a un asesor para que te contacte. Este asistente no puede responder consultas sobre coberturas, precios ni afiliación.\n\n' +
    'Si mientras tanto querés seguir con el cuestionario, escribí CONTINUAR.',
  handoffReminder: 'Un asesor ya fue avisado y te va a contactar. Si querés seguir con el cuestionario, escribí CONTINUAR.',
  unsupported:
    'Por ahora sólo puedo leer mensajes de texto y botones. Por favor, no envíes fotos, audios ni documentos.',
  optedOut: 'Listo, no te enviaremos más mensajes. Si querés volver, escribí ALTA.',
  help:
    'Te hago unas preguntas de preafiliación (datos ficticios). Comandos: ASESOR (hablar con una persona), NUEVA (empezar otra solicitud), OMITIR (saltear una pregunta opcional), BAJA (no recibir más mensajes).',
  invalidSuffix: '\n\nSi preferís, escribí ASESOR y te contacta una persona.',
  cannotSkip: 'Esta pregunta es obligatoria.',
  restarted: 'Empecemos una nueva solicitud.',
} as const;
