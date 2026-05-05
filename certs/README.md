# Certificados AFIP

Esta carpeta contiene los certificados WSAA para consumir servicios web de AFIP. **Nunca commitear archivos `.crt`, `.key`, `.pem`, `.p12` o `.pfx`** — el `.gitignore` ya los excluye.

## Archivos esperados

```
afip.crt    Certificado X.509 emitido por AFIP (PEM)
afip.key    Clave privada que generó el CSR (PEM, sin passphrase)
```

## Configuración

Apuntar a estos archivos desde `.env`:

```env
AFIP_ENV=homologacion           # o "produccion"
AFIP_CERT_PATH=./certs/afip.crt
AFIP_KEY_PATH=./certs/afip.key
AFIP_CUIT_REPRESENTADO=30123456789
```

## Servicios requeridos

El certificado debe estar autorizado en AFIP → Administrador de Relaciones de Clave Fiscal para:

- `ws_sr_padron_a5` — consulta de constancia de inscripción

Si se agregan más servicios (factura electrónica, etc.) hay que asociarlos por separado.

## Si la clave tiene passphrase

Quitarla con:

```bash
openssl rsa -in afip-con-passphrase.key -out afip.key
```

Esta integración asume key sin passphrase.
