import { IsEnum, IsMongoId } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { EmpresaKind } from '../enums/empresa-kind.enum';

export class EmpresaRefDto {
  @ApiProperty({ example: '65abc1234567890abcdef012' })
  @IsMongoId()
  empresaId: string;

  @ApiProperty({ enum: EmpresaKind, example: EmpresaKind.CLIENTE })
  @IsEnum(EmpresaKind)
  empresaKind: EmpresaKind;
}
