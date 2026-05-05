import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AfipService } from './afip.service';
import { PadronA5Client } from './padron-a5.client';

describe('AfipService', () => {
  let service: AfipService;
  let padron: { getPersona: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    padron = {
      getPersona: jest.fn().mockResolvedValue({
        cuit: '20123456789',
        razonSocial: 'Test SA',
        estadoClave: 'ACTIVO',
        tipoPersona: 'JURIDICA',
        tipoClave: 'CUIT',
        domicilio: '',
        condicionIva: 'IVA Responsable Inscripto',
        monotributo: null,
        actividades: [],
        fechaInscripcion: null,
        raw: {},
      }),
    };
    config = {
      get: jest.fn((key: string) => {
        const cfg: Record<string, string> = {
          AFIP_CERT_PATH: '/tmp/cert',
          AFIP_KEY_PATH: '/tmp/key',
          AFIP_CUIT_REPRESENTADO: '30123456789',
        };
        return cfg[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AfipService,
        { provide: PadronA5Client, useValue: padron },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<AfipService>(AfipService);
  });

  describe('consultarCuit — CUIT validation', () => {
    it('accepts a valid 11-digit CUIT', async () => {
      const result = await service.consultarCuit('20123456789');
      expect(result).not.toBeNull();
      expect(result?.razonSocial).toBe('Test SA');
      expect(result?.activo).toBe(true);
    });

    it('accepts CUIT with dashes by stripping them', async () => {
      const result = await service.consultarCuit('20-12345678-9');
      expect(result).not.toBeNull();
      expect(padron.getPersona).toHaveBeenCalledWith('20123456789');
    });

    it('throws BadRequestException for CUIT with letters', async () => {
      await expect(service.consultarCuit('2012345678A')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for CUIT with 10 digits', async () => {
      await expect(service.consultarCuit('2012345678')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for CUIT with 12 digits', async () => {
      await expect(service.consultarCuit('201234567890')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for empty CUIT', async () => {
      await expect(service.consultarCuit('')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for CUIT with special characters', async () => {
      await expect(service.consultarCuit('20&foo=bar')).rejects.toThrow(BadRequestException);
    });

    it('returns null when AFIP credentials are missing', async () => {
      config.get.mockReturnValue(undefined);
      const result = await service.consultarCuit('20123456789');
      expect(result).toBeNull();
      expect(padron.getPersona).not.toHaveBeenCalled();
    });
  });
});
