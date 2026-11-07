import { LOCALITIES, PROVINCES } from './argentina.data';
import { normalizeText, similarity } from '../engine/text';

export interface Locality {
  id: string;
  name: string;
  provinceId: string;
  province: string;
  department: string;
}

export interface LocalityMatch extends Locality {
  score: number;
}

const provinceName = new Map(PROVINCES.map((p) => [p.id, p.name]));

interface Indexed extends Locality {
  norm: string;
  tokens: string[];
}

const ALL: Indexed[] = LOCALITIES.map(([id, name, provinceId, department]) => {
  const norm = normalizeText(name);
  return { id, name, provinceId, province: provinceName.get(provinceId) ?? '', department, norm, tokens: norm.split(' ') };
});
const BY_ID = new Map(ALL.map((l) => [l.id, l]));
// El catálogo puede listar la misma localidad con dos ids (ej. "Córdoba", Capital): para buscar se usa una sola
// (la de id más corto, la localidad censal). Las dos siguen siendo válidas al elegir por id.
const INDEX: Indexed[] = [
  ...ALL.reduce((acc, l) => {
    const k = `${l.provinceId}|${l.department}|${l.norm}`;
    const prev = acc.get(k);
    if (!prev || l.id.length < prev.id.length) acc.set(k, l);
    return acc;
  }, new Map<string, Indexed>()).values(),
];

const strip = ({ norm: _n, tokens: _t, ...l }: Indexed): Locality => l;

export const provinces = () => PROVINCES;
export const provinceById = (id: string) => PROVINCES.find((p) => p.id === id) ?? null;

export function localityById(id: string): Locality | null {
  const l = BY_ID.get(id);
  return l ? strip(l) : null;
}

/** Puntaje 0..1: exacto > prefijo > palabras > parecido con errores de tipeo. */
function score(query: string, qTokens: string[], l: Indexed): number {
  if (l.norm === query) return 1;
  if (l.norm.startsWith(query) && query.length >= 3) return 0.9 + 0.05 * (query.length / l.norm.length);
  const whole = similarity(query, l.norm);
  // Cada palabra de la búsqueda contra la mejor palabra de la localidad (tolera palabras de más o de menos).
  const perToken =
    qTokens.reduce((acc, t) => acc + Math.max(...l.tokens.map((w) => (w.startsWith(t) && t.length >= 3 ? 0.95 : similarity(t, w)))), 0) /
    qTokens.length;
  const coverage = Math.min(1, qTokens.length / l.tokens.length);
  return Math.max(whole, perToken * (0.75 + 0.25 * coverage));
}

/**
 * Búsqueda tolerante a errores dentro de una provincia (sin tildes, abreviaturas, errores de tipeo).
 * Devuelve las mejores coincidencias ordenadas por puntaje.
 */
export function searchLocalities(provinceId: string, text: string, limit = 5): LocalityMatch[] {
  const query = normalizeText(text);
  if (!query) return [];
  const qTokens = query.split(' ');
  return INDEX.filter((l) => l.provinceId === provinceId)
    .map((l) => ({ l, s: score(query, qTokens, l) }))
    .filter((x) => x.s >= 0.6)
    .sort((a, b) => b.s - a.s || a.l.name.localeCompare(b.l.name, 'es'))
    .slice(0, limit)
    .map(({ l, s }) => ({ ...strip(l), score: Math.round(s * 100) / 100 }));
}

/** Resultado de interpretar una localidad escrita: única (aceptar), ambigua (confirmar) o sin resultados. */
export function resolveLocality(provinceId: string, text: string):
  | { kind: 'exact'; locality: Locality }
  | { kind: 'ambiguous'; candidates: LocalityMatch[] }
  | { kind: 'none' } {
  const matches = searchLocalities(provinceId, text, 5);
  if (!matches.length) return { kind: 'none' };
  const exact = matches.filter((m) => m.score === 1);
  if (exact.length === 1) return { kind: 'exact', locality: exact[0]! };
  return { kind: 'ambiguous', candidates: (exact.length > 1 ? exact : matches).slice(0, 3) };
}
