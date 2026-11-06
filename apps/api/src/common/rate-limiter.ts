/**
 * Límite de frecuencia en memoria (ventana deslizante). Suficiente para una sola instancia;
 * con varias instancias habría que moverlo a un almacenamiento compartido.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  private recent(key: string, t: number) {
    return (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
  }

  /** Registra un intento y devuelve false si la clave superó el límite. */
  allow(key: string): boolean {
    if (!this.peek(key)) return false;
    this.record(key);
    return true;
  }

  /** true si la clave todavía tiene intentos disponibles (no registra nada). */
  peek(key: string): boolean {
    return this.recent(key, this.now()).length < this.limit;
  }

  /** Registra un intento (por ejemplo, sólo los fallidos). */
  record(key: string): void {
    const t = this.now();
    const recent = this.recent(key, t);
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(t);
  }

  private prune(t: number) {
    for (const [k, v] of this.hits) {
      if (v.every((x) => t - x >= this.windowMs)) this.hits.delete(k);
    }
  }
}

/** Serializa tareas por clave (ej. un contacto) para evitar condiciones de carrera. */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.tails.set(key, next);
    void next.finally(() => {
      if (this.tails.get(key) === next) this.tails.delete(key);
    }).catch(() => undefined);
    return next;
  }
}
