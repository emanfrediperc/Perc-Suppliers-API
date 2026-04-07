import { IsString, IsNotEmpty, IsEnum, IsMongoId } from 'class-validator';

export class CreateComentarioDto {
  @IsEnum(['orden-pago', 'factura'])
  entidad: string;

  @IsMongoId()
  entidadId: string;

  @IsString()
  @IsNotEmpty()
  texto: string;
}
