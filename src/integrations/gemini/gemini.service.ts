import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface OcrResult {
  success: boolean;
  data?: {
    numero?: string;
    tipo?: string;
    fecha?: string;
    fechaVencimiento?: string;
    montoNeto?: number;
    montoIva?: number;
    montoTotal?: number;
    cuitProveedor?: string;
    razonSocialProveedor?: string;
    cuitCliente?: string;
    razonSocialCliente?: string;
  };
  error?: string;
}

@Injectable()
export class GeminiService {
  private readonly genAI: GoogleGenerativeAI | null;
  private readonly logger = new Logger(GeminiService.name);

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('geminiApiKey');
    this.genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
  }

  async extractFacturaData(fileBuffer: Buffer, mimeType: string): Promise<OcrResult> {
    if (!this.genAI) {
      return { success: false, error: 'GEMINI_API_KEY no configurada' };
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const base64 = fileBuffer.toString('base64');

      const prompt = `Analiza esta factura argentina y extrae los datos en formato JSON.
Responde UNICAMENTE con un JSON valido (sin markdown, sin backticks) con estos campos:
{
  "numero": "numero de factura completo",
  "tipo": "A, B, C, M o E",
  "fecha": "fecha de emision en formato YYYY-MM-DD",
  "fechaVencimiento": "fecha de vencimiento en formato YYYY-MM-DD o null",
  "montoNeto": numero (monto neto sin IVA),
  "montoIva": numero (monto del IVA),
  "montoTotal": numero (monto total con IVA),
  "cuitProveedor": "CUIT del emisor/proveedor sin guiones",
  "razonSocialProveedor": "razon social del emisor",
  "cuitCliente": "CUIT del receptor/cliente sin guiones",
  "razonSocialCliente": "razon social del receptor"
}
Si no puedes leer un campo, usa null. Los montos deben ser numeros, no strings.`;

      const result = await model.generateContent([
        { inlineData: { mimeType, data: base64 } },
        { text: prompt },
      ]);

      const text = result.response.text().trim();
      const jsonStr = text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
      const data = JSON.parse(jsonStr);

      this.logger.log('OCR completado exitosamente');
      return { success: true, data };
    } catch (error) {
      this.logger.error(`Error en OCR: ${error.message}`);
      return { success: false, error: `Error al procesar la factura: ${error.message}` };
    }
  }
}
