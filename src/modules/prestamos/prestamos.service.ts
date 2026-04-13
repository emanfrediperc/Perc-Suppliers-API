import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { Prestamo, PrestamoDocument } from './schemas/prestamo.schema';
import {
  EmpresaProveedora,
  EmpresaProveedoraDocument,
} from '../empresa-proveedora/schemas/empresa-proveedora.schema';
import {
  EmpresaCliente,
  EmpresaClienteDocument,
} from '../empresa-cliente/schemas/empresa-cliente.schema';
import { CreatePrestamoDto } from './dto/create-prestamo.dto';
import { UpdatePrestamoDto } from './dto/update-prestamo.dto';
import { RenewPrestamoDto } from './dto/renew-prestamo.dto';
import { QueryPrestamosDto } from './dto/query-prestamos.dto';
import { EmpresaRefDto } from './dto/empresa-ref.dto';
import { PrestamoStatus } from './enums/prestamo-status.enum';
import { EmpresaKind } from './enums/empresa-kind.enum';
import { calculateInterest } from './helpers/interest-calculator';
import { escapeRegex } from '../../common/utils/escape-regex';

export interface EmpresaSearchResult {
  id: string;
  kind: EmpresaKind;
  razonSocial: string;
  cuit: string;
}

interface ResolvedEmpresaRef {
  empresaId: Types.ObjectId;
  empresaKind: EmpresaKind;
  razonSocialCache: string;
}

@Injectable()
export class PrestamosService {
  constructor(
    @InjectModel(Prestamo.name) private prestamoModel: Model<PrestamoDocument>,
    @InjectModel(EmpresaProveedora.name)
    private proveedoraModel: Model<EmpresaProveedoraDocument>,
    @InjectModel(EmpresaCliente.name) private clienteModel: Model<EmpresaClienteDocument>,
    @InjectConnection() private connection: Connection,
  ) {}

  private async resolveEmpresaRef(ref: EmpresaRefDto): Promise<ResolvedEmpresaRef> {
    const model: Model<any> =
      ref.empresaKind === EmpresaKind.CLIENTE ? this.clienteModel : this.proveedoraModel;
    const empresa = await model.findById(ref.empresaId).select('razonSocial').lean().exec();
    if (!empresa) {
      throw new BadRequestException(
        `Empresa ${ref.empresaKind} con id ${ref.empresaId} no encontrada`,
      );
    }
    return {
      empresaId: new Types.ObjectId(ref.empresaId),
      empresaKind: ref.empresaKind,
      razonSocialCache: (empresa as { razonSocial: string }).razonSocial,
    };
  }

  private assertDistinctEmpresas(lender: EmpresaRefDto, borrower: EmpresaRefDto): void {
    if (
      lender.empresaId === borrower.empresaId &&
      lender.empresaKind === borrower.empresaKind
    ) {
      throw new BadRequestException('Lender y borrower deben ser empresas distintas');
    }
  }

  async findAll(query: QueryPrestamosDto): Promise<PrestamoDocument[]> {
    const filter: Record<string, unknown> = {};
    if (query.status !== undefined) filter.status = query.status;
    if (query.currency !== undefined) filter.currency = query.currency;
    if (query.vehicle !== undefined) filter.vehicle = query.vehicle;
    if (query.balanceCut !== undefined) filter.balanceCut = query.balanceCut;
    if (query.lenderId) filter['lender.empresaId'] = new Types.ObjectId(query.lenderId);
    if (query.borrowerId) filter['borrower.empresaId'] = new Types.ObjectId(query.borrowerId);
    return this.prestamoModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<PrestamoDocument> {
    const prestamo = await this.prestamoModel.findById(id).exec();
    if (!prestamo) throw new NotFoundException(`Prestamo ${id} no encontrado`);
    return prestamo;
  }

  async create(dto: CreatePrestamoDto): Promise<PrestamoDocument> {
    this.assertDistinctEmpresas(dto.lender, dto.borrower);

    const startDate = new Date(dto.startDate);
    const dueDate = new Date(dto.dueDate);
    if (dueDate.getTime() <= startDate.getTime()) {
      throw new BadRequestException('dueDate debe ser posterior a startDate');
    }

    const [lender, borrower] = await Promise.all([
      this.resolveEmpresaRef(dto.lender),
      this.resolveEmpresaRef(dto.borrower),
    ]);

    const formattedCapital = new Intl.NumberFormat('es-AR').format(dto.capital);
    const historyDetail = `Capital ${formattedCapital} · Tasa ${dto.rate}% · ${dto.vehicle}`;

    const prestamo = new this.prestamoModel({
      lender,
      borrower,
      currency: dto.currency,
      capital: dto.capital,
      rate: dto.rate,
      startDate,
      dueDate,
      vehicle: dto.vehicle,
      balanceCut: dto.balanceCut,
      status: PrestamoStatus.ACTIVE,
      history: [{ date: new Date(), action: 'Creado', detail: historyDetail }],
    });
    return prestamo.save();
  }

  async update(id: string, dto: UpdatePrestamoDto): Promise<PrestamoDocument> {
    const prestamo = await this.findOne(id);

    if (prestamo.status !== PrestamoStatus.ACTIVE) {
      throw new BadRequestException(
        `No se puede editar un préstamo con estado ${prestamo.status}`,
      );
    }

    const changes: string[] = [];

    if (dto.capital !== undefined && dto.capital !== prestamo.capital) {
      changes.push(`Cap: ${prestamo.capital}→${dto.capital}`);
      prestamo.capital = dto.capital;
    }

    if (dto.rate !== undefined && dto.rate !== prestamo.rate) {
      changes.push(`Tasa: ${prestamo.rate}→${dto.rate}`);
      prestamo.rate = dto.rate;
    }

    if (dto.dueDate !== undefined) {
      const newDue = new Date(dto.dueDate);
      if (newDue.getTime() !== new Date(prestamo.dueDate).getTime()) {
        const oldDue = new Date(prestamo.dueDate).toISOString().split('T')[0];
        changes.push(`Venc: ${oldDue}→${dto.dueDate}`);
        prestamo.dueDate = newDue;
      }
    }

    if (dto.vehicle !== undefined && dto.vehicle !== prestamo.vehicle) {
      changes.push(`Vehículo: ${prestamo.vehicle}→${dto.vehicle}`);
      prestamo.vehicle = dto.vehicle;
    }

    if (changes.length === 0) {
      throw new BadRequestException('No se detectaron cambios');
    }

    prestamo.history.push({
      date: new Date(),
      action: 'Editado',
      detail: `${changes.join(' · ')} · Motivo: ${dto.reason}`,
    });

    return prestamo.save();
  }

  async clear(id: string): Promise<PrestamoDocument> {
    const prestamo = await this.findOne(id);

    if (prestamo.status !== PrestamoStatus.ACTIVE) {
      throw new BadRequestException(
        `No se puede cancelar un préstamo con estado ${prestamo.status}`,
      );
    }

    const { interest, total } = calculateInterest(prestamo);
    const fmt = (n: number) =>
      new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);

    prestamo.status = PrestamoStatus.CLEARED;
    prestamo.history.push({
      date: new Date(),
      action: 'Cancelado',
      detail: `Capital ${fmt(prestamo.capital)} + Int ${fmt(interest)} = Total ${fmt(total)}`,
    });

    return prestamo.save();
  }

  async renew(id: string, dto: RenewPrestamoDto): Promise<PrestamoDocument> {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const oldPrestamo = await this.prestamoModel.findById(id).session(session).exec();
      if (!oldPrestamo) throw new NotFoundException(`Prestamo ${id} no encontrado`);

      if (oldPrestamo.status !== PrestamoStatus.ACTIVE) {
        throw new BadRequestException(
          `No se puede renovar un préstamo con estado ${oldPrestamo.status}`,
        );
      }

      const { interest } = calculateInterest(oldPrestamo);
      const newCapital = dto.capital ?? Math.round(oldPrestamo.capital + interest);
      const newStartDate = dto.startDate ? new Date(dto.startDate) : new Date();
      const newDueDate = new Date(dto.dueDate);

      if (newDueDate.getTime() <= newStartDate.getTime()) {
        throw new BadRequestException('dueDate debe ser posterior a startDate');
      }

      oldPrestamo.status = PrestamoStatus.RENEWED;
      oldPrestamo.history.push({
        date: new Date(),
        action: 'Renovado',
        detail: `Renovado → nuevo préstamo`,
      });
      await oldPrestamo.save({ session });

      const formattedCapital = new Intl.NumberFormat('es-AR').format(newCapital);
      const newVehicle = dto.vehicle ?? oldPrestamo.vehicle;
      const newRate = dto.rate ?? oldPrestamo.rate;
      const historyDetail = `Capital ${formattedCapital} · Tasa ${newRate}% · ${newVehicle} (Renovación)`;

      const [newPrestamo] = await this.prestamoModel.create(
        [
          {
            lender: oldPrestamo.lender,
            borrower: oldPrestamo.borrower,
            currency: oldPrestamo.currency,
            balanceCut: oldPrestamo.balanceCut,
            capital: newCapital,
            rate: newRate,
            startDate: newStartDate,
            dueDate: newDueDate,
            vehicle: newVehicle,
            status: PrestamoStatus.ACTIVE,
            renewedFrom: oldPrestamo._id,
            history: [{ date: new Date(), action: 'Creado', detail: historyDetail }],
          },
        ],
        { session },
      );

      await session.commitTransaction();
      return newPrestamo;
    } catch (err) {
      await session.abortTransaction();
      if ((err as Error).name === 'VersionError') {
        throw new ConflictException(
          'El préstamo fue modificado por otro usuario. Recargá e intentá de nuevo.',
        );
      }
      throw err;
    } finally {
      session.endSession();
    }
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.prestamoModel.findByIdAndDelete(id).exec();
    if (!deleted) throw new NotFoundException(`Prestamo ${id} no encontrado`);
  }

  async searchEmpresas(q: string): Promise<EmpresaSearchResult[]> {
    if (!q || q.trim().length < 2) return [];
    const escaped = escapeRegex(q.trim());
    const regex = new RegExp(escaped, 'i');

    // Priority: clientes first (canonical PERC group), then proveedoras (edge case)
    const [clientes, proveedoras] = await Promise.all([
      this.clienteModel
        .find({ razonSocial: regex, activa: true })
        .select('_id razonSocial cuit')
        .limit(10)
        .lean()
        .exec(),
      this.proveedoraModel
        .find({ razonSocial: regex, activa: true })
        .select('_id razonSocial cuit')
        .limit(10)
        .lean()
        .exec(),
    ]);

    return [
      ...clientes.map((c: { _id: Types.ObjectId; razonSocial: string; cuit: string }) => ({
        id: c._id.toString(),
        kind: EmpresaKind.CLIENTE,
        razonSocial: c.razonSocial,
        cuit: c.cuit,
      })),
      ...proveedoras.map((p: { _id: Types.ObjectId; razonSocial: string; cuit: string }) => ({
        id: p._id.toString(),
        kind: EmpresaKind.PROVEEDORA,
        razonSocial: p.razonSocial,
        cuit: p.cuit,
      })),
    ];
  }
}
