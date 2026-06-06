/**
 * Unit tests para IsCuitConstraint (validacion de CUIT argentino).
 *
 * Checksum mod-11 con multiplicadores [5,4,3,2,7,6,5,4,3,2] sobre los
 * primeros 10 digitos; el dato 11 es el verificador.
 * Ramas edge: remainder 11 -> 0, remainder 10 -> 9.
 *
 * Fixtures VALIDOS calculados con el algoritmo estandar (independiente):
 *   20-00000000-1  (normal)
 *   20-00000006-0  (edge remainder 11 -> check 0)
 *   20-00000001-9  (edge remainder 10 -> check 9)
 * Fixture INVALIDO real: 30-71234567-9 (el seed lo usa como placeholder;
 *   el verificador correcto es 1, no 9).
 */
import { IsCuitConstraint } from './cuit.validator';

describe('IsCuitConstraint.validate()', () => {
  const v = new IsCuitConstraint();

  describe('CUITs validos -> true', () => {
    it('valido normal', () => expect(v.validate('20-00000000-1')).toBe(true));
    it('edge remainder 11 -> check 0', () => expect(v.validate('20-00000006-0')).toBe(true));
    it('edge remainder 10 -> check 9', () => expect(v.validate('20-00000001-9')).toBe(true));
    it('acepta sin guiones', () => expect(v.validate('20000000001')).toBe(true));
    it('mismo CUIT con y sin guiones da el mismo resultado', () => {
      expect(v.validate('20-00000000-1')).toBe(v.validate('20000000001'));
    });
  });

  describe('CUITs invalidos -> false', () => {
    it('verificador incorrecto', () => expect(v.validate('20-00000000-2')).toBe(false));
    it('placeholder del seed (check correcto es 1, no 9)', () => expect(v.validate('30-71234567-9')).toBe(false));
    it('10 digitos (corto)', () => expect(v.validate('2000000000')).toBe(false));
    it('12 digitos (largo)', () => expect(v.validate('200000000011')).toBe(false));
    it('con letras', () => expect(v.validate('20-0000000A-1')).toBe(false));
    it('string vacio', () => expect(v.validate('')).toBe(false));
  });

  describe('entradas no-string -> false', () => {
    it('null', () => expect(v.validate(null)).toBe(false));
    it('undefined', () => expect(v.validate(undefined)).toBe(false));
    it('numero', () => expect(v.validate(20000000001)).toBe(false));
    it('objeto', () => expect(v.validate({})).toBe(false));
  });

  it('defaultMessage devuelve un mensaje claro', () => {
    expect(v.defaultMessage()).toMatch(/CUIT invalido/i);
  });
});
