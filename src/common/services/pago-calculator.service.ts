import { Injectable } from '@nestjs/common';

export interface RetencionesInput {
  retencionIIBB?: number;
  retencionGanancias?: number;
  retencionIVA?: number;
  retencionSUSS?: number;
  otrasRetenciones?: number;
}

export interface ConvenioData {
  comisionPorcentaje: number;
  descuentoPorcentaje: number;
  reglas?: {
    comisionMinima?: number | null;
    comisionMaxima?: number | null;
  };
}

export interface PagoCalculation {
  comision: number;
  porcentajeComision: number;
  descuento: number;
  porcentajeDescuento: number;
  totalRetenciones: number;
  montoNeto: number;
}

@Injectable()
export class PagoCalculatorService {
  calculate(montoBase: number, retenciones: RetencionesInput, convenio?: ConvenioData | null): PagoCalculation {
    let comision = 0, porcentajeComision = 0, descuento = 0, porcentajeDescuento = 0;

    if (convenio) {
      porcentajeComision = convenio.comisionPorcentaje;
      comision = montoBase * porcentajeComision / 100;
      porcentajeDescuento = convenio.descuentoPorcentaje;
      descuento = montoBase * porcentajeDescuento / 100;
      if (convenio.reglas) {
        if (convenio.reglas.comisionMinima != null && comision < convenio.reglas.comisionMinima) comision = convenio.reglas.comisionMinima;
        if (convenio.reglas.comisionMaxima != null && comision > convenio.reglas.comisionMaxima) comision = convenio.reglas.comisionMaxima;
      }
    }

    const totalRetenciones = (retenciones.retencionIIBB || 0) + (retenciones.retencionGanancias || 0) +
      (retenciones.retencionIVA || 0) + (retenciones.retencionSUSS || 0) + (retenciones.otrasRetenciones || 0);
    const montoNeto = montoBase - totalRetenciones - comision - descuento;

    return { comision, porcentajeComision, descuento, porcentajeDescuento, totalRetenciones, montoNeto };
  }
}
