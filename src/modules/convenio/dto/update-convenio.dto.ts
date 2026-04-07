import { PartialType } from '@nestjs/swagger';
import { CreateConvenioDto } from './create-convenio.dto';

export class UpdateConvenioDto extends PartialType(CreateConvenioDto) {}
