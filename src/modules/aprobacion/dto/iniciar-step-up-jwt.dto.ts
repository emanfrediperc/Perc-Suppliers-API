/**
 * Step-up por JWT: la aprobación se identifica por el :id de la URL y el aprobador
 * por su Bearer token, así que no hace falta ningún campo en el body. Se mantiene el
 * DTO para que el ValidationPipe global (whitelist + forbidNonWhitelisted) rechace
 * cualquier propiedad inesperada en el body.
 */
export class IniciarStepUpJwtDto {}
