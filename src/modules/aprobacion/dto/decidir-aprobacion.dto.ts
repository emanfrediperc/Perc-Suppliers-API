import { IsString, IsIn, IsOptional } from 'class-validator';

export class DecidirAprobacionDto {
  @IsIn(['aprobada', 'rechazada'])
  decision: string;

  @IsOptional()
  @IsString()
  comentario?: string;
}
