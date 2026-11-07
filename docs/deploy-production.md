# Deploy de produccion

Guia corta para desplegar REX Magnum Plaza en Vercel con Postgres (Supabase), Clerk,
Cloudflare R2, Resend, WhatsApp Cloud API y cron de morosidad.

## 1. Gates locales

Antes de desplegar:

```bash
pnpm check:env:production
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Tambien puedes correr todo el gate con:

```bash
pnpm deploy:check
```

Para E2E, usa base local y Clerk de desarrollo:

```bash
pnpm test:e2e:install
pnpm db:migrate:deploy
pnpm db:seed
pnpm test:e2e
```

## 2. Variables en Vercel

`pnpm check:env:production` falla si falta una obligatoria y solo advierte
por las opcionales.

### Obligatorias

Aplicacion:

- `NEXT_PUBLIC_APP_URL`
- `NODE_ENV=production`

Base de datos:

- `DATABASE_URL`
- `DIRECT_URL`

Clerk:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
- `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`

Cloudflare R2:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL`

Cron:

- `CRON_SECRET`

Sin R2, subir fotos o recibos falla en Vercel: el respaldo local escribe en
disco y el filesystem de Vercel es de solo lectura.

### Opcionales

Sin ellas la app arranca, pero la integracion queda apagada.

Correo (avisos y leads; sin llave, el envio queda en `NotificationLog` como
FAILED):

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

WhatsApp (sin token, en desarrollo se simula el envio; en produccion queda
FAILED con `NOT_CONFIGURED`):

- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`

Mapas (mapa de vacantes en ligas publicas de promotores):

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

## 3. Base de datos

En produccion no corras `pnpm db:seed` sobre una base con datos reales. El seed
borra y recrea el tenant `plazas-magnum`.

Para aplicar schema:

```bash
pnpm db:migrate:deploy
```

Arranque de una base nueva (roles y permisos, tenant, razones sociales,
categorias de egreso y usuarios; sin datos operativos):

```bash
pnpm db:bootstrap --user "correo@dominio.com:MASTER:Nombre Apellido" \
  --user "otro@dominio.com:ADMIN:Nombre Apellido"
```

Es idempotente y nunca borra: se vuelve a correr para dar de alta usuarios
nuevos. Roles validos: `MASTER`, `ADMIN`, `ACCOUNTANT`, `OWNER`, `PROMOTER`,
`LESSEE`.

Para sincronizar el catalogo de roles y permisos en una base existente:

```bash
pnpm db:sync-permissions
```

Este comando es idempotente y no toca datos operativos.

## 4. Clerk

En produccion no hay auto-provisionamiento de usuarios. Cada usuario necesita
dos cosas: estar invitado en Clerk (la app es Invite-only) y existir en la base
con el mismo correo (`pnpm db:bootstrap --user ...`). En su primer inicio de
sesion la app lo vincula por correo. Si un usuario autenticado no existe en la
DB, la app redirige a `/cuenta-no-autorizada`.

Checklist:

- Usar llaves `pk_live_` y `sk_live_` solo en produccion.
- Configurar redirects de sign-in/sign-up hacia la URL productiva.
- Verificar al menos un usuario MASTER antes de entregar la app.

## 5. Cron de morosidad

Vercel ejecuta:

```text
/api/cron/update-rent-statuses
```

con schedule:

```text
0 16 * * *
```

Ese horario equivale a 09:00 en Hermosillo cuando la zona mantiene UTC-7. El
endpoint requiere `CRON_SECRET` via `Authorization: Bearer <CRON_SECRET>` o
`x-cron-secret`.

Verificacion manual:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "$NEXT_PUBLIC_APP_URL/api/cron/update-rent-statuses"
```

## 6. Integraciones

R2:

- Subir y leer una foto de inmueble.
- Subir y eliminar un recibo de predial.

Resend:

- Confirmar dominio remitente.
- Probar aviso administrativo de lead.

WhatsApp:

- Verificar webhook con `WHATSAPP_VERIFY_TOKEN`.
- Confirmar firma con `WHATSAPP_APP_SECRET`.
- Confirmar plantillas aprobadas antes de activar envio real.

## 7. Smoke post-deploy

Despues de desplegar:

1. Entrar con usuario MASTER.
2. Verificar healthcheck en `/api/health`.
3. Abrir dashboard.
4. Abrir propiedades, contratos y cobranza.
5. Crear una liga publica de promotor en staging.
6. Abrir `/p/[token]` y capturar un lead de prueba.
7. Ejecutar cron manualmente en staging.
8. Revisar `NotificationLog` y `AuditLog`.

## 8. Rollback

Si falla build, no promover el deployment.

Si falla migracion:

- No correr seed sobre produccion.
- Revisar migracion fallida en Supabase/Postgres.
- Corregir con migracion nueva; no editar migraciones ya aplicadas.

Si falla cron/notificaciones:

- Mantener la app arriba.
- Desactivar envio automatico desde configuracion del tenant.
- Corregir credenciales o proveedor.
