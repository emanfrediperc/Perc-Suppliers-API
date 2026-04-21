import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Aprobacion, AprobacionDocument } from './schemas/aprobacion.schema';
import { NotificacionService } from '../notificacion/notificacion.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';

@Injectable()
export class AprobacionService {
  constructor(
    @InjectModel(Aprobacion.name) private aprobacionModel: Model<AprobacionDocument>,
    private readonly notifService: NotificacionService,
    private readonly configService: ConfiguracionService,
  ) {}

  async requiresApproval(_monto: number): Promise<boolean> {
    // Todas las operaciones requieren aprobación bajo el nuevo workflow.
    // El parámetro monto se mantiene por compat con getRequiredApprovals
    // y posible reintroducción del threshold en el futuro.
    return true;
  }

  async getRequiredApprovals(monto: number): Promise<number> {
    const config = await this.configService.getApprovalConfig();
    const rule = config.rules.find(r => monto >= r.min && monto < (r.max ?? Infinity));
    return rule?.aprobaciones || 1;
  }

  async createAprobacion(data: {
    entidad: string;
    entidadId: string;
    tipo: string;
    monto: number;
    descripcion: string;
    createdBy: string;
    createdByEmail: string;
    datosOperacion?: Record<string, any>;
  }): Promise<AprobacionDocument> {
    const aprobacionesRequeridas = await this.getRequiredApprovals(data.monto);
    const aprobacion = await this.aprobacionModel.create({
      ...data,
      estado: 'pendiente',
      aprobacionesRequeridas,
    });

    await this.notifService.notifyUsersByRole(['admin', 'tesoreria'], {
      tipo: 'aprobacion_pendiente',
      titulo: 'Nueva aprobacion pendiente',
      mensaje: `${data.createdByEmail} solicita aprobacion para ${data.tipo} de ${data.entidad} - Monto: $${data.monto.toLocaleString('es-AR')}`,
      entidad: 'aprobaciones',
      entidadId: aprobacion._id.toString(),
    });

    return aprobacion;
  }

  async findPendientes() {
    return this.aprobacionModel.find({ estado: 'pendiente' }).sort({ createdAt: -1 });
  }

  async findAll() {
    return this.aprobacionModel.find().sort({ createdAt: -1 }).limit(100);
  }

  async findOne(id: string) {
    const aprobacion = await this.aprobacionModel.findById(id);
    if (!aprobacion) throw new NotFoundException('Aprobacion no encontrada');
    return aprobacion;
  }

  async findByEntity(entidad: string, entidadId: string) {
    return this.aprobacionModel.find({ entidad, entidadId }).sort({ createdAt: -1 });
  }

  async decidir(id: string, user: { userId: string; email: string; nombre?: string }, decision: string, comentario?: string) {
    const aprobacion = await this.aprobacionModel.findById(id);
    if (!aprobacion) throw new NotFoundException('Aprobacion no encontrada');
    if (aprobacion.estado !== 'pendiente') throw new BadRequestException('Esta aprobacion ya fue resuelta');

    if (aprobacion.createdBy === user.userId) {
      throw new BadRequestException('No puede aprobar su propia solicitud');
    }

    const alreadyDecided = aprobacion.aprobadores.find(a => a.userId === user.userId);
    if (alreadyDecided) throw new BadRequestException('Ya registró una decision para esta aprobacion');

    aprobacion.aprobadores.push({
      userId: user.userId,
      nombre: user.nombre || user.email,
      email: user.email,
      decision,
      comentario: comentario || '',
      fecha: new Date(),
    });

    if (decision === 'rechazada') {
      aprobacion.estado = 'rechazada';

      await this.notifService.create({
        usuario: aprobacion.createdBy,
        tipo: 'pago_rechazado',
        titulo: 'Solicitud rechazada',
        mensaje: `Su solicitud de ${aprobacion.tipo} fue rechazada por ${user.email}${comentario ? ': ' + comentario : ''}`,
        entidad: aprobacion.entidad,
        entidadId: aprobacion.entidadId,
      });
    } else {
      const aprobaciones = aprobacion.aprobadores.filter(a => a.decision === 'aprobada').length;
      if (aprobaciones >= aprobacion.aprobacionesRequeridas) {
        aprobacion.estado = 'aprobada';

        await this.notifService.create({
          usuario: aprobacion.createdBy,
          tipo: 'pago_confirmado',
          titulo: 'Solicitud aprobada',
          mensaje: `Su solicitud de ${aprobacion.tipo} fue aprobada`,
          entidad: aprobacion.entidad,
          entidadId: aprobacion.entidadId,
        });
      }
    }

    await aprobacion.save();
    return aprobacion;
  }

  async countPendientes(): Promise<number> {
    return this.aprobacionModel.countDocuments({ estado: 'pendiente' });
  }
}
