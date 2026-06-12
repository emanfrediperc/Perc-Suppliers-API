/**
 * Regresion del hallazgo "Parametro `limit` de paginacion sin tope (@Max) — DoS por
 * agotamiento de memoria con cuenta de bajo privilegio".
 *
 * Antes, `limit` tenia `@Min(1)` pero NO `@Max`, asi que `?limit=99999999` pasaba la
 * validacion y llegaba crudo a Mongoose (.limit(99999999).populate()x3), permitiendo
 * exfiltracion masiva / agotamiento de recursos desde el rol mas bajo (`consulta`).
 *
 * Estos tests reproducen el pipeline real: transform (enableImplicitConversion:true)
 * + validate, igual que el ValidationPipe global de main.ts.
 */
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { PaginationQueryDto, MAX_PAGINATION_LIMIT } from './pagination-query.dto';

/**
 * Replica el ValidationPipe global: transforma el query plano a la clase con
 * conversion implicita y devuelve los errores de validacion.
 */
async function validarQuery(
  query: Record<string, unknown>,
): Promise<ValidationError[]> {
  const dto = plainToInstance(PaginationQueryDto, query, {
    enableImplicitConversion: true,
  });
  return validate(dto);
}

function tieneErrorEn(errors: ValidationError[], prop: string): boolean {
  return errors.some((e) => e.property === prop);
}

describe('PaginationQueryDto — tope de limit (regresion DoS)', () => {
  it('ATAQUE BLOQUEADO: limit=99999999 (string del querystring) es RECHAZADO', async () => {
    const errors = await validarQuery({ limit: '99999999' });
    expect(tieneErrorEn(errors, 'limit')).toBe(true);
  });

  it('ATAQUE BLOQUEADO: limit numerico arbitrariamente grande es RECHAZADO', async () => {
    const errors = await validarQuery({ limit: 1_000_000 });
    expect(tieneErrorEn(errors, 'limit')).toBe(true);
  });

  it('el error de limit es por exceder el maximo (@Max)', async () => {
    const errors = await validarQuery({ limit: MAX_PAGINATION_LIMIT + 1 });
    const limitError = errors.find((e) => e.property === 'limit');
    expect(limitError).toBeDefined();
    expect(Object.keys(limitError!.constraints ?? {})).toContain('max');
  });

  it('limit exactamente en el tope (100) es ACEPTADO', async () => {
    const errors = await validarQuery({ limit: MAX_PAGINATION_LIMIT });
    expect(tieneErrorEn(errors, 'limit')).toBe(false);
  });

  it('limit razonable (20) es ACEPTADO', async () => {
    const errors = await validarQuery({ limit: '20' });
    expect(tieneErrorEn(errors, 'limit')).toBe(false);
  });

  it('limit <= 0 sigue siendo RECHAZADO (@Min)', async () => {
    expect(tieneErrorEn(await validarQuery({ limit: 0 }), 'limit')).toBe(true);
    expect(tieneErrorEn(await validarQuery({ limit: -5 }), 'limit')).toBe(true);
  });

  it('limit no entero (float) es RECHAZADO (@IsInt)', async () => {
    const errors = await validarQuery({ limit: '20.5' });
    expect(tieneErrorEn(errors, 'limit')).toBe(true);
  });

  it('limit no numerico es RECHAZADO', async () => {
    const errors = await validarQuery({ limit: 'abc' });
    expect(tieneErrorEn(errors, 'limit')).toBe(true);
  });

  it('sin limit usa el default (20) y valida OK', async () => {
    const dto = plainToInstance(
      PaginationQueryDto,
      {},
      { enableImplicitConversion: true },
    );
    expect(dto.limit).toBe(20);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('page tambien exige entero positivo (no float, no <= 0)', async () => {
    expect(tieneErrorEn(await validarQuery({ page: 0 }), 'page')).toBe(true);
    expect(tieneErrorEn(await validarQuery({ page: '1.5' }), 'page')).toBe(true);
    expect(tieneErrorEn(await validarQuery({ page: '3' }), 'page')).toBe(false);
  });

  it('MAX_PAGINATION_LIMIT es un tope razonable (100)', () => {
    expect(MAX_PAGINATION_LIMIT).toBe(100);
  });
});
