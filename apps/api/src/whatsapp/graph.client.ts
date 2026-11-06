import type { GraphMessage } from './payloads';

export interface GraphClientOptions {
  baseUrl: string;
  version: string;
  phoneNumberId: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
  /** Esperas entre reintentos (ms). */
  backoffMs?: number[];
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export type SendResult =
  | { ok: true; messageId: string | null; attempts: number }
  | { ok: false; errorCode: string; retryable: boolean; attempts: number };

/**
 * Cliente mínimo de WhatsApp Cloud API. Reintenta errores transitorios (red, 429, 5xx)
 * y no reintenta errores de validación (4xx). Nunca registra el contenido del mensaje.
 */
export class WhatsAppGraphClient {
  private readonly fetchImpl: typeof fetch;
  private readonly backoff: number[];
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: GraphClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.backoff = opts.backoffMs ?? [300, 1000];
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private get url() {
    return `${this.opts.baseUrl.replace(/\/$/, '')}/${this.opts.version}/${this.opts.phoneNumberId}/messages`;
  }

  async send(message: GraphMessage): Promise<SendResult> {
    let attempt = 0;
    let lastError: { errorCode: string; retryable: boolean } = { errorCode: 'unknown', retryable: true };
    while (attempt <= this.backoff.length) {
      attempt++;
      try {
        const res = await this.fetchImpl(this.url, {
          method: 'POST',
          headers: { authorization: `Bearer ${this.opts.accessToken}`, 'content-type': 'application/json' },
          body: JSON.stringify(message),
          signal: AbortSignal.timeout(this.opts.timeoutMs ?? 10_000),
        });
        const data = (await res.json().catch(() => null)) as {
          messages?: { id?: string }[];
          error?: { code?: number; error_subcode?: number };
        } | null;
        if (res.ok) return { ok: true, messageId: data?.messages?.[0]?.id ?? null, attempts: attempt };
        const code = data?.error?.code !== undefined ? String(data.error.code) : `http_${res.status}`;
        const retryable = res.status === 429 || res.status >= 500;
        lastError = { errorCode: code, retryable };
        if (!retryable) return { ok: false, ...lastError, attempts: attempt };
      } catch {
        lastError = { errorCode: 'network', retryable: true };
      }
      const wait = this.backoff[attempt - 1];
      if (wait === undefined) break;
      await this.sleep(wait);
    }
    return { ok: false, ...lastError, attempts: attempt };
  }
}
