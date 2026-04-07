import { PartialType } from '@nestjs/swagger';
import { CreateOrdenPagoDto } from './create-orden-pago.dto';

export class UpdateOrdenPagoDto extends PartialType(CreateOrdenPagoDto) {}
