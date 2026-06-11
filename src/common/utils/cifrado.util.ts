import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Cifrado simétrico AES-256-GCM para secretos en reposo (ej. el secreto TOTP).
 *
 * Formato de salida: `iv:authTag:ciphertext` (cada parte en hex). GCM aporta
 * confidencialidad + integridad (el authTag detecta manipulación al descifrar).
 *
 * La clave debe ser hex de 64 chars (32 bytes). Se valida al usarla.
 */

function parseKey(encKeyHex: string): Buffer {
  const key = Buffer.from(encKeyHex, 'hex');
  if (key.length !== 32) {
    throw new Error(
      'TOTP_ENC_KEY inválida: debe ser hex de 64 caracteres (32 bytes) para AES-256-GCM',
    );
  }
  return key;
}

const AUTH_TAG_LENGTH = 16; // 128 bits — tag GCM completo (explícito, no el default implícito)

export function cifrar(plaintext: string, encKeyHex: string): string {
  const key = parseKey(encKeyHex);
  const iv = randomBytes(12); // 96 bits, recomendado para GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function descifrar(payload: string, encKeyHex: string): string {
  const key = parseKey(encKeyHex);
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Payload cifrado con formato inválido');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivHex, 'hex'),
    { authTagLength: AUTH_TAG_LENGTH },
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
