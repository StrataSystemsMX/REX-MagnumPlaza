# Deploy de produccion

Guia corta para desplegar REX Magnum Plaza en Vercel con Postgres/Neon, Clerk,
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

## 2. Variables obligatorias en Vercel

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
- `CLERK_WEBHOOK_SECRET`

Cloudflare R2:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL`

Correo:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

WhatsApp:

- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`

Mapas:

- `NEXT_PUBLIC_MAPBOX_TOKEN`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

Cron:

- `CRON_SECRET`

## 3. Base de datos

En produccion no corras `pnpm db:seed` sobre una base con datos reales. El seed
borra y recrea el tenant `plazas-magnum`.

Para aplicar schema:

```bash
pnpm db:migrate:deploy
```

Para sincronizar catalogo de permisos en una base existente:

```bash
pnpm db:sync-permissions
```

Este comando es idempotente y no toca datos operativos.

## 4. Clerk

En produccion no hay auto-provisionamiento de usuarios. Los usuarios deben
existir en la base con email compatible o venir de un flujo explicito de alta.
Si un usuario autenticado no existe en la DB, la app redirige a
`/cuenta-no-autorizada`.

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
- Revisar migracion fallida en Neon/Postgres.
- Corregir con migracion nueva; no editar migraciones ya aplicadas.

Si falla cron/notificaciones:

- Mantener la app arriba.
- Desactivar envio automatico desde configuracion del tenant.
- Corregir credenciales o proveedor.
