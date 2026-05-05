import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { TwoCaptchaClient } from './twocaptcha.client';

export interface ApocrifoMatch {
  cuit: string;
  fechaDeteccion: string | null;
  fechaPublicacion: string | null;
  descripcion: string;
}

export interface ApocrifoResult {
  esApocrifo: boolean;
  matches: ApocrifoMatch[];
}

const BASE = 'https://servicioscf.afip.gob.ar/facturacion/facturasapocrifas';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

@Injectable()
export class ApocrifosClient {
  private readonly logger = new Logger(ApocrifosClient.name);

  constructor(private readonly twoCaptcha: TwoCaptchaClient) {}

  isConfigured(): boolean {
    return this.twoCaptcha.isConfigured();
  }

  async consultar(cuit: string): Promise<ApocrifoResult> {
    const cleaned = cuit.replace(/-/g, '').trim();
    if (!/^\d{11}$/.test(cleaned)) {
      throw new BadRequestException('CUIT inválido');
    }

    const cookies = new Map<string, string>();

    await this.fetchAfip(`${BASE}/default.aspx`, { method: 'GET' }, cookies);
    const captchaB64 = await this.fetchCaptcha(cookies);
    const cap = await this.twoCaptcha.solveImage(captchaB64);

    let result = await this.consultarCuit(cleaned, cap, cookies);
    if (result.captchaIncorrecto) {
      this.logger.warn(`Captcha incorrecto para ${cleaned}, reintentando una vez`);
      const cap2B64 = await this.fetchCaptcha(cookies);
      const cap2 = await this.twoCaptcha.solveImage(cap2B64);
      result = await this.consultarCuit(cleaned, cap2, cookies);
      if (result.captchaIncorrecto) {
        throw new Error('AFIP rechazó el captcha dos veces seguidas');
      }
    }
    return { esApocrifo: result.matches.length > 0, matches: result.matches };
  }

  private async fetchCaptcha(cookies: Map<string, string>): Promise<string> {
    const res = await this.fetchAfip(
      `${BASE}/Captcha.aspx/cargarCaptchaBack`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: `${BASE}/default.aspx`,
          Origin: 'https://servicioscf.afip.gob.ar',
        },
        body: '{}',
      },
      cookies,
    );
    const json = await res.json();
    const data: string = json?.d ?? '';
    const match = data.match(/^data:image\/[a-zA-Z]+;base64,(.+)$/);
    if (!match) throw new Error('AFIP no devolvió imagen de captcha válida');
    return match[1];
  }

  private async consultarCuit(
    cuit: string,
    cap: string,
    cookies: Map<string, string>,
  ): Promise<{ captchaIncorrecto: boolean; matches: ApocrifoMatch[] }> {
    const res = await this.fetchAfip(
      `${BASE}/default.aspx/getfacturaApocrifaporCuit`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: `${BASE}/default.aspx`,
          Origin: 'https://servicioscf.afip.gob.ar',
        },
        body: JSON.stringify({ cuit, cap }),
      },
      cookies,
    );
    const json = await res.json();
    const arr: any[] = Array.isArray(json?.d) ? json.d : [];
    if (arr.length === 1 && /captcha incorrecto/i.test(arr[0]?.Descripcion_corta || '')) {
      return { captchaIncorrecto: true, matches: [] };
    }
    const matches: ApocrifoMatch[] = arr
      .filter(r => r?.Cuit && r?.Descripcion_corta && !/captcha/i.test(r.Descripcion_corta))
      .map(r => ({
        cuit: String(r.Cuit),
        fechaDeteccion: r.FechaDeteccion ?? null,
        fechaPublicacion: r.FechaPublicacion ?? null,
        descripcion: r.Descripcion_corta,
      }));
    return { captchaIncorrecto: false, matches };
  }

  private async fetchAfip(
    url: string,
    init: RequestInit,
    cookies: Map<string, string>,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'User-Agent': UA,
      'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
      ...(init.headers as Record<string, string> || {}),
    };
    if (cookies.size > 0) {
      headers.Cookie = [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    const res = await fetch(url, { ...init, headers });
    const setCookieHeader = (res.headers as any).getSetCookie?.() as string[] | undefined;
    const list = setCookieHeader && setCookieHeader.length > 0
      ? setCookieHeader
      : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')!] : []);
    for (const c of list) {
      const eq = c.indexOf('=');
      const semi = c.indexOf(';');
      if (eq > 0) {
        const name = c.slice(0, eq).trim();
        const value = c.slice(eq + 1, semi > 0 ? semi : undefined).trim();
        cookies.set(name, value);
      }
    }
    return res;
  }
}
