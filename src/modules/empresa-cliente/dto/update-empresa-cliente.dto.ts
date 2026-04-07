import { PartialType } from '@nestjs/swagger';
import { CreateEmpresaClienteDto } from './create-empresa-cliente.dto';

export class UpdateEmpresaClienteDto extends PartialType(CreateEmpresaClienteDto) {}
