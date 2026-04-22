export default () => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters');
  }

  const isLocalStack = !!process.env.AWS_S3_ENDPOINT;
  const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const s3Enabled = isLocalStack || (!!awsAccessKeyId && !!awsSecretAccessKey);

  return {
    port: parseInt(process.env.PORT || '3100', 10),
    database: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/perc-suppliers',
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
      baseUrl: process.env.MAGIC_LINK_BASE_URL || 'http://localhost:4200/aprobar',
      /** Horas de validez del token desde su emisión. */
      ttlHours: parseInt(process.env.MAGIC_LINK_TTL_HOURS || '48', 10),
    },
  };
};
