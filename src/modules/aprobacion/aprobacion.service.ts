import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { APROBACION_RESUELTA, AprobacionResueltaEvent } from './events/aprobacion-resuelta.event';
import { Aprobacion, AprobacionDocument } from './schemas/aprobacion.schema';
import { AprobacionTokenService } from './aprobacion-token.service';
import { AprobacionTokenDocument } from './schemas/aprobacion-token.schema';
import { NotificacionService } from '../notificacion/notificacion.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EmailService } from '../../integrations/email/email.service';
import { User, UserDocument } from '../../auth/schemas/user.schema';

@Injectable()
export class AprobacionService {
  constructor(
    @InjectModel(Aprobacion.name) private aprobacionModel: Model<AprobacionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly notifService: NotificacionService,
    private readonly configService: ConfiguracionService,
    private readonly nestConfigService: ConfigService,
    private readonly tokenService: AprobacionTokenService,
    private readonly auditLogService: AuditLogService,
    private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
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
    // T011 — Verificar que existan aprobadores activos antes de crear la solicitud
    const aprobadoresActivos = await this.userModel.find({ role: 'aprobador', activo: true });
    if (aprobadoresActivos.length === 0) {
      throw new BadRequestException(
        'No hay usuarios con rol aprobador activos. No se puede crear la solicitud.',
      );
    }

    const aprobacionesRequeridas = await this.getRequiredApprovals(data.monto);
    const aprobacion = await this.aprobacionModel.create({
      ...data,
      estado: 'pendiente',
      aprobacionesRequeridas,
    });

    // T011 — Notificar a los aprobadores (no a tesoreria)
    await this.notifService.notifyUsersByRole(['aprobador'], {
      tipo: 'aprobacion_pendiente',
      titulo: 'Nueva aprobacion pendiente',
      mensaje: `${data.createdByEmail} solicita aprobacion para ${data.tipo} de ${data.entidad} - Monto: $${data.monto.toLocaleString('es-AR')}`,
      entidad: 'aprobaciones',
      entidadId: aprobacion._id.toString(),
    });

    // T012 — Generar magic-link tokens y enviar emails a cada aprobador
    const magicLinkEnabled = this.nestConfigService.get<boolean>('magicLink.enabled');
    if (magicLinkEnabled) {
      const baseUrl = this.nestConfigService.get<string>('magicLink.baseUrl') ?? 'http://localhost:4200/aprobar';
      const ttlHours = this.nestConfigService.get<number>('magicLink.ttlHours') ?? 48;
      const aprobacionId = aprobacion._id.toString();

      for (const aprobador of aprobadoresActivos) {
        const aprobadorId = (aprobador._id as any).toString();
        const rawToken = await this.tokenService.issueForAprobador(
          aprobacionId,
          aprobadorId,
          aprobador.email,
        );

        const magicLink = `${baseUrl}?t=${encodeURIComponent(rawToken)}`;
        const expiraEn = new Date(Date.now() + ttlHours * 3_600_000).toLocaleString('es-AR');

        // Enviar email (fire-and-forget; el token es la fuente de verdad)
        this.emailService.sendAprobacionMagicLink(aprobador.email, {
          tipo: data.tipo,
          entidad: data.entidad,
          descripcion: data.descripcion,
          monto: data.monto,
          solicitante: data.createdByEmail,
          magicLink,
          expiraEn,
        }).catch(() => {});

        // T021 — Auditar emisión del token
        this.auditLogService.log({
          usuario: aprobadorId,
          usuarioEmail: aprobador.email,
          accion: 'token-emitido',
          entidad: 'aprobaciones',
          entidadId: aprobacionId,
          cambios: { userEmail: aprobador.email },
          ip: 'system',
          descripcion: `Token magic-link emitido para aprobador ${aprobador.email}`,
        }).catch(() => {});
      }
    }

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

    // T020 — Emitir evento cuando la aprobación alcanza un estado terminal.
    // Los módulos upstream escuchan este evento para transicionar sus entidades.
    if (aprobacion.estado === 'aprobada' || aprobacion.estado === 'rechazada') {
      const event: AprobacionResueltaEvent = {
        aprobacionId: aprobacion._id.toString(),
        entidad: aprobacion.entidad as AprobacionResueltaEvent['entidad'],
        entidadId: aprobacion.entidadId,
        estado: aprobacion.estado as 'aprobada' | 'rechazada',
      };
      this.eventEmitter.emit(APROBACION_RESUELTA, event);
    }

    return aprobacion;
  }

  /**
   * T015 — Procesa una decisión de aprobación via magic-link token (flujo sin JWT).
   * El interceptor global de auditoría no corre aquí porque no hay request.user,
   * por eso se llama manualmente a auditLogService.log.
   */
  async decidirViaToken(
    rawToken: string,
    decision: 'aprobar' | 'rechazar',
    comentario: string | undefined,
    ip: string,
    userAgent: string,
  ): Promise<AprobacionDocument> {
    // Verificar token — lanza UnauthorizedException con mensaje genérico si es inválido
    const tokenDoc: AprobacionTokenDocument = await this.tokenService.verify(rawToken);

    // Resolver usuario desde el token
    const user = await this.userModel.findById(tokenDoc.userId);
    if (!user) {
      throw new BadRequestException('Usuario asociado al token no encontrado');
    }

    const userId = (user._id as any).toString();

    // Mapear decision del DTO al valor interno del dominio
    const decisionInterna = decision === 'aprobar' ? 'aprobada' : 'rechazada';

    // Delegar al método decidir existente (evita duplicar lógica de transición de estado)
    const aprobacion = await this.decidir(
      tokenDoc.aprobacionId,
      { userId, email: user.email, nombre: user.nombre },
      decisionInterna,
      comentario,
    );

    // Consumir el token después de que la decisión fue registrada con éxito
    await this.tokenService.consume(tokenDoc, ip, userAgent);

    // T021 — Auditar consumo del token (el interceptor global no corre en rutas sin JWT)
    this.auditLogService.log({
      usuario: userId,
      usuarioEmail: user.email,
      accion: 'decidir-via-token',
      entidad: 'aprobaciones',
      entidadId: tokenDoc.aprobacionId,
      cambios: { decision: decisionInterna, comentario: comentario ?? '' },
      ip,
      descripcion: `${user.email} - decidir-via-token aprobaciones ${tokenDoc.aprobacionId}`,
    }).catch(() => {});

    return aprobacion;
  }

  async countPendientes(): Promise<number> {
    return this.aprobacionModel.countDocuments({ estado: 'pendiente' });
  }
}
