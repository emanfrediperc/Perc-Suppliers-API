import { Controller, Get, Post, Patch, Param, Body, Query, Res, UseGuards, UseInterceptors, UploadedFile, BadRequestException, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiConsumes } from '@nestjs/swagger';
import * as express from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FacturaService } from './factura.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { ExportService, ExportColumn } from '../../common/services/export.service';
import { CreateFacturaDto } from './dto/create-factura.dto';
import { UpdateFacturaDto } from './dto/update-factura.dto';
import { PagarFacturaDto } from './dto/pagar-factura.dto';
import { FacturaQueryDto } from './dto/factura-query.dto';

const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

@ApiTags('Facturas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('facturas')
export class FacturaController {
  constructor(
    private readonly service: FacturaService,
    private readonly storageService: StorageService,
    private readonly exportService: ExportService,
  ) {}

  @Post()
  @Roles('admin', 'tesoreria', 'contabilidad')
  create(@Body() dto: CreateFacturaDto) { return this.service.create(dto); }

  @Get() findAll(@Query() query: FacturaQueryDto) { return this.service.findAll(query); }

  @Get('export')
  async export(@Query() query: FacturaQueryDto, @Query('formato') formato: string, @Res() res: express.Response) {
    const bigQuery = { ...query, page: 1, limit: 10000 };
    const result = await this.service.findAll(bigQuery);
    const columns: ExportColumn[] = [
      { header: 'Numero', key: 'numero', width: 25 },
      { header: 'Tipo', key: 'tipo', width: 8 },
      { header: 'Fecha', key: 'fecha', width: 15, format: (v: any) => v ? new Date(v).toLocaleDateString('es-AR') : '' },
      { header: 'Vencimiento', key: 'fechaVencimiento', width: 15, format: (v: any) => v ? new Date(v).toLocaleDateString('es-AR') : '' },
      { header: 'Proveedor', key: 'empresaProveedora.razonSocial', width: 30 },
      { header: 'Monto Total', key: 'montoTotal', width: 18 },
      { header: 'Pagado', key: 'montoPagado', width: 18 },
      { header: 'Saldo', key: 'saldoPendiente', width: 18 },
      { header: 'Estado', key: 'estado', width: 12 },
    ];
    if (formato === 'csv') {
      const csv = await this.exportService.generateCsv(result.data, columns);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=facturas.csv');
      res.send(csv);
    } else {
      const buffer = await this.exportService.generateExcel(result.data, columns, 'Facturas');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=facturas.xlsx');
      res.send(buffer);
    }
  }

  @Post('import')
  @Roles('admin', 'tesoreria', 'contabilidad')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('archivo'))
  async importFacturas(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Archivo requerido');
    const validMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (!validMimes.includes(file.mimetype)) throw new BadRequestException('Solo se aceptan archivos Excel (.xlsx)');
    return this.service.importFromExcel(file.buffer);
  }

  @Post('upload')
  @Roles('admin', 'tesoreria', 'contabilidad')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('archivo'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    this.validateFile(file);
    return this.service.uploadFile(file);
  }

  @Post('ocr')
  @Roles('admin', 'tesoreria', 'contabilidad')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('archivo'))
  async ocr(@UploadedFile() file: Express.Multer.File) {
    this.validateFile(file);
    return this.service.processOcr(file);
  }

  @Get('check-duplicate')
  checkDuplicate(
    @Query('numero') numero: string,
    @Query('empresaProveedora') empresaProveedora: string,
    @Query('montoTotal') montoTotal?: number,
  ) {
    return this.service.checkDuplicate(numero, empresaProveedora, montoTotal ? +montoTotal : undefined);
  }

  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Get(':id/preview')
  async preview(@Param('id') id: string) {
    const factura = await this.service.findOne(id);
    if (!factura.archivoKey) throw new NotFoundException('La factura no tiene archivo adjunto');
    const url = await this.storageService.getSignedDownloadUrl(factura.archivoKey);
    return { url };
  }

  @Patch(':id')
  @Roles('admin', 'tesoreria', 'contabilidad')
  update(@Param('id') id: string, @Body() dto: UpdateFacturaDto) { return this.service.update(id, dto); }

  @Patch(':id/deactivate')
  @Roles('admin')
  deactivate(@Param('id') id: string) { return this.service.deactivate(id); }

  @Post(':id/pagar')
  @Roles('admin', 'tesoreria')
  pagar(@Param('id') id: string, @Body() dto: PagarFacturaDto) { return this.service.pagar(id, dto); }

  private validateFile(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Archivo requerido');
    if (!ALLOWED_MIMES.includes(file.mimetype)) throw new BadRequestException('Tipo de archivo no permitido. Use PDF, JPG o PNG');
    if (file.size > MAX_SIZE) throw new BadRequestException('El archivo excede el tamaño maximo de 10MB');
  }
}
