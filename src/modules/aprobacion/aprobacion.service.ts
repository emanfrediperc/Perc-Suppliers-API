import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  APROBACION_RESUELTA,
  AprobacionResueltaEvent,
  APROBACION_REENVIADA,
  AprobacionReenviadaEvent,
} from './events/aprobacion-resuelta.event';
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

    // T012 — Flag leído antes para decidir si notifyUsersByRole manda mail o no
    const magicLinkEnabled = this.nestConfigService.get<boolean>('magicLink.enabled');

    // T011 — Notificar a los aprobadores in-app. El mail solo se manda aquí
    // si el magic-link está deshabilitado; si está on, el mail "bonito" con
    // botones lo emite el bloque siguiente y no queremos duplicar.
    await this.notifService.notifyUsersByRole(
      ['aprobador'],
      {
        tipo: 'aprobacion_pendiente',
        titulo: 'Nueva aprobacion pendiente',
        mensaje: `${data.createdByEmail} solicita aprobacion para ${data.tipo} de ${data.entidad} - Monto: $${data.monto.toLocaleString('es-AR')}`,
        entidad: 'aprobaciones',
        entidadId: aprobacion._id.toString(),
      },
      { sendEmail: !magicLinkEnabled },
    );

    // T012 — Generar magic-link tokens y enviar emails a cada aprobador
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

        // Aviso al creador (tesorería) de que su solicitud pasó
        await this.notifService.create({
          usuario: aprobacion.createdBy,
          tipo: 'pago_confirmado',
          titulo: 'Solicitud aprobada',
          mensaje: `Su solicitud de ${aprobacion.tipo} fue aprobada`,
          entidad: aprobacion.entidad,
          entidadId: aprobacion.entidadId,
        });

        // Aviso in-app a los operadores: tienen una operación aprobada lista para ejecutar.
        // sendEmail: false porque no necesitan mail — solo un badge/bell en el webapp.
        const montoFmt = aprobacion.monto != null
          ? `$${aprobacion.monto.toLocaleString('es-AR')}`
          : '';
        await this.notifService.notifyUsersByRole(
          ['operador'],
          {
            tipo: 'aprobacion_para_ejecutar',
            titulo: 'Operación lista para ejecutar',
            mensaje: `Aprobada la ${aprobacion.tipo} de ${aprobacion.entidad}${montoFmt ? ' por ' + montoFmt : ''} — lista para ejecutar`,
            entidad: aprobacion.entidad,
            entidadId: aprobacion.entidadId,
          },
          { sendEmail: false },
        );
      }
    }

    await aprobacion.save();

    // T038 — Auditar rechazo terminal: sólo cuando ya existió al menos un ciclo previo
    // (es decir, la aprobación fue reenviada al menos una vez antes de este rechazo).
    if (decision === 'rechazada' && (aprobacion.intentos?.length ?? 0) > 0) {
      this.auditLogService.log({
        usuario: user.userId,
        usuarioEmail: user.email,
        accion: 'rechazo-terminal',
        entidad: 'aprobaciones',
        entidadId: id,
        cambios: { cicloNumero: (aprobacion.intentos.length + 1) },
        ip: 'system',
        descripcion: `Rechazo terminal tras ${aprobacion.intentos.length} ciclos`,
      }).catch(() => {});
    }

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

    const aprobacionIdStr = tokenDoc.aprobacionId.toString();

    // Delegar al método decidir existente (evita duplicar lógica de transición de estado)
    const aprobacion = await this.decidir(
      aprobacionIdStr,
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
      entidadId: aprobacionIdStr,
      cambios: { decision: decisionInterna, comentario: comentario ?? '' },
      ip,
      descripcion: `${user.email} - decidir-via-token aprobaciones ${aprobacionIdStr}`,
    }).catch(() => {});

    return aprobacion;
  }

  /**
   * T031 — Reenvío tras rechazo.
   * Solo quien creó la solicitud puede reenviarla (decisión a1).
   * Solo una vez (decisión d3): reenviosRestantes arranca en 1 y se decrementa a 0.
   * El ciclo anterior se snapshottea en intentos[] antes de resetear (decisión c1).
   * Los tokens viejos se invalidan ANTES de emitir los nuevos (decisión b).
   *
   * NOTE: unit tests agregados en batch 7.
   */
  async reenviar(
    aprobacionId: string,
    user: { userId: string; email: string; nombre?: string; role?: string },
  ): Promise<AprobacionDocument> {
    const aprobacion = await this.aprobacionModel.findById(aprobacionId);
    if (!aprobacion) throw new NotFoundException('Aprobacion no encontrada');

    // Validación 1: solo el creador (o admin) puede reenviar (decisión a1).
    // Admin puede reenviar cualquier aprobación por ser rol de soporte/override.
    if (user.role !== 'admin' && aprobacion.createdBy !== user.userId) {
      throw new ForbiddenException('Solo quien creó la solicitud puede reenviarla');
    }

    // Validación 2: solo se pueden reenviar aprobaciones rechazadas
    if (aprobacion.estado !== 'rechazada') {
      throw new BadRequestException(
        `Solo se pueden reenviar aprobaciones rechazadas. Estado actual: ${aprobacion.estado}`,
      );
    }

    // Validación 3: reenvíos restantes (decisión d3)
    const reenviosRestantes = aprobacion.reenviosRestantes ?? 1;
    if (reenviosRestantes <= 0) {
      throw new BadRequestException('No quedan reenvíos disponibles para esta solicitud');
    }

    // Validación 4: debe haber al menos un aprobador activo
    const aprobadoresActivos = await this.userModel.find({ role: 'aprobador', activo: true });
    if (aprobadoresActivos.length === 0) {
      throw new BadRequestException(
        'No hay usuarios con rol aprobador activos. No se puede reenviar.',
      );
    }

    // Snapshot del ciclo actual en intentos[] (decisión c1)
    const intentoNumero = (aprobacion.intentos?.length ?? 0) + 1;
    const fechaInicio = aprobacion.intentos?.length
      ? aprobacion.fechaReenvio ?? (aprobacion as any).createdAt
      : (aprobacion as any).createdAt;

    aprobacion.intentos.push({
      numero: intentoNumero,
      aprobadores: [...aprobacion.aprobadores],
      estadoFinal: 'rechazada',
      fechaInicio,
      fechaFin: new Date(),
    } as any);

    // Reset del ciclo para el nuevo intento
    aprobacion.aprobadores = [];
    aprobacion.estado = 'pendiente';
    aprobacion.reenviosRestantes = reenviosRestantes - 1;
    aprobacion.fechaReenvio = new Date();
    aprobacion.reenviadoPor = user.userId;

    await aprobacion.save();

    // Seguridad: invalidar tokens del ciclo anterior ANTES de emitir los nuevos (decisión b)
    await this.tokenService.invalidateAllForAprobacion(aprobacionId);

    // Emitir nuevos tokens y enviar emails a todos los aprobadores activos
    const magicLinkEnabled = this.nestConfigService.get<boolean>('magicLink.enabled');
    if (magicLinkEnabled) {
      const baseUrl =
        this.nestConfigService.get<string>('magicLink.baseUrl') ??
        'http://localhost:4200/aprobar';
      const ttlHours = this.nestConfigService.get<number>('magicLink.ttlHours') ?? 48;

      for (const aprobador of aprobadoresActivos) {
        const aprobadorId = (aprobador._id as any).toString();
        const rawToken = await this.tokenService.issueForAprobador(
          aprobacionId,
          aprobadorId,
          aprobador.email,
        );
        const magicLink = `${baseUrl}?t=${encodeURIComponent(rawToken)}`;
        const expiraEn = new Date(Date.now() + ttlHours * 3_600_000).toLocaleString('es-AR');

        this.emailService
          .sendAprobacionMagicLink(aprobador.email, {
            tipo: aprobacion.tipo,
            entidad: aprobacion.entidad,
            descripcion: aprobacion.descripcion,
            monto: aprobacion.monto,
            solicitante: aprobacion.createdByEmail,
            magicLink,
            expiraEn,
          })
          .catch(() => {});

        // T038 — Auditar emisión de token en el reenvío
        this.auditLogService
          .log({
            usuario: aprobadorId,
            usuarioEmail: aprobador.email,
            accion: 'token-emitido-reenvio',
            entidad: 'aprobaciones',
            entidadId: aprobacionId,
            cambios: { userEmail: aprobador.email, cicloNumero: intentoNumero + 1 },
            ip: 'system',
            descripcion: `Token magic-link emitido (reenvío) para aprobador ${aprobador.email}`,
          })
          .catch(() => {});
      }
    }

    // Notificar a aprobadores in-app (sin mail duplicado si el magic-link está on;
    // el mail bonito lo emitió el bloque de arriba)
    await this.notifService.notifyUsersByRole(
      ['aprobador'],
      {
        tipo: 'aprobacion_reenviada',
        titulo: 'Solicitud reenviada para aprobación',
        mensaje: `${user.email} reenvió su solicitud de ${aprobacion.tipo} de ${aprobacion.entidad}`,
        entidad: 'aprobaciones',
        entidadId: aprobacionId,
      },
      { sendEmail: !magicLinkEnabled },
    );

    // T038 — Auditar la acción de reenvío en sí
    this.auditLogService
      .log({
        usuario: user.userId,
        usuarioEmail: user.email,
        accion: 'aprobacion-reenviada',
        entidad: 'aprobaciones',
        entidadId: aprobacionId,
        cambios: {
          reenviosRestantes: aprobacion.reenviosRestantes,
          cicloNumero: intentoNumero + 1,
        },
        ip: 'system',
        descripcion: `Aprobación reenviada por ${user.email} — ciclo ${intentoNumero + 1}`,
      })
      .catch(() => {});

    // Emitir evento para que los módulos upstream transicionen rechazado → esperando_aprobacion
    this.eventEmitter.emit(APROBACION_REENVIADA, {
      aprobacionId,
      entidad: aprobacion.entidad,
      entidadId: aprobacion.entidadId,
    } as AprobacionReenviadaEvent);

    return aprobacion;
  }

  async countPendientes(): Promise<number> {
    return this.aprobacionModel.countDocuments({ estado: 'pendiente' });
  }

  /**
   * Re-emite tokens magic-link y reenvía los emails a todos los aprobadores
   * activos, SIN avanzar el ciclo. Útil cuando el mail original no llegó
   * (spam, SMTP transient, etc.). La aprobación debe estar en estado
   * 'pendiente'. No confundir con reenviar(): aquel resetea el ciclo
   * después de un rechazo; este solo redispara los mails.
   */
  async resendMagicLinks(
    aprobacionId: string,
    user: { userId: string; email: string },
  ): Promise<{ mensaje: string; destinatarios: number }> {
    const aprobacion = await this.aprobacionModel.findById(aprobacionId);
    if (!aprobacion) throw new NotFoundException('Aprobacion no encontrada');

    if (aprobacion.estado !== 'pendiente') {
      throw new BadRequestException(
        `Solo se puede reenviar el mail mientras la aprobación está pendiente. Estado actual: ${aprobacion.estado}`,
      );
    }

    const magicLinkEnabled = this.nestConfigService.get<boolean>('magicLink.enabled');
    if (!magicLinkEnabled) {
      throw new BadRequestException(
        'El flujo de magic link está deshabilitado (ENABLE_MAGIC_LINK=false). Contactar al admin.',
      );
    }

    const aprobadoresActivos = await this.userModel.find({ role: 'aprobador', activo: true });
    if (aprobadoresActivos.length === 0) {
      throw new BadRequestException('No hay usuarios con rol aprobador activos.');
    }

    const baseUrl = this.nestConfigService.get<string>('magicLink.baseUrl') ?? 'http://localhost:4200/aprobar';
    const ttlHours = this.nestConfigService.get<number>('magicLink.ttlHours') ?? 48;

    for (const aprobador of aprobadoresActivos) {
      const aprobadorId = (aprobador._id as any).toString();
      // issueForAprobador invalida tokens previos del par antes de emitir uno nuevo
      const rawToken = await this.tokenService.issueForAprobador(
        aprobacionId,
        aprobadorId,
        aprobador.email,
      );

      const magicLink = `${baseUrl}?t=${encodeURIComponent(rawToken)}`;
      const expiraEn = new Date(Date.now() + ttlHours * 3_600_000).toLocaleString('es-AR');

      this.emailService.sendAprobacionMagicLink(aprobador.email, {
        tipo: aprobacion.tipo,
        entidad: aprobacion.entidad,
        descripcion: aprobacion.descripcion,
        monto: aprobacion.monto,
        solicitante: aprobacion.createdByEmail,
        magicLink,
        expiraEn,
      }).catch(() => {});

      this.auditLogService.log({
        usuario: aprobadorId,
        usuarioEmail: aprobador.email,
        accion: 'token-emitido',
        entidad: 'aprobaciones',
        entidadId: aprobacionId,
        cambios: { userEmail: aprobador.email, motivo: 'reenvio-mail-manual' },
        ip: 'system',
        descripcion: `Mail magic-link reenviado manualmente por ${user.email} a ${aprobador.email}`,
      }).catch(() => {});
    }

    return {
      mensaje: 'Mail reenviado a los aprobadores',
      destinatarios: aprobadoresActivos.length,
    };
  }

  /**
   * FR-12, FR-14, AD-7 — Obtiene el contexto de una aprobación a partir de un magic-link token.
   * Completamente idempotente: NO escribe en la DB. Puede llamarse N veces sin efectos.
   * Lanza UnauthorizedException genérico en cualquier caso inválido (token, aprobación no pendiente).
   */
  async getContextoToken(rawToken: string): Promise<{
    tipo: string;
    entidad: string;
    descripcion: string;
    monto: number;
    solicitante: string;
    fechaSolicitud: Date;
    expiraEn: Date;
    aprobadorEmail: string;
  }> {
    // Verificar token — lanza UnauthorizedException con mensaje genérico si es inválido/usado/expirado
    const tokenDoc: AprobacionTokenDocument = await this.tokenService.verify(rawToken);

    const aprobacion = await this.aprobacionModel.findById(tokenDoc.aprobacionId);

    // Si la aprobación no está pendiente, el token no es accionable — mismo error genérico
    if (!aprobacion || aprobacion.estado !== 'pendiente') {
      throw new Error('Token inválido o expirado');
    }

    return {
      tipo: aprobacion.tipo,
      entidad: aprobacion.entidad,
      descripcion: aprobacion.descripcion,
      monto: aprobacion.monto,
      solicitante: aprobacion.createdByEmail,
      fechaSolicitud: (aprobacion as any).createdAt,
      expiraEn: tokenDoc.expiresAt,
      aprobadorEmail: tokenDoc.userEmail,
    };
  }
}
