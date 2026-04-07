import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OrdenPago, OrdenPagoDocument } from '../orden-pago/schemas/orden-pago.schema';
import { Factura, FacturaDocument } from '../factura/schemas/factura.schema';
import { EmpresaProveedora, EmpresaProveedoraDocument } from '../empresa-proveedora/schemas/empresa-proveedora.schema';
import { EmpresaCliente, EmpresaClienteDocument } from '../empresa-cliente/schemas/empresa-cliente.schema';
import { escapeRegex } from '../../common/utils/escape-regex';

@Injectable()
export class BusquedaService {
  constructor(
    @InjectModel(OrdenPago.name) private ordenModel: Model<OrdenPagoDocument>,
    @InjectModel(Factura.name) private facturaModel: Model<FacturaDocument>,
    @InjectModel(EmpresaProveedora.name) private provModel: Model<EmpresaProveedoraDocument>,
    @InjectModel(EmpresaCliente.name) private cliModel: Model<EmpresaClienteDocument>,
  ) {}

  async search(query: string, options: { limit?: number; page?: number; type?: string } = {}) {
    if (!query || query.length < 2) return { ordenes: [], facturas: [], proveedores: [], clientes: [], totals: { ordenes: 0, facturas: 0, proveedores: 0, clientes: 0 } };
    const escaped = escapeRegex(query);
    const regex = { $regex: escaped, $options: 'i' };
    const limit = Math.min(options.limit || 10, 50);
    const skip = ((options.page || 1) - 1) * limit;
    const type = options.type;

    const shouldSearch = (t: string) => !type || type === t;

    const [ordenes, facturas, proveedores, clientes, totalOrdenes, totalFacturas, totalProveedores, totalClientes] = await Promise.all([
      shouldSearch('ordenes') ? this.ordenModel.find({ $or: [{ numero: regex }] }).populate('empresaProveedora').sort({ fecha: -1 }).skip(skip).limit(limit).lean() : [],
      shouldSearch('facturas') ? this.facturaModel.find({ $or: [{ numero: regex }] }).populate('empresaProveedora').populate('empresaCliente').sort({ fecha: -1 }).skip(skip).limit(limit).lean() : [],
      shouldSearch('proveedores') ? this.provModel.find({ $or: [{ razonSocial: regex }, { cuit: regex }, { nombreFantasia: regex }, { email: regex }] }).skip(skip).limit(limit).lean() : [],
      shouldSearch('clientes') ? this.cliModel.find({ $or: [{ razonSocial: regex }, { cuit: regex }, { nombreFantasia: regex }, { email: regex }] }).skip(skip).limit(limit).lean() : [],
      shouldSearch('ordenes') ? this.ordenModel.countDocuments({ $or: [{ numero: regex }] }) : 0,
      shouldSearch('facturas') ? this.facturaModel.countDocuments({ $or: [{ numero: regex }] }) : 0,
      shouldSearch('proveedores') ? this.provModel.countDocuments({ $or: [{ razonSocial: regex }, { cuit: regex }, { nombreFantasia: regex }, { email: regex }] }) : 0,
      shouldSearch('clientes') ? this.cliModel.countDocuments({ $or: [{ razonSocial: regex }, { cuit: regex }, { nombreFantasia: regex }, { email: regex }] }) : 0,
    ]);

    return {
      ordenes, facturas, proveedores, clientes,
      totals: { ordenes: totalOrdenes, facturas: totalFacturas, proveedores: totalProveedores, clientes: totalClientes },
    };
  }
}
