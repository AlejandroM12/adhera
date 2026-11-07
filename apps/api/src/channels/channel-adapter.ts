/**
 * Contrato entre un canal de mensajería y el motor conversacional.
 * El canal sólo transporta mensajes; el motor decide la siguiente pregunta.
 * Implementaciones: SimulatorAdapter (web) y WhatsAppCloudAdapter (WhatsApp Cloud API).
 */
export interface InboundMessage {
  sessionId: string;
  /** Paso respondido (`clave` o `clave#integrante`). */
  questionKey: string;
  value: unknown;
  requestId: string;
  /** Elección ante una respuesta ambigua (índice de la opción) o 'reject' para volver a escribir. */
  confirm?: number | 'reject';
  /** Corrección de una respuesta anterior (antes de confirmar la revisión final). */
  correction?: boolean;
}

export interface OutboundQuestion {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: { value: string; label: string }[];
  allowUnknown?: boolean;
  allowPreferNot?: boolean;
  otherLabel?: string;
}

export interface OutboundMessage {
  sessionId: string;
  kind: 'question' | 'validation_error' | 'ready_to_complete' | 'completed';
  question?: OutboundQuestion | null;
  /** Avance para mostrar "Pregunta N de M" cuando el canal lo permite. */
  progress?: { answered: number; total: number };
  text?: string;
}

export interface ChannelAdapter {
  readonly channel: string;
  /** Convierte el payload propio del canal en un mensaje entrante normalizado. */
  normalizeInbound(sessionId: string, raw: unknown): InboundMessage;
  /** Recibe un mensaje ya normalizado (punto de entrada para webhooks). */
  receiveMessage(message: InboundMessage): Promise<void>;
  /** Envía un mensaje saliente al interesado. */
  sendMessage(message: OutboundMessage): Promise<void>;
  /** Confirma la recepción al proveedor (no-op en el simulador). */
  acknowledge(requestId: string): Promise<void>;
}
