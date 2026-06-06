/**
 * Unit tests para ComentarioService.
 * Nota: create() usa `new this.comentarioModel(...)` → el model se mockea como
 * constructor (jest.fn) con metodos estaticos (find, findByIdAndDelete).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

import { ComentarioService } from './comentario.service';
import { Comentario } from './schemas/comentario.schema';

describe('ComentarioService', () => {
  let service: ComentarioService;
  let model: any;
  let saveMock: jest.Mock;

  beforeEach(async () => {
    saveMock = jest.fn().mockResolvedValue({ _id: 'c1' });
    // Model como constructor: `new model(data)` -> { ...data, save }
    model = jest.fn().mockImplementation((data: any) => ({ ...data, save: saveMock }));
    model.find = jest.fn();
    model.findByIdAndDelete = jest.fn();

    const ref: TestingModule = await Test.createTestingModule({
      providers: [
        ComentarioService,
        { provide: getModelToken(Comentario.name), useValue: model },
      ],
    }).compile();
    service = ref.get(ComentarioService);
  });

  describe('findByEntidad()', () => {
    it('filtra por entidad/entidadId y ordena por fecha desc', async () => {
      const exec = jest.fn().mockResolvedValue([{ _id: 'c1' }]);
      const sort = jest.fn().mockReturnValue({ exec });
      model.find.mockReturnValue({ sort });
      const r = await service.findByEntidad('factura', 'f1');
      expect(model.find).toHaveBeenCalledWith({ entidad: 'factura', entidadId: 'f1' });
      expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(r).toEqual([{ _id: 'c1' }]);
    });
  });

  describe('create()', () => {
    it('setea autorEmail/autorNombre desde el user y persiste', async () => {
      await service.create(
        { entidad: 'factura', entidadId: 'f1', texto: 'nota' } as any,
        { email: 'ana@perc.com', nombre: 'Ana' },
      );
      expect(model).toHaveBeenCalledWith(
        expect.objectContaining({ texto: 'nota', autorEmail: 'ana@perc.com', autorNombre: 'Ana' }),
      );
      expect(saveMock).toHaveBeenCalled();
    });
  });

  describe('delete()', () => {
    it('elimina por id', async () => {
      const exec = jest.fn().mockResolvedValue({ _id: 'c1' });
      model.findByIdAndDelete.mockReturnValue({ exec });
      await service.delete('c1');
      expect(model.findByIdAndDelete).toHaveBeenCalledWith('c1');
      expect(exec).toHaveBeenCalled();
    });
  });
});
