import { Injectable, BadRequestException } from '@nestjs/common';

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

    if (montoBase < 0) {
      throw new BadRequestException(`El monto base no puede ser negativo ($${montoBase.toFixed(2)}).`);
    }

    if (convenio) {
      porcentajeComision = convenio.comisionPorcentaje;
      porcentajeDescuento = convenio.descuentoPorcentaje;
      // Comisión y descuento son deducciones: nunca pueden sumar al neto a transferir.
      // Un porcentaje negativo (o fuera de [0,100]) convertiría la deducción en un sobrepago.
      if (porcentajeComision < 0 || porcentajeComision > 100) {
        throw new BadRequestException(
          `El porcentaje de comisión del convenio está fuera de rango ([0,100]): ${porcentajeComision}.`,
        );
      }
      if (porcentajeDescuento < 0 || porcentajeDescuento > 100) {
        throw new BadRequestException(
          `El porcentaje de descuento del convenio está fuera de rango ([0,100]): ${porcentajeDescuento}.`,
        );
      }
      comision = montoBase * porcentajeComision / 100;
      descuento = montoBase * porcentajeDescuento / 100;
      if (convenio.reglas) {
        if (convenio.reglas.comisionMinima != null) {
          if (convenio.reglas.comisionMinima < 0) {
            throw new BadRequestException(
              `La comisión mínima del convenio no puede ser negativa: ${convenio.reglas.comisionMinima}.`,
            );
          }
          if (comision < convenio.reglas.comisionMinima) comision = convenio.reglas.comisionMinima;
        }
        if (convenio.reglas.comisionMaxima != null) {
          if (convenio.reglas.comisionMaxima < 0) {
            throw new BadRequestException(
              `La comisión máxima del convenio no puede ser negativa: ${convenio.reglas.comisionMaxima}.`,
            );
          }
          if (comision > convenio.reglas.comisionMaxima) comision = convenio.reglas.comisionMaxima;
        }
      }
    }

    const totalRetenciones = (retenciones.retencionIIBB || 0) + (retenciones.retencionGanancias || 0) +
      (retenciones.retencionIVA || 0) + (retenciones.retencionSUSS || 0) + (retenciones.otrasRetenciones || 0);
    const montoNeto = montoBase - totalRetenciones - comision - descuento;
    if (montoNeto < 0) {
      throw new BadRequestException(
        `El monto neto resultante es negativo ($${montoNeto.toFixed(2)}): la suma de retenciones ($${totalRetenciones.toFixed(2)}), comisión ($${comision.toFixed(2)}) y descuento ($${descuento.toFixed(2)}) supera el monto base ($${montoBase.toFixed(2)}).`,
      );
    }
    // Invariante de integridad: el neto a transferir nunca puede superar la base.
    // Retenciones, comisión y descuento son deducciones; cualquier neto > base implica
    // un sobrepago oculto (p. ej. retenciones/deducciones negativas) y se rechaza.
    if (montoNeto > montoBase) {
      throw new BadRequestException(
        `El monto neto resultante ($${montoNeto.toFixed(2)}) supera el monto base ($${montoBase.toFixed(2)}): las retenciones, comisión o descuento no pueden incrementar el monto a transferir.`,
      );
    }

    return { comision, porcentajeComision, descuento, porcentajeDescuento, totalRetenciones, montoNeto };
  }
}
