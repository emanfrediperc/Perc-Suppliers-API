/**
 * Decide si la UI/spec de Swagger (/api/docs) debe montarse.
 *
 * Politica ALLOW-LIST (fail-closed): Swagger queda APAGADO por defecto y solo
 * se habilita con opt-in EXPLICITO. Esto evita el bug previo donde el gate
 * dependia de `NODE_ENV === 'production'` para apagarse: como el deploy real
 * nunca setea NODE_ENV (no esta en docker-compose, Dockerfile ni .env), el gate
 * fallaba ABIERTO y exponia el OpenAPI completo a cualquier anonimo.
 *
 * Se habilita SOLO si:
 *  - SWAGGER_ENABLED === '1'  (opt-in explicito, valido en cualquier entorno), o
 *  - NODE_ENV es un entorno de desarrollo declarado ('development' o 'test').
 *
 * Cualquier otro caso (incluido NODE_ENV ausente/undefined, que es lo que ocurre
 * en el deploy) => Swagger DESHABILITADO.
 */
export function isSwaggerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.SWAGGER_ENABLED === '1') {
    return true;
  }
  const nodeEnv = env.NODE_ENV;
  return nodeEnv === 'development' || nodeEnv === 'test';
}
