import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  NotFoundException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { Types } from 'mongoose';

import { CompraMonedaExtranjeraService } from './compra-moneda-extranjera.service';
import { CompraMonedaExtranjera } from './schemas/compra-moneda-extranjera.schema';
import { EmpresaCliente } from '../empresa-cliente/schemas/empresa-cliente.schema';
import { EstadoCompraMonedaExtranjera } from './enums/estado-compra.enum';
import { ModalidadCompra } from './enums/modalidad-compra.enum';
import { CreateCompraMonedaExtranjeraDto } from './dto/create-compra-moneda-extranjera.dto';
import { QueryComprasMonedaExtranjeraDto } from './dto/query-compras-moneda-extranjera.dto';
import { AnularCompraMonedaExtranjeraDto } from './dto/anular-compra-moneda-extranjera.dto';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const objectId = (hex = '507f1f77bcf86cd799439011') => new Types.ObjectId(hex);

const EMPRESA_ID = '507f1f77bcf86cd799439011';
const COMPRA_ID = '65abc1234567890abcdef012';
const USER_ID = '65abc1234567890abcdef099';

function makeEmpresa(overrides: Record<string, unknown> = {}) {
  return {
    _id: objectId(EMPRESA_ID),
    razonSocial: 'Acme SA',
    activa: true,
    ...overrides,
  };
}

function makeCompra(overrides: Record<string, unknown> = {}) {
  return {
    _id: objectId(COMPRA_ID),
    fecha: new Date('2026-04-14'),
    modalidad: ModalidadCompra.CABLE,
    empresaCliente: {
      empresaId: objectId(EMPRESA_ID),
      razonSocialCache: 'Acme SA',
    },
    montoUSD: 10000,
    tipoCambio: 1250,
    montoARS: 12500000,
    contraparte: 'Banco Nación',
    comision: 0,
    estado: EstadoCompraMonedaExtranjera.CONFIRMADA,
    creadoPor: objectId(USER_ID),
    anuladoPor: undefined,
    anuladoAt: undefined,
    motivoAnulacion: undefined,
    save: jest.fn(),
    ...overrides,
  };
}

// ─── Mock factories ───────────────────────────────────────────────────────────

function makeMockCompraModel(compra: ReturnType<typeof makeCompra>) {
  // Constructor mock so `new this.model(...)` returns an object with .save()
  const ModelConstructor = jest.fn().mockImplementation(() => ({
    ...compra,
    save: compra.save,
  }));

  Object.assign(ModelConstructor, {
    find: jest.fn(),
    findById: jest.fn(),
    countDocuments: jest.fn(),
  });

  return ModelConstructor;
}

function makeMockClienteModel(empresa: ReturnType<typeof makeEmpresa> | null) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(empresa),
  };

  return {
    findById: jest.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('CompraMonedaExtranjeraService', () => {
  let service: CompraMonedaExtranjeraService;
  let compraModel: ReturnType<typeof makeMockCompraModel>;
  let clienteModel: ReturnType<typeof makeMockClienteModel>;

  async function init(
    empresa: ReturnType<typeof makeEmpresa> | null,
    compra: ReturnType<typeof makeCompra>,
  ) {
    compraModel = makeMockCompraModel(compra);
    clienteModel = makeMockClienteModel(empresa);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompraMonedaExtranjeraService,
        {
          provide: getModelToken(CompraMonedaExtranjera.name),
          useValue: compraModel,
        },
        {
          provide: getModelToken(EmpresaCliente.name),
          useValue: clienteModel,
        },
      ],
    }).compile();

    service = module.get<CompraMonedaExtranjeraService>(CompraMonedaExtranjeraService);
  }

  // ─── create ──────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: CreateCompraMonedaExtranjeraDto = {
      fecha: '2026-04-14',
      modalidad: ModalidadCompra.CABLE,
      empresaClienteId: EMPRESA_ID,
      montoUSD: 10000,
      tipoCambio: 1250,
      montoARS: 12500000,
      contraparte: 'Banco Nación',
    };

    it('happy path — crea la compra y la persiste', async () => {
      const compra = makeCompra();
      compra.save.mockResolvedValue(compra);
      await init(makeEmpresa(), compra);

      const result = await service.create(dto, USER_ID);

      expect(compraModel).toHaveBeenCalledTimes(1);
      expect(compra.save).toHaveBeenCalledTimes(1);
      expect(result.estado).toBe(EstadoCompraMonedaExtranjera.CONFIRMADA);
    });

    it('lanza NotFoundException cuando la empresa no existe', async () => {
      await init(null, makeCompra());

      await expect(service.create(dto, USER_ID)).rejects.toThrow(NotFoundException);
      await expect(service.create(dto, USER_ID)).rejects.toThrow(
        'Empresa cliente no encontrada',
      );
    });

    it('lanza UnprocessableEntityException cuando la empresa está inactiva', async () => {
      await init(makeEmpresa({ activa: false }), makeCompra());

      await expect(service.create(dto, USER_ID)).rejects.toThrow(
        UnprocessableEntityException,
      );
      await expect(service.create(dto, USER_ID)).rejects.toThrow(
        'Empresa cliente inactiva',
      );
    });

    it('usa comision 0 cuando el dto no la incluye', async () => {
      const compra = makeCompra({ comision: 0 });
      compra.save.mockResolvedValue(compra);
      await init(makeEmpresa(), compra);

      const result = await service.create({ ...dto }, USER_ID);

      // El constructor del modelo fue llamado — verificamos que comision=0
      const constructorArg = (compraModel as jest.Mock).mock.calls[0][0];
      expect(constructorArg.comision).toBe(0);
      expect(result).toBeDefined();
    });

    it('pasa comision cuando el dto la provee', async () => {
      const compra = makeCompra({ comision: 500 });
      compra.save.mockResolvedValue(compra);
      await init(makeEmpresa(), compra);

      await service.create({ ...dto, comision: 500 }, USER_ID);

      const constructorArg = (compraModel as jest.Mock).mock.calls[0][0];
      expect(constructorArg.comision).toBe(500);
    });
  });

  // ─── findAll ─────────────────────────────────────────────────────────────

  describe('findAll', () => {
    function setupFindAll(compras: unknown[], total: number) {
      const execFind = jest.fn().mockResolvedValue(compras);
      const execCount = jest.fn().mockResolvedValue(total);

      (compraModel as any).find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: execFind,
      });
      (compraModel as any).countDocuments.mockReturnValue({ exec: execCount });

      return { execFind, execCount };
    }

    beforeEach(async () => {
      await init(makeEmpresa(), makeCompra());
    });

    it('sin filtros — usa page 1, limit 20, sort fecha desc', async () => {
      const compras = [makeCompra()];
      setupFindAll(compras, 1);

      const query: QueryComprasMonedaExtranjeraDto = {};
      const result = await service.findAll(query);

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.totalPages).toBe(1);

      const findChain = (compraModel as any).find.mock.results[0].value;
      expect(findChain.sort).toHaveBeenCalledWith({ fecha: -1 });
      expect(findChain.skip).toHaveBeenCalledWith(0);
      expect(findChain.limit).toHaveBeenCalledWith(20);
    });

    it('filtra por modalidad', async () => {
      setupFindAll([], 0);

      await service.findAll({ modalidad: ModalidadCompra.USD_LOCAL });

      const filterArg = (compraModel as any).find.mock.calls[0][0];
      expect(filterArg.modalidad).toBe(ModalidadCompra.USD_LOCAL);
    });

    it('filtra por estado', async () => {
      setupFindAll([], 0);

      await service.findAll({ estado: EstadoCompraMonedaExtranjera.ANULADA });

      const filterArg = (compraModel as any).find.mock.calls[0][0];
      expect(filterArg.estado).toBe(EstadoCompraMonedaExtranjera.ANULADA);
    });

    it('filtra por empresaClienteId convirtiendo a ObjectId', async () => {
      setupFindAll([], 0);

      await service.findAll({ empresaClienteId: EMPRESA_ID });

      const filterArg = (compraModel as any).find.mock.calls[0][0];
      expect(filterArg['empresaCliente.empresaId']).toBeInstanceOf(Types.ObjectId);
      expect(filterArg['empresaCliente.empresaId'].toString()).toBe(EMPRESA_ID);
    });

    it('aplica $gte y $lte cuando se proveen fechaDesde y fechaHasta', async () => {
      setupFindAll([], 0);

      await service.findAll({
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-12-31',
      });

      const filterArg = (compraModel as any).find.mock.calls[0][0];
      expect(filterArg.fecha.$gte).toEqual(new Date('2026-01-01'));
      expect(filterArg.fecha.$lte).toEqual(new Date('2026-12-31'));
    });

    it('aplica solo $gte cuando no se provee fechaHasta', async () => {
      setupFindAll([], 0);

      await service.findAll({ fechaDesde: '2026-06-01' });

      const filterArg = (compraModel as any).find.mock.calls[0][0];
      expect(filterArg.fecha.$gte).toEqual(new Date('2026-06-01'));
      expect(filterArg.fecha.$lte).toBeUndefined();
    });

    it('limita a 100 cuando limit supera 100', async () => {
      setupFindAll([], 0);

      await service.findAll({ limit: 200 });

      const findChain = (compraModel as any).find.mock.results[0].value;
      expect(findChain.limit).toHaveBeenCalledWith(100);
    });

    it('calcula totalPages correctamente con múltiples páginas', async () => {
      setupFindAll([], 50);

      const result = await service.findAll({ page: 2, limit: 20 });

      expect(result.totalPages).toBe(3);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(20);
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────

  describe('findOne', () => {
    beforeEach(async () => {
      await init(makeEmpresa(), makeCompra());
    });

    it('happy path — retorna la compra cuando existe', async () => {
      const compra = makeCompra();
      (compraModel as any).findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(compra),
      });

      const result = await service.findOne(COMPRA_ID);

      expect((compraModel as any).findById).toHaveBeenCalledWith(COMPRA_ID);
      expect(result).toEqual(compra);
    });

    it('lanza NotFoundException cuando no existe la compra', async () => {
      (compraModel as any).findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.findOne(COMPRA_ID)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(COMPRA_ID)).rejects.toThrow('Compra no encontrada');
    });

    it('lanza BadRequestException con un ObjectId inválido', async () => {
      await expect(service.findOne('no-es-un-id')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── anular ──────────────────────────────────────────────────────────────

  describe('anular', () => {
    const anularDto: AnularCompraMonedaExtranjeraDto = {};

    beforeEach(async () => {
      await init(makeEmpresa(), makeCompra());
    });

    it('happy path — cambia estado a ANULADA y persiste', async () => {
      const compra = makeCompra();
      compra.save.mockResolvedValue({ ...compra, estado: EstadoCompraMonedaExtranjera.ANULADA });
      (compraModel as any).findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(compra),
      });

      const result = await service.anular(COMPRA_ID, anularDto, USER_ID);

      expect(compra.estado).toBe(EstadoCompraMonedaExtranjera.ANULADA);
      expect(compra.anuladoPor).toBeInstanceOf(Types.ObjectId);
      expect(compra.anuladoAt).toBeInstanceOf(Date);
      expect(compra.save).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    it('lanza UnprocessableEntityException si la compra ya está ANULADA', async () => {
      const compra = makeCompra({ estado: EstadoCompraMonedaExtranjera.ANULADA });
      (compraModel as any).findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(compra),
      });

      await expect(service.anular(COMPRA_ID, anularDto, USER_ID)).rejects.toThrow(
        UnprocessableEntityException,
      );
      await expect(service.anular(COMPRA_ID, anularDto, USER_ID)).rejects.toThrow(
        'La compra ya se encuentra anulada',
      );
    });

    it('lanza NotFoundException si la compra no existe', async () => {
      (compraModel as any).findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.anular(COMPRA_ID, anularDto, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('almacena motivoAnulacion cuando se provee motivo', async () => {
      const compra = makeCompra();
      compra.save.mockResolvedValue(compra);
      (compraModel as any).findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(compra),
      });

      await service.anular(COMPRA_ID, { motivo: 'Operación duplicada' }, USER_ID);

      expect(compra.motivoAnulacion).toBe('Operación duplicada');
    });

    it('no asigna motivoAnulacion cuando el dto no trae motivo', async () => {
      const compra = makeCompra({ motivoAnulacion: undefined });
      compra.save.mockResolvedValue(compra);
      (compraModel as any).findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(compra),
      });

      await service.anular(COMPRA_ID, {}, USER_ID);

      expect(compra.motivoAnulacion).toBeUndefined();
    });
  });
});
