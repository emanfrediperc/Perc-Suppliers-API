import { IsString, IsIn, IsOptional, MaxLength } from 'class-validator';

export class DecidirAprobacionDto {
  @IsIn(['aprobada', 'rechazada'])
  decision: string;

  @IsOptional()
  @IsString()
  comentario?: string;

  /**
   * Step-up (path JWT): id del desafío resuelto via
   * POST /aprobaciones/:id/step-up/iniciar + /verificar. Requerido cuando la
   * aprobación exige segundo factor (monto alto / tipo configurado).
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  desafioId?: string;

  /** Proof single-use devuelto por step-up/verificar. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  stepUpProof?: string;
}
