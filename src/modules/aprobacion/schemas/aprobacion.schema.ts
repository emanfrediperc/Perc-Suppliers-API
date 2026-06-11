import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AprobacionDocument = Aprobacion & Document;

/** Ubicación geográfica aproximada (derivada de la IP / headers de CloudFront). */
@Schema({ _id: false })
export class GeoUbicacion {
  @Prop()
  pais?: string;

  @Prop()
  ciudad?: string;
}

const GeoUbicacionSchema = SchemaFactory.createForClass(GeoUbicacion);

@Schema({ _id: false })
export class DecisionAprobador {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  nombre: string;

  @Prop({ required: true })
  email: string;

  @Prop({ enum: ['pendiente', 'aprobada', 'rechazada'], default: 'pendiente' })
  decision: string;

  @Prop()
  comentario: string;

  @Prop()
  fecha: Date;

  // ── Rastro forense (persistido en la decisión para que sobreviva al TTL del token) ──

  /** IP real del aprobador al decidir. */
  @Prop()
  ip?: string;

  /** User-Agent del aprobador al decidir. */
  @Prop()
  userAgent?: string;

  /** SHA256 del magic-link token usado (null en el path JWT). Liga la decisión al link emitido. */
  @Prop()
  tokenHash?: string;

  /** Ubicación geográfica aproximada del aprobador. */
  @Prop({ type: GeoUbicacionSchema })
  geo?: GeoUbicacion;

  // ── Step-up / segundo factor ─────────────────────────────────────────────

  /** La aprobación exigía segundo factor (monto alto / tipo sensible). */
  @Prop({ default: false })
  stepUpRequerido?: boolean;

  /** El segundo factor fue satisfecho antes de registrar la decisión. */
  @Prop({ default: false })
  stepUpSatisfecho?: boolean;

  /** Factor usado: 'password' | 'totp' (null si no aplicó). */
  @Prop()
  factorStepUp?: string;

  /** Id del desafío de step-up asociado. */
  @Prop()
  desafioId?: string;
}

const DecisionAprobadorSchema = SchemaFactory.createForClass(DecisionAprobador);

/**
 * Snapshot de un ciclo de aprobación completado.
 * Se archiva en `intentos[]` cuando se reenvía una aprobación rechazada.
 */
@Schema({ _id: false })
export class IntentoAprobacion {
  @Prop({ required: true })
  numero: number;

  /** Snapshot de los aprobadores al cierre del ciclo. */
  @Prop({ type: [DecisionAprobadorSchema], default: [] })
  aprobadores: DecisionAprobador[];

  @Prop({ required: true, enum: ['aprobada', 'rechazada', 'pendiente'] })
  estadoFinal: string;

  @Prop({ required: true })
  fechaInicio: Date;

  @Prop()
  fechaFin: Date;
}

const IntentoAprobacionSchema = SchemaFactory.createForClass(IntentoAprobacion);

/**
 * Entrada del historial tamper-evident de la aprobación (cadena de hash + sello RFC 3161).
 * Espeja el patrón de SolicitudPago para dar NO-REPUDIO a la decisión que libera el pago.
 *
 * Mapeo al canonical compartido (HashChainService.canonical lee accion/usuario/motivo/estadoNuevo/fecha):
 *   - `estadoNuevo` = la decisión tomada ('aprobada' | 'rechazada')
 *   - `motivo`      = el comentario
 * Se reusan esos nombres a propósito para NO tocar el servicio de hash compartido
 * (cambiarlo re-hashearía las cadenas de SolicitudPago). Los campos forenses
 * (email/ip/userAgent/tokenHash) NO entran al hash del historial — ya están
 * protegidos en `aprobadores[]` y en la cadena del audit-log.
 */
@Schema({ _id: false })
export class HistorialAprobacion {
  @Prop({ required: true })
  accion: string; // 'crear' | 'decidir' | 'reenviar'

  @Prop({ required: true })
  usuario: string; // userId del actor

  @Prop()
  email?: string;

  @Prop()
  estadoNuevo?: string; // decisión: 'aprobada' | 'rechazada'

  @Prop()
  motivo?: string; // comentario

  @Prop({ required: true })
  fecha: Date;

  // Forense (no entra al hash del historial)
  @Prop()
  ip?: string;

  @Prop()
  userAgent?: string;

  @Prop()
  tokenHash?: string;

  // Cadena tamper-evident + sello RFC 3161
  @Prop({ required: true })
  hash: string;

  @Prop()
  prevHash?: string;

  @Prop()
  tsaToken?: string;

  @Prop()
  tsaError?: string;
}

const HistorialAprobacionSchema =
  SchemaFactory.createForClass(HistorialAprobacion);

@Schema({ timestamps: true, collection: 'aprobaciones' })
export class Aprobacion {
  @Prop({
    required: true,
    enum: ['ordenes-pago', 'pagos', 'prestamos', 'compras-divisas'],
  })
  entidad: string;

  @Prop({ required: true })
  entidadId: string;

  @Prop({ required: true, enum: ['pago', 'anulacion', 'creacion'] })
  tipo: string;

  @Prop({
    required: true,
    enum: ['pendiente', 'aprobada', 'rechazada'],
    default: 'pendiente',
  })
  estado: string;

  @Prop({ type: [DecisionAprobadorSchema], default: [] })
  aprobadores: DecisionAprobador[];

  @Prop({ required: true })
  aprobacionesRequeridas: number;

  @Prop({ required: true })
  monto: number;

  @Prop()
  descripcion: string;

  @Prop({ required: true })
  createdBy: string;

  @Prop({ required: true })
  createdByEmail: string;

  @Prop({ type: Object })
  datosOperacion: Record<string, any>;

  // ── Reenvío fields ──────────────────────────────────────────────────────────

  /** Historial de ciclos de aprobación cerrados (snapshot al momento de reenvío). */
  @Prop({ type: [IntentoAprobacionSchema], default: [] })
  intentos: IntentoAprobacion[];

  /** Cantidad de reenvíos restantes. Por defecto 1 (un solo reenvío habilitado). */
  @Prop({ default: 1 })
  reenviosRestantes: number;

  /** Fecha en que se realizó el último reenvío. */
  @Prop({ type: Date })
  fechaReenvio: Date;

  /** UserId de quien ejecutó el reenvío. */
  @Prop()
  reenviadoPor: string;

  /**
   * Historial tamper-evident de la aprobación (cadena de hash + sello RFC 3161).
   * Append-only: NO se resetea en reenvío (el snapshot por ciclo vive en `intentos[]`).
   */
  @Prop({ type: [HistorialAprobacionSchema], default: [] })
  historial: HistorialAprobacion[];
}

export const AprobacionSchema = SchemaFactory.createForClass(Aprobacion);
AprobacionSchema.index({ estado: 1, createdAt: -1 });
AprobacionSchema.index({ entidad: 1, entidadId: 1 });
