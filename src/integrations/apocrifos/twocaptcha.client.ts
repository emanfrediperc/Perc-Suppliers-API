import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TwoCaptchaClient {
  private readonly logger = new Logger(TwoCaptchaClient.name);
  private readonly base = 'https://2captcha.com';

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!this.config.get('TWOCAPTCHA_API_KEY');
  }

  async solveImage(base64: string): Promise<string> {
    const apiKey = this.config.get<string>('TWOCAPTCHA_API_KEY');
    if (!apiKey) throw new InternalServerErrorException('TWOCAPTCHA_API_KEY no configurado');

    const submit = await fetch(`${this.base}/in.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        key: apiKey,
        method: 'base64',
        body: base64,
        json: '1',
        regsense: '0',
        numeric: '0',
        min_len: '4',
        max_len: '8',
      }),
    });
    const submitJson = await submit.json();
    if (submitJson.status !== 1) {
      throw new InternalServerErrorException(`2captcha submit falló: ${submitJson.request}`);
    }
    const captchaId = submitJson.request as string;

    const maxAttempts = 24;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const poll = await fetch(`${this.base}/res.php?key=${apiKey}&action=get&id=${captchaId}&json=1`);
      const pollJson = await poll.json();
      if (pollJson.status === 1) return pollJson.request;
      if (pollJson.request !== 'CAPCHA_NOT_READY') {
        throw new InternalServerErrorException(`2captcha falló: ${pollJson.request}`);
      }
    }
    throw new InternalServerErrorException('2captcha timeout (>2min)');
  }
}
