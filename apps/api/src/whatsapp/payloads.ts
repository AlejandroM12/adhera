/**
 * Traducción entre el formato de WhatsApp Cloud API y el modelo interno.
 * Funciones puras: sin red ni base de datos.
 */
import type { ChoiceOption } from '../engine/conversation-engine';

// ---------- Entrada (webhook) ----------

export interface NormalizedInbound {
  /** wamid: id único del mensaje (clave de deduplicación). */
  id: string;
  /** wa_id del remitente. */
  from: string;
  /** phone_number_id del número que recibió el mensaje. */
  phoneNumberId: string;
  timestamp: Date;
  /** text = texto libre; reply = botón o fila de lista; unsupported = audio, imagen, documento, etc. */
  kind: 'text' | 'reply' | 'unsupported';
  type: string;
  text?: string;
  replyId?: string;
  replyTitle?: string;
}

export interface NormalizedStatus {
  /** wamid del mensaje saliente. */
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  recipient: string;
  phoneNumberId: string;
  errorCode?: string;
}

export interface WebhookEvents {
  messages: NormalizedInbound[];
  statuses: NormalizedStatus[];
}

const MAX_TEXT = 1000;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Extrae mensajes y estados de un payload `whatsapp_business_account`. Ignora lo desconocido. */
export function extractEvents(body: unknown): WebhookEvents {
  const out: WebhookEvents = { messages: [], statuses: [] };
  if (!isObj(body) || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return out;
  for (const entry of body.entry) {
    if (!isObj(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isObj(change) || change.field !== 'messages' || !isObj(change.value)) continue;
      const value = change.value;
      const phoneNumberId = isObj(value.metadata) ? str(value.metadata.phone_number_id) : undefined;
      if (!phoneNumberId) continue;
      for (const m of Array.isArray(value.messages) ? value.messages : []) {
        const n = normalizeMessage(m, phoneNumberId);
        if (n) out.messages.push(n);
      }
      for (const s of Array.isArray(value.statuses) ? value.statuses : []) {
        if (!isObj(s)) continue;
        const id = str(s.id);
        const status = str(s.status);
        if (!id || !status || !['sent', 'delivered', 'read', 'failed'].includes(status)) continue;
        const errors = Array.isArray(s.errors) ? s.errors : [];
        const code = isObj(errors[0]) ? errors[0].code : undefined;
        out.statuses.push({
          id,
          status: status as NormalizedStatus['status'],
          recipient: str(s.recipient_id) ?? '',
          phoneNumberId,
          ...(code !== undefined ? { errorCode: String(code) } : {}),
        });
      }
    }
  }
  return out;
}

function normalizeMessage(m: unknown, phoneNumberId: string): NormalizedInbound | null {
  if (!isObj(m)) return null;
  const id = str(m.id);
  const from = str(m.from);
  const type = str(m.type) ?? 'unknown';
  if (!id || !from) return null;
  const ts = Number(str(m.timestamp) ?? m.timestamp);
  const base = { id, from, phoneNumberId, type, timestamp: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000) : new Date() };

  if (type === 'text' && isObj(m.text)) {
    return { ...base, kind: 'text', text: (str(m.text.body) ?? '').slice(0, MAX_TEXT) };
  }
  if (type === 'interactive' && isObj(m.interactive)) {
    const reply = isObj(m.interactive.button_reply) ? m.interactive.button_reply : isObj(m.interactive.list_reply) ? m.interactive.list_reply : null;
    if (reply && str(reply.id)) {
      return { ...base, kind: 'reply', replyId: str(reply.id)!.slice(0, 256), replyTitle: str(reply.title)?.slice(0, 100) };
    }
  }
  // Botones de plantillas (quick reply): se tratan como texto con su payload.
  if (type === 'button' && isObj(m.button)) {
    return { ...base, kind: 'reply', replyId: (str(m.button.payload) ?? str(m.button.text) ?? '').slice(0, 256), replyTitle: str(m.button.text) };
  }
  return { ...base, kind: 'unsupported' };
}

// ---------- Comandos ----------

export type Command = 'stop' | 'start' | 'handoff' | 'continue' | 'restart' | 'help' | 'skip' | null;

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .trim();

const COMMANDS: Record<Exclude<Command, null>, string[]> = {
  stop: ['baja', 'stop', 'cancelar suscripcion', 'no me escriban'],
  start: ['alta'],
  handoff: ['asesor', 'humano', 'persona', 'hablar con un asesor', 'hablar con una persona', 'quiero hablar con un asesor'],
  continue: ['continuar', 'seguir'],
  restart: ['nueva', 'reiniciar', 'empezar de nuevo', 'nueva solicitud'],
  help: ['ayuda', 'help', 'menu'],
  skip: ['omitir', 'saltear'],
};

/** Detecta palabras clave. Sólo coincide con el mensaje completo para no confundir respuestas. */
export function parseCommand(text: string | undefined): Command {
  if (!text) return null;
  const t = fold(text);
  for (const [cmd, words] of Object.entries(COMMANDS) as [Exclude<Command, null>, string[]][]) {
    if (words.includes(t)) return cmd;
  }
  return null;
}

// ---------- Salida (Graph API) ----------

export interface OutboundQuestion {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: ChoiceOption[];
  allowUnknown?: boolean;
  allowPreferNot?: boolean;
  otherLabel?: string;
}

export type GraphMessage = Record<string, unknown>;

const LIMITS = { body: 1024, button: 20, rowTitle: 24, rowDescription: 72, footer: 60, buttons: 3, rows: 10 };

export const truncate = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

export function textMessage(to: string, body: string): GraphMessage {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: truncate(body, 4096), preview_url: false },
  };
}

export function buttonsMessage(to: string, body: string, buttons: { id: string; title: string }[], footer?: string): GraphMessage {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: truncate(body, LIMITS.body) },
      ...(footer ? { footer: { text: truncate(footer, LIMITS.footer) } } : {}),
      action: {
        buttons: buttons.slice(0, LIMITS.buttons).map((b) => ({ type: 'reply', reply: { id: b.id, title: truncate(b.title, LIMITS.button) } })),
      },
    },
  };
}

export function listMessage(to: string, body: string, rows: { id: string; title: string }[], footer?: string): GraphMessage {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: truncate(body, LIMITS.body) },
      ...(footer ? { footer: { text: truncate(footer, LIMITS.footer) } } : {}),
      action: {
        button: 'Ver opciones',
        sections: [
          {
            title: 'Opciones',
            rows: rows.slice(0, LIMITS.rows).map((r) => ({
              id: r.id,
              title: truncate(r.title, LIMITS.rowTitle),
              ...(r.title.length > LIMITS.rowTitle ? { description: truncate(r.title, LIMITS.rowDescription) } : {}),
            })),
          },
        ],
      },
    },
  };
}

export function readReceipt(messageId: string): GraphMessage {
  return { messaging_product: 'whatsapp', status: 'read', message_id: messageId };
}

export const YES_ID = 'yes';
export const NO_ID = 'no';

/**
 * Mensaje para una pregunta: botones (Sí/No o hasta 3 opciones cortas), lista (hasta 10)
 * o texto numerado (más opciones). Siempre se puede responder escribiendo.
 */
export function questionMessage(to: string, q: OutboundQuestion, progress?: { answered: number; total: number }): GraphMessage {
  const footer = progress ? `Pregunta ${progress.answered + 1} de ${progress.total}` : undefined;
  const optional = q.required ? '' : '\n\n(Opcional: escribí OMITIR para saltearla.)';
  const specials = [q.allowUnknown && 'NO SÉ', q.allowPreferNot && 'PREFIERO NO RESPONDER'].filter(Boolean);
  const extra = specials.length ? `\n\nTambién podés responder ${specials.join(' o ')}.` : '';
  const other = q.otherLabel ? `\n(${q.otherLabel}: escribilo con tus palabras.)` : '';
  const body = `${q.label}${optional}${extra}${other}`;

  if (q.type === 'yes_no') {
    return buttonsMessage(to, body, [{ id: YES_ID, title: 'Sí' }, { id: NO_ID, title: 'No' }], footer);
  }
  if (q.type === 'multi_choice' && q.options?.length) {
    const numbered = q.options.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
    return textMessage(to, `${body}\n\n${numbered}\n\nRespondé con los números separados por coma (por ejemplo: 1, 3).${footer ? `\n\n_${footer}_` : ''}`);
  }
  if (q.type === 'single_choice' && q.options?.length) {
    const opts = q.options;
    if (!q.otherLabel && !specials.length && opts.length <= LIMITS.buttons && opts.every((o) => o.label.length <= LIMITS.button)) {
      return buttonsMessage(to, body, opts.map((o) => ({ id: o.value, title: o.label })), footer);
    }
    if (opts.length <= LIMITS.rows) {
      return listMessage(to, body, opts.map((o) => ({ id: o.value, title: o.label })), footer);
    }
    const numbered = opts.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
    return textMessage(to, `${body}\n\n${numbered}\n\nRespondé con el número de la opción.${footer ? `\n\n_${footer}_` : ''}`);
  }
  const hint =
    q.type === 'number' ? '\n\n(Respondé con un número.)'
      : q.type === 'date' ? '\n\n(Formato: DD/MM/AAAA.)'
        : q.type === 'phone' ? '\n\n(Con código de área, por ejemplo 11 2345-6789.)'
          : q.type === 'locality' ? '\n\n(Escribí el nombre de tu localidad.)'
            : '';
  return textMessage(to, `${body}${hint}${footer ? `\n\n_${footer}_` : ''}`);
}

/** Respuesta ambigua: opciones numeradas para confirmar (0 = escribir de nuevo). */
export function confirmationMessage(to: string, c: { message: string; options: string[] }): GraphMessage {
  const numbered = c.options.map((o, i) => `${i + 1}. ${o}`).join('\n');
  return textMessage(to, `${c.message}\n\n${numbered}\n0. Ninguna, quiero escribir de nuevo\n\nRespondé con el número.`);
}

/** Elección ante una confirmación: índice de la opción, 'reject' o null si no se entiende. */
export function resolveConfirmation(options: string[], input: { replyId?: string; text?: string }): number | 'reject' | null {
  const text = (input.text ?? input.replyId ?? '').trim();
  const n = Number(text);
  if (Number.isInteger(n) && n === 0) return 'reject';
  if (Number.isInteger(n) && n >= 1 && n <= options.length) return n - 1;
  const idx = options.findIndex((o) => o.toLowerCase() === text.toLowerCase());
  return idx >= 0 ? idx : null;
}

/**
 * Convierte la entrada del interesado al valor que espera el motor: id de botón/lista,
 * número de opción ("2"), Sí/No o texto libre. La validación final la hace el motor.
 */
export function resolveAnswer(q: OutboundQuestion, input: { replyId?: string; text?: string }): string | boolean | null {
  if (q.type === 'yes_no') {
    if (input.replyId === YES_ID) return true;
    if (input.replyId === NO_ID) return false;
    return input.text ?? input.replyId ?? '';
  }
  if (q.type === 'single_choice') {
    const opts = q.options ?? [];
    if (input.replyId && opts.some((o) => o.value === input.replyId)) return input.replyId;
    const text = (input.text ?? input.replyId ?? '').trim();
    const n = Number(text);
    if (Number.isInteger(n) && n >= 1 && n <= opts.length) return opts[n - 1]!.value;
    return text;
  }
  return input.text ?? input.replyId ?? '';
}
