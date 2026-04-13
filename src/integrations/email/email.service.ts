import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private from: string;

  constructor(private config: ConfigService) {
    const host = this.config.get<string>('smtp.host');
    const port = this.config.get<number>('smtp.port');
    const user = this.config.get<string>('smtp.user');
    const pass = this.config.get<string>('smtp.pass');
    this.from = this.config.get<string>('email.from') || 'noreply@perc-suppliers.com';

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: port || 587,
        secure: port === 465,
        auth: { user, pass },
      });
      this.logger.log('Email service configured');
    } else {
      this.logger.warn('Email service not configured (SMTP credentials missing). Emails will be logged only.');
    }
  }

  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.transporter) {
      this.logger.log(`[EMAIL MOCK] To: ${to} | Subject: ${subject}`);
      return false;
    }

    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
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
}
