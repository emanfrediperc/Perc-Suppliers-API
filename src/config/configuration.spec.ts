import configuration from './configuration';

/**
 * REGRESIÓN — Finding "Cifrado at-rest del CBU desactivado por defecto y sin validación
 * de CBU_ENC_KEY en el arranque (fail-open a plaintext)".
 *
 * El cifrado at-rest del CBU NO debe depender silenciosamente de una env var vacía:
 * - En producción sin key => fail-closed (el arranque debe abortar).
 * - Una key con formato inválido => debe fallar al BOOT, no en runtime en la primera escritura.
 * - Sin key en dev/test => warning visible (coexistencia plano/cifrado), pero no se rompe.
 */
describe('configuration() — validación de CBU_ENC_KEY al arranque', () => {
  const HEX_64 = 'a'.repeat(64);
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    // JWT_SECRET es requerido por configuration(); lo dejamos válido para aislar CBU_ENC_KEY.
    process.env.JWT_SECRET = 'x'.repeat(32);
    delete process.env.NODE_ENV;
    delete process.env.CBU_ENC_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.restoreAllMocks();
  });

  it('en producción sin CBU_ENC_KEY: fail-closed (no arranca)', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CBU_ENC_KEY;
    expect(() => configuration()).toThrow(/CBU_ENC_KEY must be set in production/);
  });

  it('con CBU_ENC_KEY de formato inválido: falla al boot (no en runtime)', () => {
    // 32 chars (no 64 hex): antes pasaba el arranque y reventaba recién al primer cifrar().
    process.env.CBU_ENC_KEY = 'x'.repeat(32);
    expect(() => configuration()).toThrow(/CBU_ENC_KEY inválida/);
  });

  it('con CBU_ENC_KEY no-hex de 64 chars: falla al boot', () => {
    process.env.CBU_ENC_KEY = 'z'.repeat(64);
    expect(() => configuration()).toThrow(/CBU_ENC_KEY inválida/);
  });

  it('en producción con CBU_ENC_KEY válida: arranca y la expone tipada', () => {
    process.env.NODE_ENV = 'production';
    process.env.CBU_ENC_KEY = HEX_64;
    const cfg = configuration();
    expect(cfg.cbu.encKey).toBe(HEX_64);
  });

  it('sin CBU_ENC_KEY en dev/test: warning visible pero no aborta', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    delete process.env.CBU_ENC_KEY; // NODE_ENV no es production
    const cfg = configuration();
    expect(cfg.cbu.encKey).toBe('');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toMatch(/PLAINTEXT/);
  });
});
