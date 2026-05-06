import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { ApocrifosService } from './apocrifos.service';
import { CacheApocrifo, CacheApocrifoDocument } from './schemas/cache-apocrifo.schema';
import { Factura, FacturaDocument } from '../../modules/factura/schemas/factura.schema';
import { EmpresaProveedora, EmpresaProveedoraDocument } from '../../modules/empresa-proveedora/schemas/empresa-proveedora.schema';

@Injectable()
export class ApocrifosCronService {
  private readonly logger = new Logger(ApocrifosCronService.name);

  constructor(
    @InjectModel(Factura.name) private facturaModel: Model<FacturaDocument>,
    @InjectModel(EmpresaProveedora.name) private proveedorModel: Model<EmpresaProveedoraDocument>,
    @InjectModel(CacheApocrifo.name) private cacheModel: Model<CacheApocrifoDocument>,
    private readonly apocrifos: ApocrifosService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async recheckProveedoresActivos() {
    if (!this.apocrifos.isConfigured()) return;

    const ventanaDias = parseInt(this.config.get('APOCRIFOS_RECHECK_WINDOW_DAYS', '90'), 10);
    const desde = new Date(Date.now() - ventanaDias * 24 * 3600 * 1000);

    const cuits: string[] = await this.facturaModel
      .aggregate([
        { $match: { createdAt: { $gte: desde } } },
        { $group: { _id: '$empresaProveedora' } },
        {
          $lookup: {
            from: 'empresas_proveedoras',
            localField: '_id',
            foreignField: '_id',
            as: 'prov',
          },
        },
        { $unwind: '$prov' },
        { $match: { 'prov.activo': true } },
        { $project: { _id: 0, cuit: '$prov.cuit' } },
      ])
      .then(rows => rows.map((r: any) => r.cuit).filter(Boolean));

    if (cuits.length === 0) return;

    this.logger.log(`Recheck apócrifos: ${cuits.length} CUITs activos`);

    await this.cacheModel.deleteMany({ cuit: { $in: cuits } });

    let nuevosApocrifos = 0;
    let exitos = 0;
    let fallas = 0;
    const erroresMuestra: string[] = [];
    for (const cuit of cuits) {
      try {
        const result = await this.apocrifos.consultar(cuit);
        if (result === null) {
          fallas++;
          if (erroresMuestra.length < 5) erroresMuestra.push(`${cuit}: consulta devolvió null`);
        } else {
          exitos++;
          if (result.esApocrifo) {
            nuevosApocrifos++;
            await this.flagearFacturasApocrifas(cuit, result.matches[0]?.descripcion);
          }
        }
      } catch (err: any) {
        fallas++;
        if (erroresMuestra.length < 5) erroresMuestra.push(`${cuit}: ${err.message}`);
        this.logger.warn(`Recheck ${cuit} falló: ${err.message}`);
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    const tasaFalla = cuits.length > 0 ? fallas / cuits.length : 0;
    this.logger.log(`Recheck completo. Éxitos: ${exitos}, fallas: ${fallas}, nuevos apócrifos: ${nuevosApocrifos}`);

    // Si más del 50% falló, es un signo de TSA/2captcha caído o AFIP cambió endpoint.
    if (tasaFalla > 0.5 && cuits.length >= 5) {
      this.logger.error(`ALERTA: tasa de falla del recheck apócrifos = ${(tasaFalla * 100).toFixed(0)}% (${fallas}/${cuits.length}). Muestra de errores:\n  ${erroresMuestra.join('\n  ')}`);
    }
  }

  private async flagearFacturasApocrifas(cuit: string, descripcion?: string) {
    const proveedor = await this.proveedorModel.findOne({ cuit }).lean();
    if (!proveedor) return;

    const alerta = {
      tipo: 'proveedor_apocrifo_detectado_post_alta',
      severidad: 'error',
      mensaje: `El CUIT ${cuit} fue marcado como apócrifo después de la creación de esta factura`,
      detalle: { descripcion: descripcion || null },
      fecha: new Date(),
    };

    const result = await this.facturaModel.updateMany(
      {
        empresaProveedora: proveedor._id,
        'alertas.tipo': { $ne: alerta.tipo },
      },
      { $push: { alertas: alerta } },
    );

    this.logger.warn(
      `Proveedor ${cuit} ahora apócrifo — ${result.modifiedCount} facturas flageadas retroactivamente`,
    );
  }
}
