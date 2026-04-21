# Perc Suppliers API

Backend NestJS 11 con MongoDB (Mongoose 9). Gestiona el ciclo de pagos a proveedores.

## Stack

- **Runtime**: Node 20.19.0, NestJS 11, TypeScript 5.7
- **Database**: MongoDB 7 con Mongoose 9 (requiere replica set `rs0`)
- **Auth**: Passport JWT + bcrypt, 5 roles (admin/tesoreria/aprobador/operador/consulta)
- **Testing**: Jest 30, Supertest para e2e
- **Linting**: ESLint 9 + Prettier 3

## Comandos

```bash
npm run start:dev     # Dev con watch (puerto 3100)
npm run build         # nest build -> dist/
npm run seed          # Carga datos de prueba (5 usuarios, proveedores, facturas, etc.)
npm run test          # Jest unit tests
npm run test:e2e      # Jest e2e tests
npm run lint          # ESLint --fix
```

## Estructura de src/

```
src/
├── main.ts              # Bootstrap: Swagger, CORS, ValidationPipe, Helmet
├── app.module.ts        # Root module
├── seed.ts              # Seeder (ts-node script)
├── config/              # configuration.ts — typed env vars con defaults
├── auth/                # JWT strategy, guards (jwt + roles), decorators, User schema
├── common/              # DTOs compartidos, filtros, utils (CUIT, regex), ExportService, PagoCalculator
├── integrations/
│   ├── afip/            # Lookup CUIT via tangofactura.com (sin credenciales)
│   ├── email/           # Nodemailer via @nestjs-modules/mailer
│   ├── finnegans/       # ERP: servicio real + mock (auto-fallback si no hay config)
│   ├── gemini/          # OCR facturas con Google Gemini 2.0-flash
│   └── storage/         # AWS S3 (soporta endpoint local para MinIO/LocalStack)
└── modules/
    ├── aprobacion/      # Workflow de aprobacion
    ├── audit-log/       # Interceptor global: logea todas las mutaciones
    ├── busqueda/        # Busqueda cross-entity
    ├── comentario/      # Comentarios en entidades
    ├── configuracion/   # Settings (documento singleton en MongoDB)
    ├── convenio/        # Acuerdos comerciales (comision, descuento, reglas)
    ├── dashboard/       # Stats agregadas
    ├── empresa-cliente/ # CRUD empresas clientes
    ├── empresa-proveedora/ # CRUD proveedores (CUIT, datos bancarios)
    ├── factura/         # CRUD + upload + OCR + export + import
    ├── notificacion/    # Notificaciones in-app
    ├── orden-pago/      # Ordenes de pago (agrupan facturas)
    ├── pago/            # Pagos con retenciones y comision
    ├── pago-programado/ # Pagos programados (cron cada hora)
    └── reporte/         # Reportes exportables
```

## Convenciones

- **Patron modular**: cada entidad en su propio modulo con controller + service + schema + DTOs
- **Nombres en espanol**: entidades, campos, endpoints — todo el dominio en castellano
- **API prefix**: `api/v1` (global)
- **Swagger**: disponible en `/api/docs` con Bearer auth
- **Validation**: `class-validator` + `class-transformer` con `ValidationPipe` global (whitelist + forbidNonWhitelisted + transform)
- **Rate limiting**: `ThrottlerGuard` global — 100 req/60s
- **Audit**: `AuditLogInterceptor` logea automaticamente todas las operaciones no-GET
- **Uploads**: Multer en memoria, max 10MB, tipos PDF/JPG/PNG -> S3

## Schemas MongoDB principales

| Schema | Coleccion | Campos clave |
|--------|-----------|-------------|
| User | users | email, password (bcrypt), role, activo |
| EmpresaProveedora | empresas_proveedoras | cuit (unique), razonSocial, finnegansId, datosBancarios |
| EmpresaCliente | empresas_clientes | cuit, razonSocial, finnegansId |
| Convenio | convenios | comisionPorcentaje, descuentoPorcentaje, reglas |
| Factura | facturas | tipo, estado (pendiente/parcial/pagada/anulada), archivoUrl |
| OrdenPago | ordenes_pago | numero, finnegansId, montoTotal, estado |
| Pago | pagos | montoBase, retenciones (IIBB/Ganancias/IVA/SUSS), comision |
| PagoProgramado | pagos_programados | fechaProgramada, estado |
| AuditLog | audit_logs | usuario, accion, entidad, cambios, ip |

## Variables de entorno

Ver `.env.example` para la lista completa. Las criticas:

```env
PORT=3100
MONGODB_URI=mongodb://localhost:27017/perc-suppliers
JWT_SECRET=perc-suppliers-jwt-secret-dev
JWT_EXPIRES_IN=24h
AWS_S3_BUCKET=perc-suppliers-facturas
GEMINI_API_KEY=          # Necesario para OCR
CORS_ORIGIN=http://localhost:4200
```

Finnegans: si `FINNEGANS_BASE_URL` y `FINNEGANS_CLIENT_ID` estan vacios, usa mock automaticamente.

## Flujo de negocio principal

```
Factura (ingreso) -> OrdenPago (agrupacion) -> Pago (ejecucion con retenciones)
                                                  ↑
                                              Convenio (reglas de comision/retencion)
```

Cada entidad puede tener un `finnegansId` para sincronizacion con el ERP.
