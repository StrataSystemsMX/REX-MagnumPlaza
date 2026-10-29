# Tests E2E (Playwright + Clerk Testing Tokens)

Los E2E crean datos reales (contratos, pagos). Por eso `global.setup.ts`
**bloquea la ejecución** si `DATABASE_URL` apunta a Supabase (producción) o si
`CLERK_SECRET_KEY` es `sk_live_`. Corren únicamente contra una base local y la
instancia de **desarrollo** de Clerk.

## Setup (una sola vez)

1. **Postgres local** (Docker):
   ```bash
   docker run -d --name rex-db -e POSTGRES_PASSWORD=rex -p 5432:5432 postgres:16
   ```
2. **Usuario E2E en Clerk (instancia dev):** en el dashboard de Clerk →
   Users → Create user, con email y password (p.ej. `e2e@rex.test`). No hace
   falta crearlo en Postgres: en dev, `requireAuth` lo auto-provisiona con rol
   MASTER en su primer login.
3. **`.env.test.local`** (o exporta en tu shell) con:
   ```bash
   DATABASE_URL="postgresql://postgres:rex@localhost:5432/postgres"
   DIRECT_URL="postgresql://postgres:rex@localhost:5432/postgres"
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."   # instancia DEV
   CLERK_SECRET_KEY="sk_test_..."                    # instancia DEV
   E2E_CLERK_USER_EMAIL="e2e@rex.test"
   E2E_CLERK_USER_PASSWORD="<password del usuario E2E>"
   ```

## Correr

```bash
# con las vars anteriores cargadas en el entorno:
pnpm prisma migrate deploy   # aplica el schema a la DB local
pnpm db:seed                 # datos del piloto (Plazas Magnum)
pnpm test:e2e                # levanta `pnpm dev` solo y corre los specs
```

## Estado de los specs

- `auth.spec.ts` y `smoke.spec.ts` — activos.
- `contract-payment.spec.ts` — `test.fixme`: el flujo del wizard multi-paso
  necesita su primera corrida local para validar/ajustar selectores. Al
  validarlo, quitar el `fixme`.
