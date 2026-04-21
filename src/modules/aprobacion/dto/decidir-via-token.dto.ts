import { IsString, IsIn, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';

export class DecidirViaTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsIn(['aprobar', 'rechazar'])
  decision: 'aprobar' | 'rechazar';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comentario?: string;
}
