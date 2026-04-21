import { randomBytes } from 'crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Model, Types } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

async function seed() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== '1') {
    throw new Error('Seed no permitido en producción. Seteá ALLOW_SEED=1 para forzar.');
  }
  const seedPassword = process.env.SEED_PASSWORD || randomBytes(9).toString('base64url');

  const app = await NestFactory.createApplicationContext(AppModule);

  const userModel = app.get<Model<any>>(getModelToken('User'));
  const empresaProvModel = app.get<Model<any>>(getModelToken('EmpresaProveedora'));
  const empresaCliModel = app.get<Model<any>>(getModelToken('EmpresaCliente'));
  const convenioModel = app.get<Model<any>>(getModelToken('Convenio'));
  const facturaModel = app.get<Model<any>>(getModelToken('Factura'));
  const ordenPagoModel = app.get<Model<any>>(getModelToken('OrdenPago'));
  const pagoModel = app.get<Model<any>>(getModelToken('Pago'));
  const prestamoModel = app.get<Model<any>>(getModelToken('Prestamo'));

  // Clean all collections
  await Promise.all([
    userModel.deleteMany({}),
    empresaProvModel.deleteMany({}),
    empresaCliModel.deleteMany({}),
    convenioModel.deleteMany({}),
    facturaModel.deleteMany({}),
    ordenPagoModel.deleteMany({}),
    pagoModel.deleteMany({}),
    prestamoModel.deleteMany({}),
  ]);
  console.log('Collections cleaned');

  // ============ USERS ============
  const hashedPassword = await bcrypt.hash(seedPassword, 10);
  await userModel.create({
    email: 'admin@perc.com',
    password: hashedPassword,
    nombre: 'Admin',
    apellido: 'Perc',
    role: 'admin',
    mustChangePassword: true,
  });
  await userModel.create({
    email: 'tesoreria@perc.com',
    password: hashedPassword,
    nombre: 'Laura',
    apellido: 'Tesoreria',
    role: 'tesoreria',
    mustChangePassword: true,
  });
  await userModel.create({
    email: 'operador@perc.com',
    password: hashedPassword,
    nombre: 'Carlos',
    apellido: 'Operador',
    role: 'operador',
    mustChangePassword: true,
  });
  await userModel.create({
    email: 'consulta@perc.com',
    password: hashedPassword,
    nombre: 'Maria',
    apellido: 'Consulta',
    role: 'consulta',
    mustChangePassword: true,
  });
  console.log('\n=== SEED PASSWORD (for all 4 users): ' + seedPassword + ' ===\n');

  // ============ EMPRESAS PROVEEDORAS ============
  const prov1 = await empresaProvModel.create({
    cuit: '30-71234567-9',
    razonSocial: 'Tech Solutions SA',
    nombreFantasia: 'TechSol',
    finnegansId: 'FIN-EMP-001',
    condicionIva: 'Responsable Inscripto',
    direccion: 'Av. Corrientes 1234, CABA',
    telefono: '011-4555-1234',
    email: 'contacto@techsol.com.ar',
    contacto: 'Juan Perez',
    activa: true,
    datosBancarios: { banco: 'Banco Galicia', cbu: '0070999030004123456789', alias: 'TECHSOL.PAGOS' },
  });

  const prov2 = await empresaProvModel.create({
    cuit: '30-71234568-7',
    razonSocial: 'Servicios Globales SRL',
    nombreFantasia: 'ServiGlobal',
    finnegansId: 'FIN-EMP-002',
    condicionIva: 'Responsable Inscripto',
    direccion: 'Av. Santa Fe 4567, CABA',
    telefono: '011-4555-5678',
    email: 'admin@serviglobal.com.ar',
    contacto: 'Maria Garcia',
    activa: true,
    datosBancarios: { banco: 'Banco Nacion', cbu: '0110999030004987654321', alias: 'SERVIGLOBAL.COBROS' },
  });

  const prov3 = await empresaProvModel.create({
    cuit: '30-71234569-5',
    razonSocial: 'Logistica Express SA',
    nombreFantasia: 'LogiExpress',
    finnegansId: 'FIN-EMP-003',
    condicionIva: 'Monotributista',
    direccion: 'Ruta 9 km 45, Pilar',
    telefono: '011-4555-9012',
    email: 'ops@logiexpress.com.ar',
    contacto: 'Carlos Lopez',
    activa: true,
    datosBancarios: { banco: 'Banco Santander', cbu: '0720999030004111222333', alias: 'LOGIEXPRESS.PAGOS' },
  });

  const prov4 = await empresaProvModel.create({
    cuit: '30-71234570-2',
    razonSocial: 'Consultores Asociados SA',
    nombreFantasia: 'ConsultAsoc',
    finnegansId: 'FIN-EMP-004',
    condicionIva: 'Responsable Inscripto',
    direccion: 'Av. Belgrano 800, CABA',
    telefono: '011-4555-3456',
    email: 'info@consultasoc.com.ar',
    contacto: 'Ana Martinez',
    activa: true,
    datosBancarios: { banco: 'Banco BBVA', cbu: '0170999030004555666777', alias: 'CONSULTASOC.PAG' },
  });

  const prov5 = await empresaProvModel.create({
    cuit: '30-71234571-0',
    razonSocial: 'Suministros del Norte SRL',
    nombreFantasia: 'SumiNorte',
    finnegansId: 'FIN-EMP-005',
    condicionIva: 'Responsable Inscripto',
    direccion: 'Ruta 8 km 20, San Miguel',
    telefono: '011-4555-7890',
    email: 'ventas@suminorte.com.ar',
    contacto: 'Roberto Diaz',
    activa: true,
    datosBancarios: { banco: 'Banco Macro', cbu: '0850999030004888999000', alias: 'SUMINORTE.COBR' },
  });

  console.log('5 empresas proveedoras created');

  // ============ EMPRESAS CLIENTES ============
  const cli1 = await empresaCliModel.create({
    cuit: '30-70000001-5', razonSocial: 'Perc Financial SA', nombreFantasia: 'Perc',
    finnegansId: 'FIN-CLI-001', condicionIva: 'Responsable Inscripto',
    direccion: 'Av. del Libertador 6000, CABA', telefono: '011-4555-0001', email: 'finance@perc.com', activa: true,
  });
  const cli2 = await empresaCliModel.create({
    cuit: '30-70000002-3', razonSocial: 'Inversiones del Sur SA', nombreFantasia: 'InverSur',
    finnegansId: 'FIN-CLI-002', condicionIva: 'Responsable Inscripto',
    direccion: 'Av. 9 de Julio 1500, CABA', telefono: '011-4555-0002', email: 'admin@inversur.com.ar', activa: true,
  });
  const cli3 = await empresaCliModel.create({
    cuit: '30-70000003-1', razonSocial: 'Comercio Digital SRL', nombreFantasia: 'ComDig',
    condicionIva: 'Responsable Inscripto',
    direccion: 'Calle Florida 300, CABA', telefono: '011-4555-0003', email: 'info@comdig.com.ar', activa: true,
  });
  const cli4 = await empresaCliModel.create({
    cuit: '30-70000004-9', razonSocial: 'Distribuidora Central SA', nombreFantasia: 'DistriCentral',
    condicionIva: 'Responsable Inscripto',
    direccion: 'Av. Rivadavia 3200, CABA', telefono: '011-4555-0004', email: 'compras@districentral.com.ar', activa: true,
  });
  console.log('4 empresas clientes created');

  // ============ CONVENIOS ============
  const conv1 = await convenioModel.create({
    nombre: 'Convenio Standard', descripcion: 'Convenio estandar con comision del 5% y descuento del 2%',
    comisionPorcentaje: 5, descuentoPorcentaje: 2, empresasProveedoras: [prov1._id],
    reglas: { comisionMinima: 1000, comisionMaxima: 50000, aplicaIVASobreComision: true, diasPago: 30 },
    activo: true, fechaVigencia: daysFromNow(365),
  });
  const conv2 = await convenioModel.create({
    nombre: 'Convenio Premium', descripcion: 'Convenio premium con comision reducida del 3% sin descuento',
    comisionPorcentaje: 3, descuentoPorcentaje: 0, empresasProveedoras: [prov2._id],
    reglas: { comisionMinima: 500, comisionMaxima: 100000, aplicaIVASobreComision: false, diasPago: 15 },
    activo: true, fechaVigencia: daysFromNow(365),
  });
  const conv3 = await convenioModel.create({
    nombre: 'Convenio Basico', descripcion: 'Convenio basico con comision del 8% y descuento del 1%',
    comisionPorcentaje: 8, descuentoPorcentaje: 1, empresasProveedoras: [prov3._id],
    reglas: { comisionMinima: 2000, comisionMaxima: 30000, aplicaIVASobreComision: true, diasPago: 45 },
    activo: true, fechaVigencia: daysFromNow(180),
  });
  const conv4 = await convenioModel.create({
    nombre: 'Convenio Especial Q1', descripcion: 'Convenio especial primer trimestre con comision del 4%',
    comisionPorcentaje: 4, descuentoPorcentaje: 1.5, empresasProveedoras: [prov4._id],
    reglas: { comisionMinima: 800, comisionMaxima: 75000, aplicaIVASobreComision: true, diasPago: 20 },
    activo: true, fechaVigencia: daysFromNow(90),
  });

  // Link convenios to empresas (1 convenio por proveedor max)
  prov1.convenios = [conv1._id]; await prov1.save();
  prov2.convenios = [conv2._id]; await prov2.save();
  prov3.convenios = [conv3._id]; await prov3.save();
  prov4.convenios = [conv4._id]; await prov4.save();
  // prov5 no tiene convenio asignado
  console.log('4 convenios created and linked (1 per proveedor)');

  // ============ ORDENES DE PAGO ============
  const op1 = await ordenPagoModel.create({
    numero: 'OP-2026-001', finnegansId: 'FIN-OP-001', fecha: daysAgo(45),
    empresaProveedora: prov1._id, montoTotal: 485000, moneda: 'ARS', estado: 'pagada', facturas: [],
  });
  const op2 = await ordenPagoModel.create({
    numero: 'OP-2026-002', finnegansId: 'FIN-OP-002', fecha: daysAgo(30),
    empresaProveedora: prov2._id, montoTotal: 720000, moneda: 'ARS', estado: 'parcial', facturas: [],
  });
  const op3 = await ordenPagoModel.create({
    numero: 'OP-2026-003', finnegansId: 'FIN-OP-003', fecha: daysAgo(20),
    empresaProveedora: prov3._id, montoTotal: 310000, moneda: 'ARS', estado: 'pendiente', facturas: [],
  });
  const op4 = await ordenPagoModel.create({
    numero: 'OP-2026-004', finnegansId: 'FIN-OP-004', fecha: daysAgo(15),
    empresaProveedora: prov4._id, montoTotal: 550000, moneda: 'ARS', estado: 'pendiente', facturas: [],
  });
  const op5 = await ordenPagoModel.create({
    numero: 'OP-2026-005', finnegansId: 'FIN-OP-005', fecha: daysAgo(10),
    empresaProveedora: prov1._id, montoTotal: 890000, moneda: 'ARS', estado: 'pendiente', facturas: [],
  });
  const op6 = await ordenPagoModel.create({
    numero: 'OP-2026-006', finnegansId: 'FIN-OP-006', fecha: daysAgo(5),
    empresaProveedora: prov5._id, montoTotal: 275000, moneda: 'ARS', estado: 'pendiente', facturas: [],
  });
  const op7 = await ordenPagoModel.create({
    numero: 'OP-2026-007', finnegansId: 'FIN-OP-007', fecha: daysAgo(60),
    empresaProveedora: prov2._id, montoTotal: 420000, moneda: 'USD', estado: 'pagada', facturas: [],
  });
  const op8 = await ordenPagoModel.create({
    numero: 'OP-2026-008', finnegansId: 'FIN-OP-008', fecha: daysAgo(3),
    empresaProveedora: prov3._id, montoTotal: 195000, moneda: 'ARS', estado: 'pendiente', facturas: [],
  });
  console.log('8 ordenes de pago created');

  // ============ FACTURAS ============
  // Helper to create a factura and link it to its orden
  async function crearFactura(data: any, orden: any) {
    const f = await facturaModel.create(data);
    orden.facturas.push(f._id);
    return f;
  }

  // --- OP1 facturas (pagada) ---
  const f1 = await crearFactura({
    numero: 'FC-A-0001-00000101', finnegansId: 'FIN-F-101', tipo: 'A', fecha: daysAgo(50), fechaVencimiento: daysAgo(20),
    montoNeto: 200000, montoIva: 42000, montoTotal: 242000, moneda: 'ARS',
    empresaProveedora: prov1._id, empresaCliente: cli1._id, ordenPago: op1._id,
    estado: 'pagada', montoPagado: 242000, saldoPendiente: 0,
  }, op1);
  const f2 = await crearFactura({
    numero: 'FC-A-0001-00000102', finnegansId: 'FIN-F-102', tipo: 'A', fecha: daysAgo(48), fechaVencimiento: daysAgo(18),
    montoNeto: 200826, montoIva: 42173, montoTotal: 243000, moneda: 'ARS',
    empresaProveedora: prov1._id, empresaCliente: cli2._id, ordenPago: op1._id,
    estado: 'pagada', montoPagado: 243000, saldoPendiente: 0,
  }, op1);
  await op1.save();

  // --- OP2 facturas (parcial) ---
  const f3 = await crearFactura({
    numero: 'FC-A-0002-00000201', finnegansId: 'FIN-F-201', tipo: 'A', fecha: daysAgo(35), fechaVencimiento: daysAgo(5),
    montoNeto: 300000, montoIva: 63000, montoTotal: 363000, moneda: 'ARS',
    empresaProveedora: prov2._id, empresaCliente: cli1._id, ordenPago: op2._id,
    estado: 'pagada', montoPagado: 363000, saldoPendiente: 0,
  }, op2);
  const f4 = await crearFactura({
    numero: 'FC-A-0002-00000202', finnegansId: 'FIN-F-202', tipo: 'B', fecha: daysAgo(32), fechaVencimiento: daysFromNow(5),
    montoNeto: 295041, montoIva: 61959, montoTotal: 357000, moneda: 'ARS',
    empresaProveedora: prov2._id, empresaCliente: cli3._id, ordenPago: op2._id,
    estado: 'pendiente', montoPagado: 0, saldoPendiente: 357000,
  }, op2);
  await op2.save();

  // --- OP3 facturas (pendiente) ---
  const f5 = await crearFactura({
    numero: 'FC-A-0003-00000301', finnegansId: 'FIN-F-301', tipo: 'A', fecha: daysAgo(22), fechaVencimiento: daysFromNow(8),
    montoNeto: 150000, montoIva: 31500, montoTotal: 181500, moneda: 'ARS',
    empresaProveedora: prov3._id, empresaCliente: cli2._id, ordenPago: op3._id,
    estado: 'pendiente', montoPagado: 0, saldoPendiente: 181500,
  }, op3);
  const f6 = await crearFactura({
    numero: 'FC-B-0003-00000302', finnegansId: 'FIN-F-302', tipo: 'B', fecha: daysAgo(21), fechaVencimiento: daysFromNow(10),
    montoNeto: 128500, montoIva: 0, montoTotal: 128500, moneda: 'ARS',
    empresaProveedora: prov3._id, empresaCliente: cli1._id, ordenPago: op3._id,
    estado: 'pendiente', montoPagado: 0, saldoPendiente: 128500,
  }, op3);
  await op3.save();

  // --- OP4 facturas (pendiente) ---
  const f7 = await crearFactura({
    numero: 'FC-A-0004-00000401', finnegansId: 'FIN-F-401', tipo: 'A', fecha: daysAgo(18), fechaVencimiento: daysFromNow(12),
    montoNeto: 280000, montoIva: 58800, montoTotal: 338800, moneda: 'ARS',
    empresaProveedora: prov4._id, empresaCliente: cli4._id, ordenPago: op4._id,
    estado: 'pendiente', montoPagado: 0, saldoPendiente: 338800,
  }, op4);
  const f8 = await crearFactura({
    numero: 'FC-A-0004-00000402', finnegansId: 'FIN-F-402', tipo: 'A', fecha: daysAgo(16), fechaVencimiento: daysFromNow(15),
    montoNeto: 174545, montoIva: 36655, montoTotal: 211200, moneda: 'ARS',
    empresaProveedora: prov4._id, empresaCliente: cli1._id, ordenPago: op4._id,
    estado: 'pendiente', montoPagado: 0, saldoPendiente: 211200,
  }, op4);
  await op4.save();

  // --- OP5 facturas (pendiente) ---
  const f9 = await crearFactura({
    numero: 'FC-A-0001-00000501', finnegansId: 'FIN-F-501', tipo: 'A', fecha: daysAgo(12), fechaVencimiento: daysFromNow(18),
    montoNeto: 450000, montoIva: 94500, montoTotal: 544500, moneda: 'ARS',
    empresaProveedora: prov1._id, empresaCliente: cli1._id, ordenPago: op5._id,
    estado: 'pendiente', montoPagado: 0, saldoPendiente: 544500,
  }, op5);
  const f10 = await crearFactura({
    numero: 'FC-A-0001-00000502', finnegansId: 'FIN-F-502', tipo: 'A', fecha: daysAgo(11), fechaVencimiento: daysFromNow(20),
    montoNeto: 285124, montoIva: 59876, montoTotal: 345000, moneda: 'ARS',
    empresaProveedora: prov1._id, empresaCliente: cli3._id, ordenPago: op5._id,
    estado: 'pendiente', montoPagado: 0, saldoPendiente: 345000,
  }, op5);
  await op5.save();

  // --- OP6 facturas (pendiente) ---
  const f11 = await crearFactura({
    numero: 'FC-A-0005-00000601', finnegansId: 'FIN-F-601', tipo: 'A', fecha: daysAgo(7), fechaVencimiento: daysFromNow(23),
    montoNeto: 227273, montoIva: 47727, montoTotal: 275000, moneda: 'ARS',
    empresaProveedora: prov5._id, empresaCliente: cli2._id, ordenPago: op6._id,
    estado: 'pendiente', montoPagado: 0, saldoPendiente: 275000,
  }, op6);
  await op6.save();

  // --- OP7 facturas (pagada, USD) ---
  const f12 = await crearFactura({
    numero: 'FC-E-0002-00000701', finnegansId: 'FIN-F-701', tipo: 'E', fecha: daysAgo(65), fechaVencimiento: daysAgo(35),
    montoNeto: 347107, montoIva: 72893, montoTotal: 420000, moneda: 'USD',
    empresaProveedora: prov2._id, empresaCliente: cli4._id, ordenPago: op7._id,
    estado: 'pagada', montoPagado: 420000, saldoPendiente: 0,
  }, op7);
  await op7.save();

  // --- OP8 facturas (pendiente) ---
  const f13 = await crearFactura({
    numero: 'FC-B-0003-00000801', finnegansId: 'FIN-F-801', tipo: 'B', fecha: daysAgo(4), fechaVencimiento: daysFromNow(26),
    montoNeto: 195000, montoIva: 0, montoTotal: 195000, moneda: 'ARS',
    empresaProveedora: prov3._id, empresaCliente: cli1._id, ordenPago: op8._id,
    estado: 'pendiente', montoPagado: 0, saldoPendiente: 195000,
  }, op8);
  await op8.save();

  // Facturas sueltas (sin orden de pago)
  const f14 = await facturaModel.create({
    numero: 'FC-A-0004-00000901', tipo: 'A', fecha: daysAgo(8), fechaVencimiento: daysFromNow(22),
    montoNeto: 85000, montoIva: 17850, montoTotal: 102850, moneda: 'ARS',
    empresaProveedora: prov4._id, empresaCliente: cli2._id,
    estado: 'pendiente', montoPagado: 0, saldoPendiente: 102850,
  });
  const f15 = await facturaModel.create({
    numero: 'FC-C-0005-00001001', tipo: 'C', fecha: daysAgo(2), fechaVencimiento: daysFromNow(28),
    montoNeto: 65000, montoIva: 0, montoTotal: 65000, moneda: 'ARS',
    empresaProveedora: prov5._id, empresaCliente: cli3._id,
    estado: 'pendiente', montoPagado: 0, saldoPendiente: 65000,
  });
  // Factura parcialmente pagada sin OP
  const f16 = await facturaModel.create({
    numero: 'FC-A-0001-00001101', tipo: 'A', fecha: daysAgo(40), fechaVencimiento: daysAgo(10),
    montoNeto: 180000, montoIva: 37800, montoTotal: 217800, moneda: 'ARS',
    empresaProveedora: prov1._id, empresaCliente: cli4._id,
    estado: 'parcial', montoPagado: 100000, saldoPendiente: 117800,
  });
  // Factura anulada
  await facturaModel.create({
    numero: 'FC-A-0002-00001201', tipo: 'A', fecha: daysAgo(55), fechaVencimiento: daysAgo(25),
    montoNeto: 50000, montoIva: 10500, montoTotal: 60500, moneda: 'ARS',
    empresaProveedora: prov2._id, empresaCliente: cli1._id,
    estado: 'anulada', montoPagado: 0, saldoPendiente: 60500,
  });

  console.log('17 facturas created');

  // ============ PAGOS ============
  // Pago unico para OP1 (cubre f1 + f2 = 485000)
  const pago1 = await pagoModel.create({
    ordenPago: op1._id, fechaPago: daysAgo(25), montoBase: 485000,
    retencionIIBB: 9700, retencionGanancias: 14550, retencionIVA: 4850, retencionSUSS: 0, otrasRetenciones: 0,
    comision: 24250, porcentajeComision: 5, descuento: 9700, porcentajeDescuento: 2,
    montoNeto: 421950, medioPago: 'transferencia', referenciaPago: 'TRF-2026-0001',
    observaciones: 'Pago total de la orden OP-2026-001', convenioAplicado: conv1._id, estado: 'confirmado',
  });
  op1.pagos = [pago1._id]; op1.montoPagado = 485000; op1.saldoPendiente = 0; await op1.save();
  f1.pagos = [pago1._id]; await f1.save();
  f2.pagos = [pago1._id]; await f2.save();

  // Pago parcial para OP2 (cubre f3 = 363000, f4 queda pendiente)
  const pago2 = await pagoModel.create({
    ordenPago: op2._id, fechaPago: daysAgo(10), montoBase: 363000,
    retencionIIBB: 7260, retencionGanancias: 10890, retencionIVA: 3630, retencionSUSS: 0, otrasRetenciones: 0,
    comision: 10890, porcentajeComision: 3, descuento: 0, porcentajeDescuento: 0,
    montoNeto: 330330, medioPago: 'transferencia', referenciaPago: 'TRF-2026-0002',
    observaciones: 'Pago parcial de la orden OP-2026-002', convenioAplicado: conv2._id, estado: 'confirmado',
  });
  op2.pagos = [pago2._id]; op2.montoPagado = 363000; op2.saldoPendiente = 357000; await op2.save();
  f3.pagos = [pago2._id]; await f3.save();

  // Pago total para OP7 (cubre f12 = 420000 USD)
  const pago3 = await pagoModel.create({
    ordenPago: op7._id, fechaPago: daysAgo(40), montoBase: 420000,
    retencionIIBB: 0, retencionGanancias: 0, retencionIVA: 0, retencionSUSS: 0, otrasRetenciones: 0,
    comision: 12600, porcentajeComision: 3, descuento: 0, porcentajeDescuento: 0,
    montoNeto: 407400, medioPago: 'transferencia', referenciaPago: 'TRF-2026-USD-001',
    observaciones: 'Pago total de la orden OP-2026-007 en USD', convenioAplicado: conv2._id, estado: 'confirmado',
  });
  op7.pagos = [pago3._id]; op7.montoPagado = 420000; op7.saldoPendiente = 0; await op7.save();
  f12.pagos = [pago3._id]; await f12.save();

  // Pago parcial para factura suelta f16 (sin orden, vinculado directo a factura)
  const pago4 = await pagoModel.create({
    factura: f16._id, fechaPago: daysAgo(20), montoBase: 100000,
    retencionIIBB: 2000, retencionGanancias: 3000, retencionIVA: 1000, retencionSUSS: 0, otrasRetenciones: 0,
    comision: 5000, porcentajeComision: 5, descuento: 2000, porcentajeDescuento: 2,
    montoNeto: 87000, medioPago: 'cheque', referenciaPago: 'CHQ-2026-0001',
    observaciones: 'Pago parcial - primer cuota (factura suelta)', convenioAplicado: conv1._id, estado: 'confirmado',
  });
  f16.pagos = [pago4._id]; await f16.save();

  console.log('4 pagos created (linked to ordenes)');

  // ============ PRESTAMOS ============
  // Helper to build EmpresaRef subdocument from an empresa doc
  const refOf = (doc: any, kind: 'cliente' | 'proveedora') => ({
    empresaId: doc._id,
    empresaKind: kind,
    razonSocialCache: doc.razonSocial,
  });

  // 1. Active USD: Perc Financial → Inversiones del Sur
  await prestamoModel.create({
    lender: refOf(cli1, 'cliente'),
    borrower: refOf(cli2, 'cliente'),
    currency: 'USD',
    capital: 250_000,
    rate: 8,
    startDate: new Date('2025-12-01'),
    dueDate: new Date('2026-06-30'),
    vehicle: 'PAGARE',
    balanceCut: '12-31',
    status: 'ACTIVE',
    history: [{ date: new Date('2025-12-01'), action: 'Creado', detail: 'Capital 250.000 · Tasa 8% · PAGARE' }],
  });

  // 2. Active ARS: Inversiones del Sur → Comercio Digital
  await prestamoModel.create({
    lender: refOf(cli2, 'cliente'),
    borrower: refOf(cli3, 'cliente'),
    currency: 'ARS',
    capital: 150_000_000,
    rate: 45,
    startDate: new Date('2026-01-15'),
    dueDate: new Date('2026-07-15'),
    vehicle: 'TITULOS_ON',
    balanceCut: '12-31',
    status: 'ACTIVE',
    history: [{ date: new Date('2026-01-15'), action: 'Creado', detail: 'Capital 150.000.000 · Tasa 45% · TITULOS_ON' }],
  });

  // 3. Active USDC: Distribuidora Central → Perc Financial
  await prestamoModel.create({
    lender: refOf(cli4, 'cliente'),
    borrower: refOf(cli1, 'cliente'),
    currency: 'USDC',
    capital: 75_000,
    rate: 6,
    startDate: new Date('2026-02-01'),
    dueDate: new Date('2026-08-01'),
    vehicle: 'CRYPTO_UY',
    balanceCut: '06-30',
    status: 'ACTIVE',
    history: [{ date: new Date('2026-02-01'), action: 'Creado', detail: 'Capital 75.000 · Tasa 6% · CRYPTO_UY' }],
  });

  // 4. Cleared ARS: Comercio Digital → Distribuidora Central (saldado)
  await prestamoModel.create({
    lender: refOf(cli3, 'cliente'),
    borrower: refOf(cli4, 'cliente'),
    currency: 'ARS',
    capital: 50_000_000,
    rate: 55,
    startDate: new Date('2025-08-01'),
    dueDate: new Date('2026-02-01'),
    vehicle: 'PAGARE',
    balanceCut: '12-31',
    status: 'CLEARED',
    history: [
      { date: new Date('2025-08-01'), action: 'Creado', detail: 'Capital 50.000.000 · Tasa 55% · PAGARE' },
      { date: new Date('2026-02-01'), action: 'Cancelado', detail: 'Capital 50.000.000,00 + Int 13.863.013,70 = Total 63.863.013,70' },
    ],
  });

  // 5a. Renewed parent ARS: Perc Financial → Comercio Digital
  const renewedParent = await prestamoModel.create({
    lender: refOf(cli1, 'cliente'),
    borrower: refOf(cli3, 'cliente'),
    currency: 'ARS',
    capital: 80_000_000,
    rate: 42,
    startDate: new Date('2025-10-01'),
    dueDate: new Date('2026-04-01'),
    vehicle: 'CVU_TITULOS',
    balanceCut: '12-31',
    status: 'RENEWED',
    history: [
      { date: new Date('2025-10-01'), action: 'Creado', detail: 'Capital 80.000.000 · Tasa 42% · CVU_TITULOS' },
      { date: new Date('2026-04-01'), action: 'Renovado', detail: 'Renovado → nuevo préstamo' },
    ],
  });

  // 5b. Renewed child ACTIVE (capital acumulado del padre + intereses)
  await prestamoModel.create({
    lender: refOf(cli1, 'cliente'),
    borrower: refOf(cli3, 'cliente'),
    currency: 'ARS',
    capital: 96_800_000, // ~80M + 6 meses de interés a 42%
    rate: 45,
    startDate: new Date('2026-04-01'),
    dueDate: new Date('2026-10-01'),
    vehicle: 'CVU_TITULOS',
    balanceCut: '12-31',
    status: 'ACTIVE',
    renewedFrom: renewedParent._id,
    history: [{ date: new Date('2026-04-01'), action: 'Creado', detail: 'Capital 96.800.000 · Tasa 45% · CVU_TITULOS (Renovación)' }],
  });

  // 6. Edge case — cliente ↔ proveedora: Perc Financial → Tech Solutions (proveedor externo)
  await prestamoModel.create({
    lender: refOf(cli1, 'cliente'),
    borrower: refOf(prov1, 'proveedora'),
    currency: 'USD',
    capital: 50_000,
    rate: 5,
    startDate: new Date('2026-01-01'),
    dueDate: new Date('2026-12-31'),
    vehicle: 'PAGARE',
    balanceCut: '12-31',
    status: 'ACTIVE',
    history: [{ date: new Date('2026-01-01'), action: 'Creado', detail: 'Capital 50.000 · Tasa 5% · PAGARE (edge case cliente↔proveedora)' }],
  });

  console.log('7 prestamos created (5 active + 1 cleared + 1 renewed with child)');

  console.log('\n=== SEED COMPLETED ===');
  console.log('Data summary:');
  console.log('  - 4 users (admin/tesoreria/operador/consulta@perc.com / admin123)');
  console.log('  - 5 empresas proveedoras');
  console.log('  - 4 empresas clientes');
  console.log('  - 4 convenios (1 por proveedor max)');
  console.log('  - 8 ordenes de pago');
  console.log('  - 17 facturas (various states)');
  console.log('  - 4 pagos (vinculados a ordenes)');
  console.log('  - 7 prestamos (5 active + 1 cleared + 1 renewed with child)');

  await app.close();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
