/**
 * Regresion del mismo hallazgo de "limit sin tope" aplicado al DTO propio de
 * SolicitudPago (no extiende PaginationQueryDto: declara su propio `limit`).
 * Antes tenia `@Min(1)` sin `@Max`, asi que `?limit=99999999` pasaba.
 */
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { SolicitudPagoQueryDto } from './query.dto';
import { MAX_PAGINATION_LIMIT } from '../../../common/dto/pagination-query.dto';

async function validarQuery(query: Record<string, unknown>): Promise<ValidationError[]> {
  const dto = plainToInstance(SolicitudPagoQueryDto, query, {
    enableImplicitConversion: true,
  });
  return validate(dto);
}

const tieneErrorEn = (errors: ValidationError[], prop: string): boolean =>
  errors.some((e) => e.property === prop);

describe('SolicitudPagoQueryDto — tope de limit (regresion DoS)', () => {
  it('ATAQUE BLOQUEADO: limit=99999999 es RECHAZADO', async () => {
    expect(tieneErrorEn(await validarQuery({ limit: '99999999' }), 'limit')).toBe(true);
  });

  it('limit en el tope (100) es ACEPTADO', async () => {
    expect(tieneErrorEn(await validarQuery({ limit: MAX_PAGINATION_LIMIT }), 'limit')).toBe(false);
  });

  it('el error es por @Max', async () => {
    const errors = await validarQuery({ limit: MAX_PAGINATION_LIMIT + 1 });
    const limitError = errors.find((e) => e.property === 'limit');
    expect(Object.keys(limitError?.constraints ?? {})).toContain('max');
  });

  it('limit razonable (20) es ACEPTADO', async () => {
    expect(tieneErrorEn(await validarQuery({ limit: '20' }), 'limit')).toBe(false);
  });
});
