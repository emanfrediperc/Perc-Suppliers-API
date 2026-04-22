import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

type EmailMode = 'resend-http' | 'smtp' | 'mock';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private from: string;
  private mode: EmailMode = 'mock';
  private resendApiKey = '';

  constructor(private config: ConfigService) {
    // Default al sandbox de Resend — funciona out-of-the-box con RESEND_API_KEY
    // sin verificación de dominio (pero solo entrega al email del owner de la
    // cuenta de Resend). Para producción real, setear EMAIL_FROM a una dirección
    // de un dominio verificado.
    this.from = this.config.get<string>('email.from') || 'onboarding@resend.dev';

    // Preferir la API HTTP de Resend si está configurada: funciona en entornos
    // donde el SMTP outbound está bloqueado (Railway suele bloquear 25/465/587).
    const resendKey = this.config.get<string>('resend.apiKey');
    if (resendKey) {
      this.resendApiKey = resendKey;
      this.mode = 'resend-http';
      this.logger.log('Email service configured (Resend HTTP API)');
      return;
    }

    // Fallback: SMTP tradicional via nodemailer.
    const host = this.config.get<string>('smtp.host');
    const port = this.config.get<number>('smtp.port');
    const user = this.config.get<string>('smtp.user');
    const pass = this.config.get<string>('smtp.pass');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: port || 587,
        secure: port === 465,
        auth: { user, pass },
      });
      this.mode = 'smtp';
      this.logger.log('Email service configured (SMTP)');
    } else {
      this.logger.warn('Email service not configured (no RESEND_API_KEY and no SMTP credentials). Emails will be logged only.');
    }
  }

  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    if (this.mode === 'mock') {
      this.logger.log(`[EMAIL MOCK] To: ${to} | Subject: ${subject}`);
      return false;
    }

    if (this.mode === 'resend-http') {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.resendApiKey}`,
          },
          body: JSON.stringify({ from: this.from, to, subject, html }),
        });
        if (!res.ok) {
          const body = await res.text();
          this.logger.error(`Resend API ${res.status} for ${to}: ${body}`);
          return false;
        }
        this.logger.log(`Email sent to ${to}: ${subject}`);
        return true;
      } catch (error: any) {
        this.logger.error(`Resend request failed for ${to}: ${error.message}`);
        return false;
      }
    }

    // mode === 'smtp'
    try {
      await this.transporter!.sendMail({ from: this.from, to, subject, html });
      this.logger.log(`Email sent to ${to}: ${subject}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
      return false;
    }
  }

  private escapeHtml(value: string | number | undefined | null): string {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async sendAprobacionPendiente(to: string, data: { solicitante: string; tipo: string; monto: number; entidad: string }) {
    const html = `
      <h2>Nueva Aprobacion Pendiente</h2>
      <p><strong>${this.escapeHtml(data.solicitante)}</strong> solicita aprobacion para <strong>${this.escapeHtml(data.tipo)}</strong>.</p>
      <p>Entidad: ${this.escapeHtml(data.entidad)}</p>
      <p>Monto: <strong>$${this.escapeHtml(data.monto.toLocaleString('es-AR', { minimumFractionDigits: 2 }))}</strong></p>
      <p>Ingrese al sistema para revisar y aprobar/rechazar la solicitud.</p>
    `;
    return this.sendEmail(to, `Aprobacion pendiente - ${data.tipo}`, html);
  }

  async sendPagoConfirmado(to: string, data: { ordenNumero: string; monto: number; proveedor: string }) {
    const html = `
      <h2>Pago Confirmado</h2>
      <p>Se confirmo un pago para la orden <strong>${this.escapeHtml(data.ordenNumero)}</strong>.</p>
      <p>Proveedor: ${this.escapeHtml(data.proveedor)}</p>
      <p>Monto: <strong>$${this.escapeHtml(data.monto.toLocaleString('es-AR', { minimumFractionDigits: 2 }))}</strong></p>
    `;
    return this.sendEmail(to, `Pago confirmado - Orden ${data.ordenNumero}`, html);
  }

  async sendFacturaPorVencer(to: string, data: { facturaNumero: string; proveedor: string; vencimiento: string; saldo: number }) {
    const html = `
      <h2>Factura Proxima a Vencer</h2>
      <p>La factura <strong>${this.escapeHtml(data.facturaNumero)}</strong> de <strong>${this.escapeHtml(data.proveedor)}</strong> vence el <strong>${this.escapeHtml(data.vencimiento)}</strong>.</p>
      <p>Saldo pendiente: <strong>$${this.escapeHtml(data.saldo.toLocaleString('es-AR', { minimumFractionDigits: 2 }))}</strong></p>
    `;
    return this.sendEmail(to, `Factura por vencer - ${data.facturaNumero}`, html);
  }

  /**
   * Envía un magic link de aprobación al aprobador indicado.
   *
   * Nota sobre Referrer-Policy: esta cabecera no se agrega aquí porque aplica
   * al HTML de la PÁGINA del frontend (ruta /aprobar), no al email en sí.
   * El navegador del aprobador abre esa ruta y el meta tag `<meta name="referrer"
   * content="no-referrer">` del WebApp evita que el token sea filtrado por el
   * header Referer al cargar assets de terceros. El servicio de email no tiene
   * nada que hacer al respecto.
   */
  async sendAprobacionMagicLink(
    to: string,
    data: {
      tipo: string;
      entidad: string;
      descripcion: string;
      monto: number;
      solicitante: string;
      magicLink: string;
      expiraEn: string;
    },
  ): Promise<boolean> {
    const montoFormateado = `$${data.monto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
    const entidadLabel = this.formatEntidadLabel(data.entidad);
    const tipoLabel = this.formatTipoLabel(data.tipo);
    const aprobarUrl = `${this.escapeHtml(data.magicLink)}&decision=aprobar`;
    const rechazarUrl = `${this.escapeHtml(data.magicLink)}&decision=rechazar`;

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aprobación pendiente</title>
</head>
<body style="margin: 0; padding: 0; background: #f4f5f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1f2937;">
  <!-- Preheader (texto preview en la lista del inbox) -->
  <div style="display: none; max-height: 0; overflow: hidden;">
    ${this.escapeHtml(tipoLabel)} de ${this.escapeHtml(entidadLabel)} por ${this.escapeHtml(montoFormateado)} esperando tu aprobación.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f4f5f8; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; width: 100%; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(15, 23, 42, 0.06);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding: 28px 32px;">
              <div style="color: rgba(255,255,255,0.82); font-size: 12px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px;">Beethoven</div>
              <div style="color: #ffffff; font-size: 22px; font-weight: 700; line-height: 1.2;">Aprobación pendiente</div>
            </td>
          </tr>

          <!-- Intro + monto destacado -->
          <tr>
            <td style="padding: 28px 32px 8px;">
              <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.55; color: #374151;">
                Hay una solicitud de <strong>${this.escapeHtml(tipoLabel)}</strong> esperando tu decisión.
              </p>
              <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px 20px; text-align: center;">
                <div style="color: #6b7280; font-size: 11px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 4px;">Monto</div>
                <div style="color: #111827; font-size: 30px; font-weight: 700; line-height: 1.1;">${this.escapeHtml(montoFormateado)}</div>
              </div>
            </td>
          </tr>

          <!-- Detalle -->
          <tr>
            <td style="padding: 20px 32px 4px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 14px;">
                <tr>
                  <td style="padding: 10px 0; color: #6b7280; width: 130px;">Tipo</td>
                  <td style="padding: 10px 0; color: #111827; font-weight: 500;">${this.escapeHtml(tipoLabel)}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #6b7280; border-top: 1px solid #f3f4f6;">Entidad</td>
                  <td style="padding: 10px 0; color: #111827; font-weight: 500; border-top: 1px solid #f3f4f6;">${this.escapeHtml(entidadLabel)}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #6b7280; border-top: 1px solid #f3f4f6; vertical-align: top;">Descripción</td>
                  <td style="padding: 10px 0; color: #111827; font-weight: 500; border-top: 1px solid #f3f4f6;">${this.escapeHtml(data.descripcion)}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #6b7280; border-top: 1px solid #f3f4f6;">Solicitante</td>
                  <td style="padding: 10px 0; color: #111827; font-weight: 500; border-top: 1px solid #f3f4f6;">${this.escapeHtml(data.solicitante)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTAs -->
          <tr>
            <td style="padding: 28px 32px 8px;" align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right: 10px;">
                    <a href="${aprobarUrl}" style="display: inline-block; background: #16a34a; color: #ffffff; padding: 13px 28px; border-radius: 10px; text-decoration: none; font-size: 15px; font-weight: 600; box-shadow: 0 2px 6px rgba(22, 163, 74, 0.35);">Aprobar</a>
                  </td>
                  <td style="padding-left: 10px;">
                    <a href="${rechazarUrl}" style="display: inline-block; background: #ffffff; color: #dc2626; padding: 13px 28px; border: 1px solid #fecaca; border-radius: 10px; text-decoration: none; font-size: 15px; font-weight: 600;">Rechazar</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Nota -->
          <tr>
            <td style="padding: 16px 32px 28px;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 1.5; text-align: center;">
                El link expira el <strong style="color: #374151;">${this.escapeHtml(data.expiraEn)}</strong>. Podés decidir también desde la app.
              </p>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; width: 100%; margin-top: 20px;">
          <tr>
            <td style="padding: 0 8px; text-align: center; color: #9ca3af; font-size: 11px; line-height: 1.5;">
              Si no esperabas este correo, podés ignorarlo — la solicitud no se aprobará sin tu acción.<br>
              Beethoven · Aprobaciones
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    return this.sendEmail(to, `Aprobación pendiente · ${entidadLabel} · ${montoFormateado}`, html);
  }

  private formatEntidadLabel(entidad: string): string {
    const map: Record<string, string> = {
      'ordenes-pago': 'Orden de Pago',
      'pagos': 'Pago',
      'prestamos': 'Préstamo',
      'compras-fx': 'Compra FX',
    };
    return map[entidad] ?? entidad;
  }

  private formatTipoLabel(tipo: string): string {
    const map: Record<string, string> = {
      'creacion': 'Creación',
      'pago': 'Pago',
      'anulacion': 'Anulación',
    };
    return map[tipo] ?? tipo;
  }
}
