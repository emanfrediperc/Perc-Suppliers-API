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
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Aprobación pendiente</h2>
        <p>Tenés una solicitud de aprobación pendiente que requiere tu acción.</p>

        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 8px; font-weight: bold; width: 40%;">Operación:</td>
            <td style="padding: 8px;">${this.escapeHtml(data.tipo)}</td>
          </tr>
          <tr style="background: #f9f9f9;">
            <td style="padding: 8px; font-weight: bold;">Entidad:</td>
            <td style="padding: 8px;">${this.escapeHtml(data.entidad)}</td>
          </tr>
          <tr>
            <td style="padding: 8px; font-weight: bold;">Descripción:</td>
            <td style="padding: 8px;">${this.escapeHtml(data.descripcion)}</td>
          </tr>
          <tr style="background: #f9f9f9;">
            <td style="padding: 8px; font-weight: bold;">Monto:</td>
            <td style="padding: 8px;"><strong>${this.escapeHtml(montoFormateado)}</strong></td>
          </tr>
          <tr>
            <td style="padding: 8px; font-weight: bold;">Solicitado por:</td>
            <td style="padding: 8px;">${this.escapeHtml(data.solicitante)}</td>
          </tr>
        </table>

        <p style="margin: 24px 0 8px;">Usá los botones a continuación para registrar tu decisión:</p>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${this.escapeHtml(data.magicLink)}&decision=aprobar"
             style="display: inline-block; background-color: #28a745; color: #fff; padding: 12px 32px;
                    border-radius: 4px; text-decoration: none; font-size: 16px; margin-right: 16px;">
            Aprobar
          </a>
          <a href="${this.escapeHtml(data.magicLink)}&decision=rechazar"
             style="display: inline-block; background-color: #dc3545; color: #fff; padding: 12px 32px;
                    border-radius: 4px; text-decoration: none; font-size: 16px;">
            Rechazar
          </a>
        </div>

        <p style="color: #666; font-size: 13px;">
          Este link expira el <strong>${this.escapeHtml(data.expiraEn)}</strong>.
          Si no solicitaste esta notificación, podés ignorar este email.
        </p>
      </div>
    `;
    return this.sendEmail(to, `Aprobación pendiente - ${data.entidad}`, html);
  }
}
