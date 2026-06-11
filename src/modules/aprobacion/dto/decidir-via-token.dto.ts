import {
  IsString,
  IsIn,
  IsOptional,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';

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

  /** Proof emitido por step-up/verificar — requerido sólo si la aprobación exige segundo factor. */
  @IsOptional()
  @IsString()
  stepUpProof?: string;

  /** Id del desafío de step-up asociado al proof. */
  @IsOptional()
  @IsString()
  desafioId?: string;
}
