import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Notificacion, NotificacionDocument } from './schemas/notificacion.schema';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import { Factura, FacturaDocument } from '../factura/schemas/factura.schema';
import { EmailService } from '../../integrations/email/email.service';

@Injectable()
export class NotificacionService {
  private readonly logger = new Logger(NotificacionService.name);

  constructor(
    @InjectModel(Notificacion.name) private notifModel: Model<NotificacionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Factura.name) private facturaModel: Model<FacturaDocument>,
    private emailService: EmailService,
  ) {}

  async create(data: {
    usuario: string;
    tipo: string;
    titulo: string;
    mensaje: string;
    entidad?: string;
    entidadId?: string;
  }) {
    return this.notifModel.create(data);
  }

  async notifyUsersByRole(roles: string[], data: Omit<Parameters<typeof this.create>[0], 'usuario'>) {
    const users = await this.userModel.find({ role: { $in: roles }, activo: true });
    const notifications = users.map(u => ({ ...data, usuario: u._id.toString() }));
    if (notifications.length > 0) {
      await this.notifModel.insertMany(notifications);
    }
    // Send email notifications (fire-and-forget)
    for (const user of users) {
      this.emailService.sendEmail(user.email, data.titulo, `<p>${data.mensaje}</p>`).catch(() => {});
    }
  }

  async findByUser(userId: string) {
    return this.notifModel.find({ usuario: userId })
      .sort({ createdAt: -1 })
      .limit(50);
  }

  async countUnread(userId: string): Promise<number> {
    return this.notifModel.countDocuments({ usuario: userId, leida: false });
  }

  async markAsRead(id: string, userId: string) {
    return this.notifModel.findOneAndUpdate(
      { _id: id, usuario: userId },
      { leida: true, leidaAt: new Date() },
      { new: true },
    );
  }

  async markAllAsRead(userId: string) {
    await this.notifModel.updateMany(
      { usuario: userId, leida: false },
      { leida: true, leidaAt: new Date() },
    );
    return { message: 'Todas las notificaciones marcadas como leidas' };
  }

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async checkFacturasProximasVencer() {
    const now = new Date();
    const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const facturas = await this.facturaModel.find({
      estado: { $in: ['pendiente', 'parcial'] },
      fechaVencimiento: { $gte: now, $lte: in7days },
    }).populate('empresaProveedora');

    for (const f of facturas) {
      const proveedorNombre = (f.empresaProveedora as any)?.razonSocial || 'Proveedor';
      const existing = await this.notifModel.findOne({
        tipo: 'factura_por_vencer',
        entidadId: f._id.toString(),
        createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      });
      if (!existing) {
        await this.notifyUsersByRole(['admin', 'tesoreria', 'operador'], {
          tipo: 'factura_por_vencer',
          titulo: 'Factura proxima a vencer',
          mensaje: `La factura ${f.numero} de ${proveedorNombre} vence el ${new Date(f.fechaVencimiento!).toLocaleDateString('es-AR')} - Saldo: $${f.saldoPendiente}`,
          entidad: 'facturas',
          entidadId: f._id.toString(),
        });
      }
    }

    this.logger.log(`Verificacion de vencimientos: ${facturas.length} facturas proximas a vencer`);
  }
}
