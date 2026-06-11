import {
  cifrarCbu,
  descifrarCbu,
  cifrarDatosBancarios,
  revelarEmpresaBancarios,
  enmascararEmpresaBancarios,
  prepararEmpresaBancarios,
  puedeVerCbu,
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
