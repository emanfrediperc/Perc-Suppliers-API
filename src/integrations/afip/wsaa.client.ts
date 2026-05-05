import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import * as forge from 'node-forge';
import { XMLParser } from 'fast-xml-parser';

export interface WsaaTicket {
  token: string;
  sign: string;
  expirationTime: number;
}

@Injectable()
export class WsaaClient {
  private readonly logger = new Logger(WsaaClient.name);
  private cache = new Map<string, WsaaTicket>();

  constructor(private readonly config: ConfigService) {}

  async getTicket(service: string): Promise<WsaaTicket> {
    const cached = this.cache.get(service);
    if (cached && cached.expirationTime - 60_000 > Date.now()) return cached;

    const cms = this.buildSignedCms(service);
    const wsaaUrl = this.wsaaUrl();
    const envelope = this.buildSoapEnvelope(cms);

    const res = await fetch(wsaaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '',
      },
      body: envelope,
    });
    const text = await res.text();
    if (!res.ok) {
      this.logger.error(`WSAA HTTP ${res.status}: ${text.slice(0, 500)}`);
      throw new InternalServerErrorException('WSAA respondió con error');
    }

    const ticket = this.parseLoginResponse(text);
    this.cache.set(service, ticket);
    return ticket;
  }

  private buildSignedCms(service: string): string {
    const certPath = this.requirePath('AFIP_CERT_PATH');
    const keyPath = this.requirePath('AFIP_KEY_PATH');
    const certPem = readFileSync(certPath, 'utf8');
    const keyPem = readFileSync(keyPath, 'utf8');

    const now = Math.floor(Date.now() / 1000);
    const generationTime = new Date((now - 60) * 1000).toISOString();
    const expirationTime = new Date((now + 600) * 1000).toISOString();
    const uniqueId = now;

    const tra = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${generationTime}</generationTime>
    <expirationTime>${expirationTime}</expirationTime>
  </header>
  <service>${service}</service>
</loginTicketRequest>`;

    const cert = forge.pki.certificateFromPem(certPem);
    const key = forge.pki.privateKeyFromPem(keyPem);

    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(tra, 'utf8');
    p7.addCertificate(cert);
    p7.addSigner({
      key: key as forge.pki.rsa.PrivateKey,
      certificate: cert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: new Date() as any },
      ],
    });
    p7.sign({ detached: false });
    const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    return forge.util.encode64(der);
  }

  private buildSoapEnvelope(cms: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cms}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;
  }

  private parseLoginResponse(xml: string): WsaaTicket {
    const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true });
    const parsed = parser.parse(xml);
    const loginReturn: string =
      parsed?.Envelope?.Body?.loginCmsResponse?.loginCmsReturn ?? '';
    if (!loginReturn) {
      const fault = parsed?.Envelope?.Body?.Fault?.faultstring;
      throw new InternalServerErrorException(`WSAA login falló: ${fault || 'respuesta vacía'}`);
    }
    const inner = parser.parse(loginReturn);
    const credentials = inner?.loginTicketResponse?.credentials;
    const header = inner?.loginTicketResponse?.header;
    if (!credentials?.token || !credentials?.sign) {
      throw new InternalServerErrorException('WSAA: TA inválido');
    }
    return {
      token: credentials.token,
      sign: credentials.sign,
      expirationTime: new Date(header.expirationTime).getTime(),
    };
  }

  private wsaaUrl(): string {
    const env = this.config.get<string>('AFIP_ENV', 'homologacion');
    return env === 'produccion'
      ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
      : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms';
  }

  private requirePath(envKey: string): string {
    const raw = this.config.get<string>(envKey);
    if (!raw) throw new InternalServerErrorException(`${envKey} no configurado`);
    const abs = resolve(raw);
    if (!existsSync(abs)) throw new InternalServerErrorException(`${envKey} no existe en ${abs}`);
    return abs;
  }
}
