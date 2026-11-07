/** Utilidades de texto para comparar respuestas escritas (sin dependencias). */

const ABBREVIATIONS: Record<string, string> = {
  gral: 'general',
  grl: 'general',
  pte: 'presidente',
  pdte: 'presidente',
  sta: 'santa',
  sto: 'santo',
  sn: 'san',
  cdad: 'ciudad',
  cnel: 'coronel',
  tte: 'teniente',
  dr: 'doctor',
  ing: 'ingeniero',
  pto: 'puerto',
  va: 'villa',
  vla: 'villa',
  bs: 'buenos',
  as: 'aires',
  caba: 'ciudad autonoma de buenos aires',
  cap: 'capital',
  fed: 'federal',
};

/** Minúsculas, sin tildes ni signos, espacios simples y abreviaturas comunes expandidas. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ABBREVIATIONS[w] ?? w)
    .join(' ');
}

/** Distancia de Damerau-Levenshtein (transposiciones adyacentes incluidas). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}

/** Similitud 0..1 entre dos textos ya normalizados. */
export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - editDistance(a, b) / max;
}
