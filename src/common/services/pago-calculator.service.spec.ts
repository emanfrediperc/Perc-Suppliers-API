/**
 * Unit tests para PagoCalculatorService.calculate().
 *
 * Logica pura (sin deps): comision por convenio con clamp min/max,
 * descuento, suma de las 5 retenciones, y montoNeto resultante.
 * montoNeto = montoBase - totalRetenciones - comision - descuento
 */
import { PagoCalculatorService } from './pago-calculator.service';

describe('PagoCalculatorService.calculate()', () => {
  const svc = new PagoCalculatorService();

  describe('sin convenio', () => {
    it('comision y descuento en 0; totalRetenciones = suma de las 5', () => {
      const r = svc.calculate(100_000, {
        retencionIIBB: 1000,
        retencionGanancias: 2000,
        retencionIVA: 3000,
        retencionSUSS: 500,
        otrasRetenciones: 500,
      });
      expect(r.comision).toBe(0);
      expect(r.descuento).toBe(0);
      expect(r.porcentajeComision).toBe(0);
      expect(r.porcentajeDescuento).toBe(0);
      expect(r.totalRetenciones).toBe(7000);
      expect(r.montoNeto).toBe(93_000);
    });

    it('convenio null se trata como sin convenio', () => {
      const r = svc.calculate(50_000, { retencionIIBB: 500 }, null);
      expect(r.comision).toBe(0);
      expect(r.totalRetenciones).toBe(500);
      expect(r.montoNeto).toBe(49_500);
    });

    it('retenciones parciales / undefined cuentan como 0', () => {
      const r = svc.calculate(10_000, { retencionIVA: 1000 });
      expect(r.totalRetenciones).toBe(1000);
      expect(r.montoNeto).toBe(9000);
    });

    it('todo en cero: montoNeto = montoBase', () => {
      const r = svc.calculate(80_000, {});
      expect(r.totalRetenciones).toBe(0);
      expect(r.montoNeto).toBe(80_000);
    });
  });

  describe('con convenio', () => {
    it('aplica comision y descuento por porcentaje', () => {
      const r = svc.calculate(100_000, {}, { comisionPorcentaje: 5, descuentoPorcentaje: 2 });
      expect(r.comision).toBeCloseTo(5000, 2);
      expect(r.descuento).toBeCloseTo(2000, 2);
      expect(r.porcentajeComision).toBe(5);
      expect(r.porcentajeDescuento).toBe(2);
      expect(r.montoNeto).toBeCloseTo(93_000, 2);
    });

    it('clampea con comisionMinima', () => {
      const r = svc.calculate(100_000, {}, {
        comisionPorcentaje: 1, // => 1000
        descuentoPorcentaje: 0,
        reglas: { comisionMinima: 1500, comisionMaxima: null },
      });
      expect(r.comision).toBe(1500);
      expect(r.montoNeto).toBeCloseTo(98_500, 2);
    });

    it('clampea con comisionMaxima', () => {
      const r = svc.calculate(100_000, {}, {
        comisionPorcentaje: 10, // => 10000
        descuentoPorcentaje: 0,
        reglas: { comisionMinima: null, comisionMaxima: 8000 },
      });
      expect(r.comision).toBe(8000);
      expect(r.montoNeto).toBeCloseTo(92_000, 2);
    });

    it('reglas con min/max null no clampea', () => {
      const r = svc.calculate(100_000, {}, {
        comisionPorcentaje: 3,
        descuentoPorcentaje: 0,
        reglas: { comisionMinima: null, comisionMaxima: null },
      });
      expect(r.comision).toBeCloseTo(3000, 2);
    });

    it('caso combinado: retenciones + comision + descuento', () => {
      const r = svc.calculate(100_000, {
        retencionIIBB: 1000,
        retencionGanancias: 2000,
        retencionIVA: 3000,
        retencionSUSS: 500,
        otrasRetenciones: 500,
      }, { comisionPorcentaje: 5, descuentoPorcentaje: 2 });
      expect(r.totalRetenciones).toBe(7000);
      expect(r.comision).toBeCloseTo(5000, 2);
      expect(r.descuento).toBeCloseTo(2000, 2);
      // 100000 - 7000 - 5000 - 2000
      expect(r.montoNeto).toBeCloseTo(86_000, 2);
    });
  });

  describe('guard: montoNeto no puede ser negativo', () => {
    it('lanza si la suma de retenciones supera el montoBase', () => {
      expect(() =>
        svc.calculate(100_000, { retencionGanancias: 150_000 }),
      ).toThrow(/monto neto/i);
    });

    it('lanza si retenciones + comision + descuento superan el montoBase', () => {
      expect(() =>
        svc.calculate(
          10_000,
          { retencionIIBB: 9000, retencionIVA: 2000 },
          { comisionPorcentaje: 10, descuentoPorcentaje: 5 },
        ),
      ).toThrow();
    });

    it('montoNeto exactamente 0 es válido (no lanza)', () => {
      const r = svc.calculate(10_000, { retencionIIBB: 10_000 });
      expect(r.montoNeto).toBe(0);
    });
  });
});
