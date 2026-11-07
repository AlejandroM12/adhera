import { describe, expect, it } from 'vitest';
import { countLabel } from './applications.service';

describe('countLabel', () => {
  it('usa singular cuando la cantidad es 1', () => {
    expect(countLabel('1', 'Integrantes adicionales')).toBe('1 integrante adicional');
    expect(countLabel('1', 'Integrantes')).toBe('1 integrante');
  });

  it('mantiene el plural para otras cantidades', () => {
    expect(countLabel('3', 'Integrantes adicionales')).toBe('3 integrantes adicionales');
    expect(countLabel('0', 'Integrantes')).toBe('0 integrantes');
  });
});
