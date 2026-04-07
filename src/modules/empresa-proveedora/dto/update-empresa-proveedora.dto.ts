import { PartialType } from '@nestjs/swagger';
import { CreateEmpresaProveedoraDto } from './create-empresa-proveedora.dto';

export class UpdateEmpresaProveedoraDto extends PartialType(CreateEmpresaProveedoraDto) {}
