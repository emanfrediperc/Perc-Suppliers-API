import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AfipService } from './afip.service';

describe('AfipService', () => {
  let service: AfipService;

  beforeEach(async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          Contribuyente: {
            nombre: 'Test SA',
            estadoClave: 'ACTIVO',
            tipoClave: 'CUIT',
            tipoPersona: 'JURIDICA',
            impuestos: [20],
            domicilioFiscal: {},
          },
        }),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [AfipService],
    }).compile();

    service = module.get<AfipService>(AfipService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── CUIT validation ──────────────────────────────────────────────────────

  describe('consultarCuit — CUIT validation', () => {
    it('accepts a valid 11-digit CUIT', async () => {
      const result = await service.consultarCuit('20123456789');

      expect(result).not.toBeNull();
      expect(result?.razonSocial).toBe('Test SA');
    });

    it('accepts CUIT with dashes by stripping them', async () => {
      const result = await service.consultarCuit('20-12345678-9');

      expect(result).not.toBeNull();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('20123456789'),
      );
    });

    it('throws BadRequestException for CUIT with letters', async () => {
      await expect(service.consultarCuit('2012345678A')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for CUIT with 10 digits', async () => {
      await expect(service.consultarCuit('2012345678')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for CUIT with 12 digits', async () => {
      await expect(service.consultarCuit('201234567890')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for empty CUIT', async () => {
      await expect(service.consultarCuit('')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for CUIT with special characters', async () => {
      await expect(service.consultarCuit('20&foo=bar')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
