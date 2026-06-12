/**
 * Regresion del hallazgo "Swagger UI queda expuesto en produccion (NODE_ENV nunca
 * se setea en el deploy)".
 *
 * El gate previo era `!isProduction || swaggerEnabled` con
 * `isProduction = NODE_ENV === 'production'`. Como el deploy real NUNCA setea
 * NODE_ENV, `isProduction` quedaba `false` y Swagger se montaba en /api/docs para
 * cualquier anonimo. La politica nueva es ALLOW-LIST (fail-closed): apagado por
 * defecto, solo se enciende con opt-in explicito.
 */
import { isSwaggerEnabled } from './swagger-gate.util';

describe('isSwaggerEnabled (gate de Swagger fail-closed)', () => {
  it('ATAQUE BLOQUEADO: NODE_ENV ausente (caso real del deploy) => Swagger APAGADO', () => {
    // Esto es exactamente lo que pasa en el contenedor: NODE_ENV undefined.
    expect(isSwaggerEnabled({})).toBe(false);
  });

  it('NODE_ENV ausente pero SWAGGER_ENABLED tampoco seteado => APAGADO', () => {
    expect(isSwaggerEnabled({ PORT: '3100' } as NodeJS.ProcessEnv)).toBe(false);
  });

  it('NODE_ENV=production sin opt-in => APAGADO', () => {
    expect(isSwaggerEnabled({ NODE_ENV: 'production' })).toBe(false);
  });

  it('NODE_ENV=production NUNCA lo expone aunque SWAGGER_ENABLED tenga un valor truthy distinto de "1"', () => {
    expect(isSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' })).toBe(false);
    expect(isSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: 'yes' })).toBe(false);
    expect(isSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: '0' })).toBe(false);
  });

  it('opt-in explicito SWAGGER_ENABLED=1 => ENCENDIDO (incluso en production)', () => {
    expect(isSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: '1' })).toBe(true);
    expect(isSwaggerEnabled({ SWAGGER_ENABLED: '1' })).toBe(true);
  });

  it('entorno de desarrollo declarado => ENCENDIDO', () => {
    expect(isSwaggerEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(isSwaggerEnabled({ NODE_ENV: 'test' })).toBe(true);
  });

  it('valores arbitrarios de NODE_ENV (staging, qa, etc.) => APAGADO por defecto', () => {
    expect(isSwaggerEnabled({ NODE_ENV: 'staging' })).toBe(false);
    expect(isSwaggerEnabled({ NODE_ENV: 'qa' })).toBe(false);
    expect(isSwaggerEnabled({ NODE_ENV: 'prod' })).toBe(false);
  });
});
