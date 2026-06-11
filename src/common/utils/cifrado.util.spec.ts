import { cifrar, descifrar } from './cifrado.util';
import { randomBytes } from 'crypto';

describe('cifrado util (AES-256-GCM)', () => {
  const key = randomBytes(32).toString('hex'); // 64 hex chars = 32 bytes

  it('round-trip: descifrar(cifrar(x)) === x', () => {
    const secreto = 'JBSWY3DPEHPK3PXP';
    expect(descifrar(cifrar(secreto, key), key)).toBe(secreto);
  });

  it('produce ciphertext distinto cada vez (IV aleatorio)', () => {
    const a = cifrar('mismo', key);
    const b = cifrar('mismo', key);
    expect(a).not.toBe(b);
    expect(descifrar(a, key)).toBe('mismo');
    expect(descifrar(b, key)).toBe('mismo');
  });

  it('detecta manipulación del ciphertext (authTag GCM)', () => {
    const enc = cifrar('secreto', key);
    const [iv, tag, data] = enc.split(':');
    const tampered = `${iv}:${tag}:${data.slice(0, -2)}00`;
    expect(() => descifrar(tampered, key)).toThrow();
  });

  it('rechaza claves de longitud inválida', () => {
    expect(() => cifrar('x', 'clavecorta')).toThrow();
  });

  it('falla al descifrar con otra clave', () => {
    const enc = cifrar('secreto', key);
    const otraKey = randomBytes(32).toString('hex');
    expect(() => descifrar(enc, otraKey)).toThrow();
  });
});
