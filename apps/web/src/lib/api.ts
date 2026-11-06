/** Cliente HTTP mínimo. Todas las llamadas van a /api (reescrito por Next al backend). */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Options = Omit<RequestInit, 'body'> & { body?: unknown; sessionToken?: string };

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const { body, sessionToken, headers, ...rest } = opts;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...rest,
      credentials: 'same-origin',
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const raw = (data as { message?: unknown } | null)?.message;
    const message = Array.isArray(raw) ? raw.join(', ') : typeof raw === 'string' ? raw : `Error ${res.status}`;
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/login')) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
    }
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : 'Ocurrió un error inesperado.';
