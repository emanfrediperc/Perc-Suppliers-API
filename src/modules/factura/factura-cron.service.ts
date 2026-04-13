import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Factura, FacturaDocument } from './schemas/factura.schema';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import { EmailService } from '../../integrations/email/email.service';

@Injectable()
export class FacturaCronService {
  private readonly logger = new Logger(FacturaCronService.name);

  constructor(
    @InjectModel(Factura.name) private readonly facturaModel: Model<FacturaDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async notificarFacturasPorVencer(): Promise<void> {
    this.logger.log('Iniciando cron: notificaciones de facturas por vencer');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in7Days = new Date(today);
    in7Days.setDate(in7Days.getDate() + 7);
    in7Days.setHours(23, 59, 59, 999);

    const facturas = await this.facturaModel
      .find({
        fechaVencimiento: { $gte: today, $lte: in7Days },
        estado: { $in: ['pendiente', 'parcial'] },
        saldoPendiente: { $gt: 0 },
      })
      .populate('empresaProveedora', 'razonSocial')
      .lean()
      .exec();

    if (facturas.length === 0) {
      this.logger.log('No hay facturas por vencer en los próximos 7 días');
      return;
    }

    const users = await this.userModel
      .find({ activo: true, role: { $in: ['admin', 'tesoreria'] } })
      .lean()
      .exec();

    if (users.length === 0) {
      this.logger.warn('No hay usuarios admin/tesoreria activos para notificar');
      return;
    }

    let sent = 0;

    for (const factura of facturas) {
      const proveedor = (factura.empresaProveedora as any)?.razonSocial ?? 'N/A';
      const vencimiento = this.formatDate(factura.fechaVencimiento);

      for (const user of users) {
        await this.emailService.sendFacturaPorVencer(user.email, {
          facturaNumero: factura.numero,
          proveedor,
          vencimiento,
          saldo: factura.saldoPendiente,
        });
        sent++;
      }
    }

    this.logger.log(
      `Cron finalizado: ${sent} notificaciones enviadas (${facturas.length} facturas × ${users.length} usuarios)`,
    );
  }

  private formatDate(date: Date | undefined): string {
    if (!date) return '—';
    const d = new Date(date);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
}
