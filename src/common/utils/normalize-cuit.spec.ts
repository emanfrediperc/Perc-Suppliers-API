/**
 * Unit tests para normalizeCuit / formatCuit (utilidades puras de CUIT).
 */
import { normalizeCuit, formatCuit } from './normalize-cuit';

describe('normalizeCuit', () => {
  it('quita los guiones', () => {
    expect(normalizeCuit('20-00000000-1')).toBe('20000000001');
  });
  it('deja igual un CUIT ya normalizado', () => {
    expect(normalizeCuit('20000000001')).toBe('20000000001');
  });
});

describe('formatCuit', () => {
  it('formatea 11 digitos a XX-XXXXXXXX-X', () => {
    expect(formatCuit('20000000001')).toBe('20-00000000-1');
  });
  it('re-formatea uno que ya tiene guiones', () => {
    expect(formatCuit('20-00000000-1')).toBe('20-00000000-1');
  });
  it('devuelve la entrada sin cambios si no tiene 11 digitos', () => {
    expect(formatCuit('123')).toBe('123');
  });
});
