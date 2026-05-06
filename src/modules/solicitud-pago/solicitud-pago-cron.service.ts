import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { SolicitudPago, SolicitudPagoDocument } from './schemas/solicitud-pago.schema';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import { EmailService } from '../../integrations/email/email.service';

@Injectable()
export class SolicitudPagoCronService {
  private readonly logger = new Logger(SolicitudPagoCronService.name);

  constructor(
    @InjectModel(SolicitudPago.name) private solicitudModel: Model<SolicitudPagoDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private emailService: EmailService,
    private config: ConfigService,
  ) {}

  /**
   * Recordatorio diario a las 9am: si una solicitud lleva más de N horas en
   * "pendiente", reenvía email a contabilidad.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async recordatorioPendientes() {
    const horasUmbral = parseInt(this.config.get('SOLICITUD_PAGO_REMINDER_HOURS', '24'), 10);
    const desde = new Date(Date.now() - horasUmbral * 3600 * 1000);

    const pendientes = await this.solicitudModel
      .find({ estado: 'pendiente', createdAt: { $lt: desde } })
      .populate('factura', 'numero')
      .populate('ordenPago', 'numero')
      .lean();

    if (pendientes.length === 0) {
      this.logger.log('No hay solicitudes pendientes >24h — sin recordatorios para enviar');
      return;
    }

    const contables = await this.userModel
      .find({ role: 'contabilidad', activo: true })
      .select('email')
      .lean();
    if (contables.length === 0) {
      this.logger.warn('No hay usuarios contabilidad activos para notificar');
      return;
    }

    const baseUrl = this.config.get<string>('CORS_ORIGIN') || 'http://localhost:4200';
    const subject = `[Perc] ${pendientes.length} solicitud${pendientes.length === 1 ? '' : 'es'} de pago esperando aprobación`;
    const items = pendientes
      .map((p: any) => {
        const ref = p.factura?.numero ? `Factura ${p.factura.numero}` : `Orden ${p.ordenPago?.numero ?? '?'}`;
        const monto = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(p.monto);
        return `<li><a href="${baseUrl}/solicitudes-pago/${p._id}">${ref}</a> — ${monto} (${p.tipo})</li>`;
      })
      .join('');
    const html = `
      <h2>Solicitudes de pago aún pendientes</h2>
      <p>Las siguientes solicitudes llevan más de ${horasUmbral}h sin aprobar:</p>
      <ul>${items}</ul>
      <p style="margin-top:16px"><a href="${baseUrl}/solicitudes-pago" style="background:#6366f1;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px">Abrir bandeja</a></p>
    `;

    await Promise.all(contables.map(c => this.emailService.sendEmail(c.email, subject, html)));
    this.logger.log(`Recordatorio enviado a ${contables.length} contables sobre ${pendientes.length} solicitudes pendientes`);
  }
}
