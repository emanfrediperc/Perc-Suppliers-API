import { IsString, IsOptional, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO explicito para PATCH /facturas/:id.
 *
 * NO usa PartialType(CreateFacturaDto): eso exponia montoNeto, montoIva,
 * montoTotal, tipo, empresaProveedora, empresaCliente, ordenPago y
 * facturaRelacionada como editables. Con el ValidationPipe global
 * (whitelist + forbidNonWhitelisted) esos campos pasaban porque estaban
 * declarados, permitiendo mass-assignment: inflar el monto facturado sin
 * recalcular saldoPendiente/montoPagado, reasignar el dueno (proveedor/cliente)
 * o cambiar el tipo (semantica de nota de credito) de una factura ya pagada.
 *
 * Aca SOLO se exponen campos seguros de editar (metadatos del documento y
 * fecha de vencimiento). Los campos financieros/ownership/tipo se derivan en
 * create() y solo cambian via flujos controlados (pagar / nota de credito).
 * Con whitelist+forbidNonWhitelisted, cualquier intento de mandar montoTotal,
 * tipo o empresaProveedora ahora es rechazado en el borde (400).
 */
export class UpdateFacturaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() finnegansId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() fechaVencimiento?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() archivoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() archivoKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() archivoNombre?: string;
}
