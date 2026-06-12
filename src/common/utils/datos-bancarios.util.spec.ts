import { Logger } from '@nestjs/common';
import {
  cifrarCbu,
  descifrarCbu,
  cifrarDatosBancarios,
  revelarEmpresaBancarios,
  enmascararEmpresaBancarios,
  prepararEmpresaBancarios,
  puedeVerCbu,
  CBU_INVALIDO,
} from './datos-bancarios.util';

const KEY = 'a'.repeat(64); // 32 bytes hex
const CBU = '0070999030004123456789'; // termina en 6789

describe('datos-bancarios util', () => {
  afterEach(() => {
    delete process.env.CBU_ENC_KEY;
  });

  it('puedeVerCbu: admin/tesoreria/operador ven, consulta no', () => {
    expect(puedeVerCbu('admin')).toBe(true);
    expect(puedeVerCbu('tesoreria')).toBe(true);
    expect(puedeVerCbu('operador')).toBe(true);
    expect(puedeVerCbu('consulta')).toBe(false);
    expect(puedeVerCbu(undefined)).toBe(false);
  });

  describe('con CBU_ENC_KEY (cifrado activo)', () => {
    beforeEach(() => {
      process.env.CBU_ENC_KEY = KEY;
    });

    it('cifra y descifra (round-trip)', () => {
      const enc = cifrarCbu(CBU);
      expect(enc).not.toBe(CBU);
      expect(enc).toContain(':');
      expect(descifrarCbu(enc)).toBe(CBU);
    });

    it('cifrarCbu es idempotente (no re-cifra un valor ya cifrado)', () => {
      const enc = cifrarCbu(CBU)!;
      expect(cifrarCbu(enc)).toBe(enc);
    });

    it('descifrarCbu sobre un valor plano lo devuelve igual (coexistencia)', () => {
      expect(descifrarCbu(CBU)).toBe(CBU);
    });

    it('cifrarDatosBancarios cifra solo el cbu', () => {
      const out = cifrarDatosBancarios({
        banco: 'Galicia',
        cbu: CBU,
        alias: 'X',
      });
      expect(out.cbu).not.toBe(CBU);
      expect(out.banco).toBe('Galicia');
      expect(descifrarCbu(out.cbu)).toBe(CBU);
    });

    it('revelarEmpresaBancarios descifra el cbu', () => {
      const emp = { datosBancarios: { cbu: cifrarCbu(CBU), banco: 'X' } };
      expect(revelarEmpresaBancarios(emp).datosBancarios.cbu).toBe(CBU);
    });

    it('enmascararEmpresaBancarios descifra y enmascara (****últimos4)', () => {
      const emp = { datosBancarios: { cbu: cifrarCbu(CBU) } };
      expect(enmascararEmpresaBancarios(emp).datosBancarios.cbu).toBe(
        '****6789',
      );
    });

    it('prepararEmpresaBancarios respeta el rol', () => {
      const emp = () => ({ datosBancarios: { cbu: cifrarCbu(CBU) } });
      expect(
        prepararEmpresaBancarios(emp(), 'operador').datosBancarios.cbu,
      ).toBe(CBU);
      expect(
        prepararEmpresaBancarios(emp(), 'consulta').datosBancarios.cbu,
      ).toBe('****6789');
    });

    // REGRESIÓN — Finding "descifrarCbu() ignora el fallo de autenticación de
    // AES-256-GCM y devuelve el ciphertext crudo". El authTag de GCM es la única
    // garantía de integridad at-rest del CBU: un valor manipulado NO debe devolverse
    // crudo (eso anula la detección de tampering y filtra el blob cifrado al reporte).
    describe('integridad / authTag inválido (anti-tampering)', () => {
      let errorSpy: jest.SpyInstance;

      beforeEach(() => {
        errorSpy = jest
          .spyOn(Logger.prototype, 'error')
          .mockImplementation(() => undefined);
      });

      afterEach(() => {
        errorSpy.mockRestore();
      });

      function tamperCiphertext(enc: string): string {
        const [iv, tag, data] = enc.split(':');
        // Flip de los últimos bytes del ciphertext: rompe el authTag de GCM.
        const ultimo = data.slice(-2) === '00' ? '11' : '00';
        return `${iv}:${tag}:${data.slice(0, -2)}${ultimo}`;
      }

      it('NO devuelve el ciphertext crudo cuando el authTag no valida', () => {
        const enc = cifrarCbu(CBU)!;
        const tampered = tamperCiphertext(enc);

        const out = descifrarCbu(tampered);

        // El ataque ya NO funciona: no se filtra el blob cifrado.
        expect(out).not.toBe(tampered);
        expect(out).not.toContain(':');
        // No devuelve el CBU original (no tiene la posibilidad de reconstruirlo).
        expect(out).not.toBe(CBU);
        // Devuelve el sentinel explícito, no basura hexadecimal.
        expect(out).toBe(CBU_INVALIDO);
      });

      it('loguea un evento de seguridad ante manipulación del CBU', () => {
        const tampered = tamperCiphertext(cifrarCbu(CBU)!);
        descifrarCbu(tampered);
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(String(errorSpy.mock.calls[0][0])).toMatch(/authTag/i);
      });

      it('falla con la key equivocada sin devolver el ciphertext', () => {
        const enc = cifrarCbu(CBU)!;
        // Cambiar la key: descifrar lanza por authTag inválido.
        process.env.CBU_ENC_KEY = 'b'.repeat(64);
        const out = descifrarCbu(enc);
        expect(out).toBe(CBU_INVALIDO);
        expect(out).not.toBe(enc);
      });

      it('revelarEmpresaBancarios devuelve el sentinel, no el blob, ante tampering', () => {
        const tampered = tamperCiphertext(cifrarCbu(CBU)!);
        const emp = { datosBancarios: { cbu: tampered, banco: 'X' } };
        expect(revelarEmpresaBancarios(emp).datosBancarios.cbu).toBe(
          CBU_INVALIDO,
        );
      });

      it('enmascararEmpresaBancarios propaga el sentinel sin enmascararlo (no genera basura)', () => {
        const tampered = tamperCiphertext(cifrarCbu(CBU)!);
        const emp = { datosBancarios: { cbu: tampered } };
        const out = enmascararEmpresaBancarios(emp).datosBancarios.cbu;
        expect(out).toBe(CBU_INVALIDO);
        // No filtra los "últimos 4" de un blob hex como si fuera un CBU.
        expect(out).not.toMatch(/^\*\*\*\*/);
      });
    });
  });

  describe('sin CBU_ENC_KEY (texto plano, coexistencia)', () => {
    it('cifrarCbu devuelve el valor plano', () => {
      expect(cifrarCbu(CBU)).toBe(CBU);
    });
    it('descifrarCbu devuelve el valor plano', () => {
      expect(descifrarCbu(CBU)).toBe(CBU);
    });
    it('enmascara igual sobre un cbu plano', () => {
      const emp = { datosBancarios: { cbu: CBU } };
      expect(enmascararEmpresaBancarios(emp).datosBancarios.cbu).toBe(
        '****6789',
      );
    });
  });
});
