export default () => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters');
  }

  const isProduction = process.env.NODE_ENV === 'production';

  // CBU_ENC_KEY: clave AES-256-GCM (hex de 64 chars / 32 bytes) para cifrar el CBU at-rest.
  // - Si está presente con formato inválido => fallar SIEMPRE al boot (no en runtime en la
  //   primera escritura, como haría parseKey()): el operador se entera al arrancar.
  // - Si falta y estamos en producción => fail-closed: no arrancar guardando el CBU en
  //   plaintext silenciosamente (los datos bancarios son lo más sensible del sistema).
  // - Si falta en dev/test => warning visible (coexistencia plano/cifrado para migración).
  const cbuEncKey = process.env.CBU_ENC_KEY || '';
  const cbuKeyFormatoValido = /^[0-9a-f]{64}$/i.test(cbuEncKey);
  if (cbuEncKey && !cbuKeyFormatoValido) {
    throw new Error(
      'CBU_ENC_KEY inválida: debe ser hex de 64 caracteres (32 bytes) para AES-256-GCM',
    );
  }
  if (!cbuEncKey) {
    if (isProduction) {
      throw new Error(
        'CBU_ENC_KEY must be set in production (hex de 64 chars) — el cifrado at-rest ' +
          'del CBU es obligatorio: arrancar sin key guardaría los datos bancarios en plaintext',
      );
    }
    // eslint-disable-next-line no-console
    console.warn(
      '[CONFIG] CBU_ENC_KEY no seteada — cifrado at-rest del CBU DESACTIVADO: ' +
        'los datos bancarios se guardan en PLAINTEXT. Definí CBU_ENC_KEY (hex de 64 chars) para activarlo.',
    );
  }

  const isLocalStack = !!process.env.AWS_S3_ENDPOINT;
  const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const s3Enabled = isLocalStack || (!!awsAccessKeyId && !!awsSecretAccessKey);

  return {
    port: parseInt(process.env.PORT || '3100', 10),
    database: {
      uri:
        process.env.MONGODB_URI || 'mongodb://localhost:27017/perc-suppliers',
    },
    jwt: {
      secret: jwtSecret,
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    },
    aws: {
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: awsAccessKeyId || 'test',
      secretAccessKey: awsSecretAccessKey || 'test',
      bucket: process.env.AWS_S3_BUCKET || 'perc-suppliers-facturas',
      endpoint: process.env.AWS_S3_ENDPOINT || '',
    },
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
    resend: {
      /**
       * API key de Resend (https://resend.com/api-keys). Si está presente,
       * EmailService usa la API HTTP de Resend en lugar de SMTP. Útil en
       * entornos que bloquean puertos SMTP outbound (Railway, algunos PaaS).
       */
      apiKey: process.env.RESEND_API_KEY || '',
    },
    email: {
      from: process.env.EMAIL_FROM || 'noreply@perc-suppliers.com',
    },
    finnegans: {
      baseUrl: process.env.FINNEGANS_BASE_URL || '',
      authUrl: process.env.FINNEGANS_AUTH_URL || '',
      clientId: process.env.FINNEGANS_CLIENT_ID || '',
      clientSecret: process.env.FINNEGANS_CLIENT_SECRET || '',
    },
    magicLink: {
      /** Habilita la generación de tokens y el envío de magic links por email. */
      enabled: process.env.ENABLE_MAGIC_LINK === 'true',
      /** URL base del frontend donde vive la ruta /aprobar (sin trailing slash). */
      baseUrl:
        process.env.MAGIC_LINK_BASE_URL || 'http://localhost:4200/aprobar',
      /** Horas de validez del token desde su emisión. */
      ttlHours: parseInt(process.env.MAGIC_LINK_TTL_HOURS || '48', 10),
    },
    forensics: {
      /**
       * Cantidad de proxies confiables para resolver la IP real del cliente (Express `trust proxy`).
       * Detrás de AWS CloudFront + ALB el cliente está a 2 hops → poné `2` en producción.
       * En dev local sin proxy usá `0` (req.ip = socket, no spoofeable vía X-Forwarded-For).
       */
      trustProxyHops: parseInt(process.env.TRUST_PROXY_HOPS || '2', 10),
      /**
       * Secreto compartido inyectado por CloudFront en un custom header
       * (CLOUDFRONT_SHARED_SECRET). SÓLO si el request trae este header con el
       * valor correcto se confía en los headers CloudFront-Viewer-* (IP/geo) para
       * el rastro forense. Sin secreto configurado, esos headers se IGNORAN y la
       * IP sale de req.ip (trust proxy, no spoofeable). Evita que un cliente del
       * endpoint público de magic-link envenene la evidencia de no-repudio.
       */
      cloudfrontSharedSecret: process.env.CLOUDFRONT_SHARED_SECRET || '',
    },
    stepUp: {
      /** Master switch del segundo factor en aprobaciones de monto alto. */
      habilitado: process.env.STEP_UP_ENABLED === 'true',
      /** Monto (ARS) a partir del cual se exige segundo factor para aprobar. */
      montoUmbral: parseInt(process.env.STEP_UP_MONTO_UMBRAL || '1000000', 10),
      /** Factor por defecto: 'password' (MVP) o 'totp'. */
      factorPorDefecto:
        (process.env.STEP_UP_FACTOR_DEFAULT as 'password' | 'totp') ||
        'password',
    },
    totp: {
      /**
       * Clave AES-256-GCM para cifrar el secreto TOTP en reposo: hex de 64 chars (32 bytes).
       * Requerida sólo si se habilita TOTP. Vacía => enrolamiento TOTP deshabilitado.
       */
      encKey: process.env.TOTP_ENC_KEY || '',
    },
    cbu: {
      /**
       * Clave AES-256-GCM para cifrar el CBU at-rest: hex de 64 chars (32 bytes).
       * Validada al boot (ver arriba): formato inválido => throw; vacía en producción
       * => throw (fail-closed); vacía en dev/test => warning (plaintext, coexistencia).
       */
      encKey: cbuEncKey,
    },
    audit: {
      /**
       * Clave secreta server-side para el HMAC-SHA256 de la cadena del audit log.
       * Vive FUERA de la base de datos, de modo que un insider con acceso de escritura
       * a `audit_logs` no pueda recomputar la cadena tras editar registros (no tiene el secreto).
       * Si está vacía, la cadena cae a SHA-256 plano (best-effort, NO resiste insiders) —
       * sólo para dev local. Generá una con: openssl rand -hex 32
       */
      hmacKey: process.env.AUDIT_HMAC_KEY || '',
    },
    login2fa: {
      /**
       * Exige TOTP a TODOS los usuarios en el login. Si un usuario no lo tiene
       * configurado, el login lo fuerza a enrolarse. Requiere TOTP_ENC_KEY.
       * Default false para no romper dev local (login normal email+password).
       */
      enabled: process.env.LOGIN_2FA_ENABLED === 'true',
    },
  };
};
