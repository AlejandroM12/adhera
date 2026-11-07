import { parsePhoneNumberFromString } from 'libphonenumber-js/min';
import { editDistance } from './text';

/** Resultado de un validador: valor aceptado, error, o candidatos para que el interesado confirme. */
export type Parsed<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }
  | { ok: 'confirm'; message: string; candidates: { value: T; label: string }[] };

// ---------------------------------------------------------------- DNI

/** DNI argentino: 7 u 8 dígitos (acepta puntos, espacios y guiones). */
export function parseDni(raw: string): Parsed<string> {
  const digits = raw.replace(/[.\s-]/g, '');
  if (!/^\d+$/.test(digits)) return { ok: false, error: 'El DNI sólo lleva números (por ejemplo 30.123.456).' };
  if (digits.length < 7 || digits.length > 8) return { ok: false, error: 'El DNI tiene 7 u 8 dígitos.' };
  if (/^0+$/.test(digits)) return { ok: false, error: 'Revisá el número de DNI.' };
  return { ok: true, value: digits };
}

export const formatDni = (dni: string) => dni.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// ---------------------------------------------------------------- Fechas

export type DateRule = 'birth' | 'birth_adult' | 'future' | 'past' | 'any';

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const iso = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function validDay(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function ageOn(birthIso: string, today: Date): number {
  const [y, m, d] = birthIso.split('-').map(Number) as [number, number, number];
  let age = today.getUTCFullYear() - y;
  const before = today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d);
  if (before) age--;
  return age;
}

function checkRule(value: string, rule: DateRule, today: Date): string | null {
  const t = iso(today.getUTCFullYear(), today.getUTCMonth() + 1, today.getUTCDate());
  if ((rule === 'birth' || rule === 'birth_adult' || rule === 'past') && value > t) return 'La fecha no puede ser futura.';
  if (rule === 'birth' || rule === 'birth_adult') {
    const age = ageOn(value, today);
    if (age > 110) return 'Revisá el año: la fecha es demasiado antigua.';
    if (rule === 'birth_adult' && age < 18) return 'La persona titular debe ser mayor de edad.';
  }
  if (rule === 'future') {
    if (value < t) return 'La fecha no puede ser pasada.';
    const limit = iso(today.getUTCFullYear() + 2, today.getUTCMonth() + 1, today.getUTCDate());
    if (value > limit) return 'Revisá la fecha: es demasiado lejana.';
  }
  return null;
}

/**
 * Fechas escritas como DD/MM/AAAA, D-M-AA, AAAA-MM-DD o "3 de mayo de 1985".
 * Con año de 2 dígitos sólo pide confirmar si los dos siglos son posibles según la regla.
 */
export function parseDate(raw: string, rule: DateRule, today: Date): Parsed<string> {
  const s = raw.trim().toLowerCase();
  let parts: { d: number; m: number; y: string } | null = null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) parts = { d: +m[3]!, m: +m[2]!, y: m[1]! };
  else if ((m = s.match(/^(\d{1,2})\s*[/.\-\s]\s*(\d{1,2})\s*[/.\-\s]\s*(\d{2}|\d{4})$/))) parts = { d: +m[1]!, m: +m[2]!, y: m[3]! };
  else if ((m = s.match(/^(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(?:de(?:l)?\s+)?(\d{2}|\d{4})$/))) {
    const month = MONTHS[m[2]!.normalize('NFD').replace(/[̀-ͯ]/g, '')];
    if (month) parts = { d: +m[1]!, m: month, y: m[3]! };
  }
  if (!parts) return { ok: false, error: 'Escribí la fecha como DD/MM/AAAA (por ejemplo 05/03/1985).' };

  const years = parts.y.length === 4 ? [Number(parts.y)] : [1900 + Number(parts.y), 2000 + Number(parts.y)];
  const valid = years
    .filter((y) => validDay(y, parts!.m, parts!.d))
    .map((y) => iso(y, parts!.m, parts!.d));
  if (!valid.length) return { ok: false, error: 'Esa fecha no existe. Revisá el día y el mes.' };
  const allowed = valid.filter((v) => checkRule(v, rule, today) === null);
  if (!allowed.length) return { ok: false, error: checkRule(valid[valid.length - 1]!, rule, today)! };
  if (allowed.length === 1) return { ok: true, value: allowed[0]! };
  return {
    ok: 'confirm',
    message: '¿A qué año te referís?',
    candidates: allowed.map((v) => ({ value: v, label: formatDate(v) })),
  };
}

export const formatDate = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
};

// ---------------------------------------------------------------- Teléfono

/** Teléfono argentino (fijo o celular). Normaliza a E.164 (+54…). */
export function parsePhone(raw: string): Parsed<string> {
  const cleaned = raw.trim();
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 8) return { ok: false, error: 'Escribí el teléfono completo con código de área (por ejemplo 11 2345-6789).' };
  if (!cleaned.startsWith('+') && !digits.startsWith('54') && !digits.startsWith('0') && digits.length <= 8) {
    return { ok: false, error: 'Falta el código de área (por ejemplo 11, 351 o 261).' };
  }
  const parsed = parsePhoneNumberFromString(cleaned, 'AR');
  if (!parsed || !parsed.isValid()) {
    return { ok: false, error: 'No parece un teléfono válido de Argentina. Incluí el código de área.' };
  }
  if (parsed.country && parsed.country !== 'AR') return { ok: false, error: 'Ingresá un teléfono de Argentina.' };
  return { ok: true, value: parsed.number };
}

export function formatPhone(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  return parsed ? parsed.formatInternational() : e164;
}

// ---------------------------------------------------------------- Email

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const COMMON_DOMAINS = [
  'gmail.com', 'hotmail.com', 'hotmail.com.ar', 'outlook.com', 'outlook.com.ar', 'yahoo.com', 'yahoo.com.ar',
  'live.com', 'live.com.ar', 'icloud.com', 'fibertel.com.ar', 'speedy.com.ar',
];

/** Email con sugerencia si el dominio parece mal escrito (gmial.com → gmail.com). */
export function parseEmail(raw: string): Parsed<string> {
  const value = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!EMAIL_RE.test(value) || value.length > 200) return { ok: false, error: 'Revisá el correo (por ejemplo nombre@gmail.com).' };
  const [user, domain] = value.split('@') as [string, string];
  if (COMMON_DOMAINS.includes(domain)) return { ok: true, value };
  const close = COMMON_DOMAINS.map((d) => ({ d, dist: editDistance(domain, d) }))
    .filter((x) => x.dist > 0 && x.dist <= 2)
    .sort((a, b) => a.dist - b.dist)[0];
  if (!close) return { ok: true, value };
  const suggested = `${user}@${close.d}`;
  return {
    ok: 'confirm',
    message: `¿Quisiste escribir ${suggested}?`,
    candidates: [
      { value: suggested, label: suggested },
      { value, label: `No, es ${value}` },
    ],
  };
}
