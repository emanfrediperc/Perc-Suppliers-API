/**
 * Unit tests para ConfiguracionService — validacion de claves de seguridad.
 * Sin la validacion, un admin podia degradar `umbrales_aprobacion` a 0 firmas y
 * desactivar el doble-control de N-firmas. Piso server-side: aprobaciones >= 1.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';

import { ConfiguracionService } from './configuracion.service';
import { Configuracion } from './schemas/configuracion.schema';

describe('ConfiguracionService', () => {
  let service: ConfiguracionService;
  let model: any;

  const valido = {
    montoUmbral: 100000,
    rules: [
      { min: 100000, max: 500000, aprobaciones: 1 },
      { min: 500000, max: null, aprobaciones: 2 },
    ],
  };

  beforeEach(async () => {
    model = {
      findOne: jest.fn(),
      find: jest.fn(),
      findOneAndUpdate: jest.fn().mockResolvedValue({ clave: 'umbrales_aprobacion' }),
    };
    const ref: TestingModule = await Test.createTestingModule({
      providers: [
        ConfiguracionService,
        { provide: getModelToken(Configuracion.name), useValue: model },
      ],
    }).compile();
    service = ref.get(ConfiguracionService);
  });

  describe('set() — validacion de seguridad de umbrales_aprobacion', () => {
    it('persiste una configuracion valida', async () => {
      await service.set('umbrales_aprobacion', valido);
      expect(model.findOneAndUpdate).toHaveBeenCalled();
    });

    it('no valida claves que no son de seguridad', async () => {
      await service.set('otra_clave', { cualquier: 'cosa' });
      expect(model.findOneAndUpdate).toHaveBeenCalled();
    });

    it('rechaza aprobaciones < 1 (piso server-side) y NO persiste', async () => {
      const malo = { ...valido, rules: [{ min: 0, max: null, aprobaciones: 0 }] };
      await expect(service.set('umbrales_aprobacion', malo)).rejects.toThrow(
        BadRequestException,
      );
      expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rechaza aprobaciones no entero', async () => {
      const malo = { ...valido, rules: [{ min: 0, max: null, aprobaciones: 1.5 }] };
      await expect(service.set('umbrales_aprobacion', malo)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rechaza rules vacio', async () => {
      await expect(
        service.set('umbrales_aprobacion', { montoUmbral: 1, rules: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza rules ausente', async () => {
      await expect(
        service.set('umbrales_aprobacion', { montoUmbral: 1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza montoUmbral negativo', async () => {
      await expect(
        service.set('umbrales_aprobacion', { ...valido, montoUmbral: -1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza max <= min', async () => {
      const malo = { ...valido, rules: [{ min: 500000, max: 100000, aprobaciones: 1 }] };
      await expect(service.set('umbrales_aprobacion', malo)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
