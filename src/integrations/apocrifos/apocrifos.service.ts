import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { CacheApocrifo, CacheApocrifoDocument } from './schemas/cache-apocrifo.schema';
import { ApocrifosClient, ApocrifoResult } from './apocrifos.client';

@Injectable()
export class ApocrifosService {
  private readonly logger = new Logger(ApocrifosService.name);

  constructor(
    @InjectModel(CacheApocrifo.name) private cacheModel: Model<CacheApocrifoDocument>,
    private readonly client: ApocrifosClient,
    private readonly config: ConfigService,
  ) {}

  isConfigured(): boolean {
    return this.client.isConfigured();
  }

  async consultar(cuit: string, opts?: { force?: boolean }): Promise<ApocrifoResult | null> {
    const cleaned = cuit.replace(/-/g, '').trim();
    if (!/^\d{11}$/.test(cleaned)) return null;

    if (!opts?.force) {
      const cached = await this.cacheModel.findOne({ cuit: cleaned });
      if (cached && cached.expiraEn > new Date()) {
        return { esApocrifo: cached.esApocrifo, matches: cached.matches };
      }
    }

    if (!this.isConfigured()) {
      this.logger.warn('Apocrifos no configurado (falta TWOCAPTCHA_API_KEY) — saltando');
      return null;
    }

    try {
      const result = await this.client.consultar(cleaned);
      const ttlDays = parseInt(this.config.get('APOCRIFOS_CACHE_DAYS', '30'), 10);
      const expiraEn = new Date(Date.now() + ttlDays * 24 * 3600 * 1000);
      await this.cacheModel.updateOne(
        { cuit: cleaned },
        { $set: { ...result, cuit: cleaned, expiraEn } },
        { upsert: true },
      );
      return result;
    } catch (err: any) {
      this.logger.error(`Consulta apócrifos para ${cleaned} falló: ${err.message}`);
      return null;
    }
  }
}
