import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as forge from 'node-forge';
import { createHash, randomBytes } from 'crypto';

/**
 * Cliente TSA RFC 3161 — implementación mínima.
 *
 * Genera TimeStampReq (DER ASN.1) con el SHA-256 del payload, lo POSTea a la TSA,
 * y devuelve el TimeStampResp completo en base64. No parsea la respuesta — el token
 * queda guardado tal cual lo devolvió la TSA, y cualquier verificador externo
 * (openssl ts -verify) puede validar la firma usando el certificado público de la TSA.
 *
 * RFC 3161:
 *   TimeStampReq ::= SEQUENCE {
 *     version                  INTEGER,         -- v1 (1)
 *     messageImprint           SEQUENCE { hashAlgorithm AlgorithmIdentifier, hashedMessage OCTET STRING },
 *     reqPolicy                TSAPolicyId OPTIONAL,
 *     nonce                    INTEGER OPTIONAL,
 *     certReq                  BOOLEAN DEFAULT FALSE,
 *     extensions               [0] IMPLICIT Extensions OPTIONAL
 *   }
 */
@Injectable()
export class TsaClient {
  private readonly logger = new Logger(TsaClient.name);
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly enabled: boolean;

  // OID 2.16.840.1.101.3.4.2.1 — sha256
  private static readonly SHA256_OID = '2.16.840.1.101.3.4.2.1';

  constructor(private config: ConfigService) {
    this.url = this.config.get<string>('TSA_URL') || 'https://freetsa.org/tsr';
    this.timeoutMs = parseInt(this.config.get<string>('TSA_TIMEOUT_MS') || '3000', 10);
    this.enabled = this.config.get<string>('TSA_ENABLED') !== 'false';
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Devuelve el TimeStampResp en base64, o null si el sello falló (ya logueado).
   * Nunca lanza — la falla del TSA no debe bloquear la transición.
   */
  async timestamp(payload: string): Promise<{ token: string | null; error?: string }> {
    if (!this.enabled) return { token: null };
    try {
      const digest = createHash('sha256').update(payload).digest();
      const tsq = this.buildTimeStampReq(digest);

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const res = await fetch(this.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/timestamp-query' },
          body: new Uint8Array(tsq),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          return { token: null, error: `TSA HTTP ${res.status}` };
        }
        const buf = Buffer.from(await res.arrayBuffer());
        return { token: buf.toString('base64') };
      } finally {
        clearTimeout(timer);
      }
    } catch (err: any) {
      const msg = err.name === 'AbortError' ? `TSA timeout (>${this.timeoutMs}ms)` : err.message;
      this.logger.warn(`TSA timestamp failed: ${msg}`);
      return { token: null, error: msg };
    }
  }

  private buildTimeStampReq(digest: Buffer): Buffer {
    const asn1 = forge.asn1;
    // hashAlgorithm
    const algId = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(TsaClient.SHA256_OID).getBytes()),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ''),
    ]);
    // messageImprint
    const messageImprint = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      algId,
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, digest.toString('binary')),
    ]);
    // version (1) + messageImprint + nonce + certReq=true
    const version = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, String.fromCharCode(1));
    const nonceBytes = randomBytes(8);
    const nonce = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, nonceBytes.toString('binary'));
    const certReq = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.BOOLEAN, false, String.fromCharCode(0xff));
    const tsq = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      version, messageImprint, nonce, certReq,
    ]);
    const der = asn1.toDer(tsq).getBytes();
    return Buffer.from(der, 'binary');
  }
}
