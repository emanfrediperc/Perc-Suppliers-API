export default () => ({
  port: parseInt(process.env.PORT || '3100', 10),
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/perc-suppliers',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'perc-suppliers-jwt-secret-dev',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
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
  email: {
    from: process.env.EMAIL_FROM || 'noreply@perc-suppliers.com',
  },
  finnegans: {
    baseUrl: process.env.FINNEGANS_BASE_URL || '',
    authUrl: process.env.FINNEGANS_AUTH_URL || '',
    clientId: process.env.FINNEGANS_CLIENT_ID || '',
    clientSecret: process.env.FINNEGANS_CLIENT_SECRET || '',
  },
});
