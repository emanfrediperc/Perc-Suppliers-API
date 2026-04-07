# Perc Suppliers API

Backend del sistema de gestion de pagos a proveedores. API REST con NestJS, MongoDB, y autenticacion JWT.

## Stack

- **NestJS 11** + TypeScript 5.7
- **MongoDB 7** con Mongoose 9 (requiere replica set `rs0`)
- **Auth**: Passport JWT + bcrypt
- **Docs**: Swagger en `/api/docs`
- **Testing**: Jest 30 + Supertest

## Setup

```bash
# Requisitos: Node 20.19.0, MongoDB 7+ (replica set)

cp .env.example .env       # configurar variables
npm install
npm run seed               # datos de prueba
npm run start:dev          # http://localhost:3100
```

## Scripts

| Comando | Descripcion |
|---------|-------------|
| `npm run start:dev` | Dev con hot reload (puerto 3100) |
| `npm run build` | Build produccion → `dist/` |
| `npm run seed` | Carga datos de prueba |
| `npm test` | Tests unitarios (Jest) |
| `npm run test:e2e` | Tests E2E |
| `npm run test:cov` | Coverage |
| `npm run lint` | ESLint + fix |

## Estructura

```
src/
├── auth/                # JWT, guards, roles, User schema
├── config/              # Variables de entorno tipadas
├── common/              # DTOs compartidos, filtros, utils, validators
├── integrations/
│   ├── afip/            # Validacion CUIT (API publica)
│   ├── email/           # Nodemailer
│   ├── finnegans/       # ERP (real + mock auto-fallback)
│   ├── gemini/          # OCR facturas (Google Gemini)
│   └── storage/         # AWS S3
└── modules/
    ├── aprobacion/      # Workflow aprobaciones
    ├── audit-log/       # Log automatico de mutaciones
    ├── busqueda/        # Busqueda global
    ├── comentario/      # Comentarios en entidades
    ├── configuracion/   # Settings de la app
    ├── convenio/        # Acuerdos comerciales
    ├── dashboard/       # Estadisticas
    ├── empresa-cliente/ # Empresas clientes
    ├── empresa-proveedora/ # Proveedores
    ├── factura/         # Facturas (CRUD + OCR + export)
    ├── notificacion/    # Notificaciones in-app
    ├── orden-pago/      # Ordenes de pago
    ├── pago/            # Pagos con retenciones
    ├── pago-programado/ # Pagos programados (cron)
    └── reporte/         # Reportes exportables
```

## API

- **Prefix**: `/api/v1`
- **Auth**: Bearer token en header `Authorization`
- **Swagger**: http://localhost:3100/api/docs
- **Rate limit**: 100 req/min (global)
- **Audit**: todas las mutaciones se loguean automaticamente

## Flujo de negocio

```
Factura → OrdenPago → Pago (con retenciones IIBB/Ganancias/IVA/SUSS)
                        ↑
                    Convenio (reglas de comision/retencion)
```

## Variables de entorno

Ver [`.env.example`](.env.example) para la referencia completa.

| Variable | Requerida | Default |
|----------|-----------|---------|
| `MONGODB_URI` | Si | `mongodb://localhost:27017/perc-suppliers` |
| `JWT_SECRET` | Si | (dev default incluido) |
| `GEMINI_API_KEY` | Para OCR | — |
| `AWS_*` | Para storage | — |
| `FINNEGANS_*` | No (usa mock) | — |
| `SMTP_*` | Para emails | — |

## Docker

```bash
docker build -t perc-suppliers-api .
docker run -p 3100:3100 --env-file .env perc-suppliers-api
```

O desde la raiz del monorepo: `docker compose up api`
