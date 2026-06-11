import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditLogService } from './audit-log.service';
import {
  extraerIp,
  extraerUserAgent,
} from '../../common/utils/request-forense.util';

// Claves cuyo valor NUNCA debe persistirse en el audit log (datos bancarios, credenciales, tokens).
const CLAVES_SENSIBLES =
  /password|secret|token|cbu|datosbancarios|codigo|totp|recuperacion|proof/i;

/** Clona el body redactando recursivamente los valores de claves sensibles. */
function redactarSensible(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactarSensible) as unknown;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj as Record<string, any>)) {
    if (CLAVES_SENSIBLES.test(k)) out[k] = '[REDACTED]';
    else if (v && typeof v === 'object') out[k] = redactarSensible(v);
    else out[k] = v;
  }
  return out;
}

const METHOD_ACTION_MAP: Record<string, string> = {
  POST: 'crear',
  PATCH: 'editar',
  PUT: 'editar',
  DELETE: 'eliminar',
};

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private readonly auditService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    if (method === 'GET') return next.handle();

    const user = request.user;
    if (!user) return next.handle();

    const url: string = request.url;
    const entidad = this.extractEntity(url);
    const entidadId = this.extractEntityId(url);
    let accion = METHOD_ACTION_MAP[method] || method.toLowerCase();

    if (url.includes('/pagar')) accion = 'pagar';
    else if (url.includes('/anular')) accion = 'anular';
    else if (url.includes('/sync-finnegans')) accion = 'sync';
    else if (url.includes('/aprobar')) accion = 'aprobar';
    else if (url.includes('/rechazar')) accion = 'rechazar';
    else if (url.includes('/clear')) accion = 'cancelar';
    else if (url.includes('/renew')) accion = 'renovar';
    else if (url.includes('/ejecutar')) accion = 'ejecutar';
    else if (url.includes('/procesar')) accion = 'procesar';
    else if (url.includes('/cancelar')) accion = 'cancelar';
    else if (url.includes('/reagendar')) accion = 'reagendar';
    else if (url.includes('/revertir')) accion = 'revertir';
    else if (url.includes('/apocrifo-override')) accion = 'apocrifo-override';

    return next.handle().pipe(
      tap({
        next: (result) => {
          const resultId = result?._id?.toString() || result?.id || entidadId;
          this.auditService
            .log({
              usuario: user.userId,
              usuarioEmail: user.email,
              accion,
              entidad,
              entidadId: resultId,
              cambios:
                method === 'PATCH' || method === 'PUT'
                  ? redactarSensible(request.body)
                  : undefined,
              ip: extraerIp(request),
              userAgent: extraerUserAgent(request),
              descripcion: `${user.email} - ${accion} ${entidad}${resultId ? ' ' + resultId : ''}`,
            })
            .catch((e) =>
              this.logger.warn(`audit-log fallo: ${e?.message ?? e}`),
            );
        },
      }),
    );
  }

  private extractEntity(url: string): string {
    const path = url.replace(/^\/api\/v1\//, '').split('?')[0];
    const segments = path.split('/');
    return segments[0] || 'unknown';
  }

  private extractEntityId(url: string): string | undefined {
    const path = url.replace(/^\/api\/v1\//, '').split('?')[0];
    const segments = path.split('/');
    if (segments.length >= 2 && /^[a-f0-9]{24}$/.test(segments[1])) {
      return segments[1];
    }
    return undefined;
  }
}
