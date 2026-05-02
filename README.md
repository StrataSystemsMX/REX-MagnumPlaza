# Rex · by Strata Systems

CRM SaaS para administradoras inmobiliarias en México. Enfoque en administración de propiedades (no venta), con soporte multi-tenant y multi-razón-social desde el día 1.

> **Rex** es el nombre del producto. **Strata Systems MX** es la empresa que lo desarrolla.

> Ver [`CLAUDE.md`](./CLAUDE.md) para el contexto completo del proyecto: negocio, arquitectura, convenciones y roadmap.

## Stack

- **Next.js 15** (App Router) + **TypeScript estricto** + **Tailwind CSS v4**
- **shadcn/ui** (base color: slate, CSS variables)
- **Prisma** + **PostgreSQL** (Neon en producción)
- **Zod** para validación cliente/servidor
- **Vitest** (unit) + **Playwright** (E2E)

Servicios externos (se agregan en fases siguientes): Clerk, Cloudflare R2, Resend, WhatsApp Cloud API, Mapbox.

## Setup local

### Requisitos previos

- **Node.js** >= 20
- **pnpm** >= 9
- **PostgreSQL** 16+ corriendo localmente (o un connection string a una instancia remota)

### Pasos

1. Instalar dependencias:

   ```bash
   pnpm install
   ```

2. Copiar variables de entorno:

   ```bash
   cp .env.example .env
   ```

   Editar `.env` y completar al menos `DATABASE_URL`. Las claves de Clerk, R2, Resend, WhatsApp y Mapbox pueden quedarse vacías hasta que sus features correspondientes estén activas.

3. Generar el cliente de Prisma y aplicar el schema a la base:

   ```bash
   pnpm db:push      # sincroniza schema sin migración (desarrollo rápido)
   # o
   pnpm db:migrate   # crea migración versionada (preferido en main)
   ```

4. (Opcional) Sembrar datos de demo:

   ```bash
   pnpm db:seed
   ```

5. Iniciar el servidor de desarrollo:

   ```bash
   pnpm dev
   ```

   App disponible en [http://localhost:3000](http://localhost:3000).

## Scripts disponibles

| Script | Descripción |
|---|---|
| `pnpm dev` | Servidor de desarrollo con Turbopack |
| `pnpm build` | Build de producción |
| `pnpm start` | Servidor de producción (requiere `build` previo) |
| `pnpm lint` | ESLint sobre todo el proyecto |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm format` | Formatea con Prettier |
| `pnpm format:check` | Verifica formato sin cambiar archivos |
| `pnpm test` | Tests unitarios (Vitest) |
| `pnpm test:watch` | Vitest en modo watch |
| `pnpm test:e2e` | Tests end-to-end (Playwright) |
| `pnpm db:push` | Aplica schema sin migración (dev) |
| `pnpm db:migrate` | Crea/aplica migración versionada |
| `pnpm db:seed` | Ejecuta `prisma/seed.ts` |
| `pnpm db:studio` | Abre Prisma Studio |
| `pnpm dev:cron` | Corre el cron diario de morosidad localmente (sin HTTP) |

## Estructura del proyecto

```
rex/
├── prisma/                  # Schema y migraciones
├── src/
│   ├── app/                 # App Router (auth, dashboard, api)
│   ├── components/          # ui (shadcn), forms, tables, shared
│   ├── lib/                 # prisma, auth, validators, services
│   ├── hooks/
│   └── types/
├── tests/
│   ├── unit/                # Vitest
│   └── e2e/                 # Playwright
└── public/
```

Ver `CLAUDE.md` § 5 para convenciones de código y naming.

## Cron de morosidad

Cada día a las **08:00 hora de Hermosillo (16:00 UTC)** Vercel dispara
`/api/cron/update-rent-statuses`, que:

1. Recalcula el `status` de cada `Rent` no terminal según los días vencidos
   (PENDING → DUE → OVERDUE_1M → OVERDUE_2M → OVERDUE_3M).
2. Por cada transición a `OVERDUE_*` escribe un `AuditLog` y dispara un hook
   de notificación (placeholder hasta que conectemos WhatsApp en Prompt 9).
3. Guarda un snapshot diario por tenant en `MorosityDailySnapshot` para
   poder graficar la evolución de la cartera con el tiempo.

### Configurar el secret en Vercel

El endpoint exige el header `x-cron-secret` o `Authorization: Bearer …`.
Vercel manda el `Authorization` automáticamente cuando la variable
`CRON_SECRET` está definida en el proyecto:

```bash
vercel env add CRON_SECRET production
# (pegar un secreto aleatorio, ej. `openssl rand -hex 32`)
```

El [`vercel.json`](./vercel.json) declara el cron y Vercel se encarga de
autenticarlo. Para correrlo manualmente con `curl`:

```bash
curl -H "x-cron-secret: $CRON_SECRET" \
  https://<deploy>.vercel.app/api/cron/update-rent-statuses
```

### Disparar el cron en desarrollo

Tres opciones, equivalentes en lo que hacen:

- `pnpm dev:cron` — script tsx que corre el job sin pasar por HTTP.
- `POST /api/dev/run-cron` — endpoint sólo-dev (404 en producción).
- Botón **Correr cron de morosidad ahora** en
  [`/configuracion/sistema`](http://localhost:3000/configuracion/sistema)
  (visible sólo para usuarios con rol MASTER).

## WhatsApp / Notificaciones

El cliente prefiere WhatsApp como canal principal de comunicación con sus
inquilinos. Usamos **WhatsApp Cloud API** (Meta) con plantillas pre-aprobadas.

### Modo desarrollo (sin cuenta real)

Si `WHATSAPP_ACCESS_TOKEN` está vacío en `.env`, el cliente simula el envío:
loguea en consola `[FAKE WHATSAPP] sería enviado a +52... con plantilla X y
params Y`, devuelve un `messageId` con prefijo `fake-` y crea el
`NotificationLog` con status `SENT`. Los flujos (cron de morosidad, registro
de pagos, botones de UI) funcionan end-to-end sin necesidad de configurar
Meta.

### Modo producción

#### 1. Cuenta de WhatsApp Business API

1. Crea una **Meta App** en [developers.facebook.com](https://developers.facebook.com).
   Producto: WhatsApp.
2. En *WhatsApp → API Setup* obtén el **Phone Number ID** y el **Access Token**
   permanente (genera un *System User Token* desde Business Manager para evitar
   tokens de 24h).
3. Anota tu **App Secret** (Settings → Basic → App Secret).

#### 2. Crear las 5 plantillas en Business Manager

Ve a **Business Manager → WhatsApp Manager → Plantillas de mensajes** y crea
estas 5, todas con idioma `Español (México) — es_MX`:

| Nombre | Categoría | Variables (orden) |
|---|---|---|
| `rent_reminder_1m` | UTILITY | `{{1}}` nombre · `{{2}}` mes · `{{3}}` monto · `{{4}}` link estado de cuenta |
| `rent_reminder_2m` | UTILITY | `{{1}}` nombre · `{{2}}` meses vencidos · `{{3}}` total adeudo · `{{4}}` link PDF |
| `rent_reminder_3m_legal` | UTILITY | `{{1}}` nombre · `{{2}}` fecha límite · `{{3}}` monto total |
| `payment_received` | UTILITY | `{{1}}` nombre · `{{2}}` monto · `{{3}}` concepto |
| `contract_expiring` | UTILITY | `{{1}}` nombre · `{{2}}` fecha vencimiento · `{{3}}` unit |

> Las plantillas tardan **horas a días** en aprobarse. Mientras tanto el
> envío real fallará con código `132000` (mapeado a `TEMPLATE_NOT_APPROVED`)
> y el `NotificationLog` quedará en `FAILED` con el motivo. El flujo no
> rompe — sólo se registra para reintento manual.

#### 3. Variables en `.env`

```bash
WHATSAPP_PHONE_NUMBER_ID="123456789012345"
WHATSAPP_ACCESS_TOKEN="EAAG..."
WHATSAPP_VERIFY_TOKEN="<elige-un-string-aleatorio>"
WHATSAPP_APP_SECRET="<app-secret-de-meta>"
```

#### 4. Configurar el webhook

1. En tu Meta App: *WhatsApp → Configuration → Webhook*.
2. **Callback URL:** `https://<tu-deploy>.vercel.app/api/webhooks/whatsapp`
3. **Verify Token:** el mismo string de `WHATSAPP_VERIFY_TOKEN`.
4. Suscríbete al campo `messages`.
5. Meta hace una llamada `GET` con `hub.challenge`; el endpoint la
   responde automáticamente si el token coincide.

Cada vez que un mensaje cambia de estado (`sent` → `delivered` → `read` o
`failed`), Meta llama `POST` al webhook. El handler verifica la firma
`X-Hub-Signature-256` con HMAC-SHA256 + `WHATSAPP_APP_SECRET`, encuentra el
`NotificationLog` por `externalId` y avanza su `status`.

#### 5. Testear localmente con ngrok

Meta requiere HTTPS público para los webhooks. En desarrollo:

```bash
# Terminal 1
pnpm dev

# Terminal 2
ngrok http 3000
# copia la URL https://abc123.ngrok-free.app
```

Configura ese URL como callback en Meta y manda mensajes de prueba. Los
status events llegarán al webhook local. Para testear sin Meta puedes hacer
`curl` directo:

```bash
curl -X POST http://localhost:3000/api/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "statuses": [{"id":"<externalId>","status":"delivered","timestamp":"1714438800"}]
        }
      }]
    }]
  }'
```

> En dev sin `WHATSAPP_APP_SECRET`, el webhook se salta la verificación de
> firma para permitir tests con curl. En producción siempre exige firma
> válida.

### Configuración por tenant

En `/configuracion/notificaciones` (sólo MASTER) hay dos switches:

- **Avisos de morosidad automáticos (1M y 2M):** cuando el cron mueve un
  Rent a OVERDUE_1M / OVERDUE_2M, manda el aviso solo.
- **Confirmaciones de pago automáticas:** cuando se registra un Payment
  que cubre el total de un Rent, manda confirmación al inquilino.

> **Política CRT:** el aviso 3M (notificación de desalojo) **nunca se envía
> automáticamente**, sin importar los switches. Siempre requiere que un
> humano lo dispare desde la página de morosidad y confirme el dialog de
> alerta. Esta regla está hardcodeada en `lib/services/notifications.ts`.

## Antes de cada commit

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

Mensajes de commit en formato conventional: `feat(contracts): add renewal flow`.
