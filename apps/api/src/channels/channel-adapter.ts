/**
 * Contrato entre un canal de mensajería y el motor conversacional.
 * El canal sólo transporta mensajes; el motor decide la siguiente pregunta.
 * Implementaciones: SimulatorAdapter (web) y WhatsAppCloudAdapter (WhatsApp Cloud API).
 */
export interface InboundMessage {
  sessionId: string;
  questionKey: string;
  value: unknown;
  requestId: string;
}

export interface OutboundQuestion {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: { value: string; label: string }[];
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
