# Rex (by Strata Systems MX) — CRM Inmobiliario

> Este archivo es el contexto persistente del proyecto. Claude Code lo lee al inicio de cada sesión. **No lo borres ni lo muevas.**

**Branding:** el producto se llama **Rex**. La empresa que lo desarrolla es **Strata Systems MX**. En la UI, PDFs y comunicaciones al usuario se muestra como "Rex · by Strata Systems".

---

## 1. Contexto del negocio

**Strata Systems MX** desarrolla **Rex**, un SaaS para administradoras inmobiliarias en México. El producto es un CRM enfocado en **administración de propiedades** (no de venta), aunque la arquitectura debe permitir activar más adelante un perfil "Comercializadora".

**Cliente piloto: CRT — Plazas Magnum** (Hermosillo, Sonora). Administra ~30 locales comerciales en 4 plazas y varios inmuebles individuales desde 2008. Hoy operan todo en Excel.

**Equipo de desarrollo:** 3 personas (Aaron Oviedo, Leonardo Reyes, Cristian Peralta). Recién egresados del ITC (Tecnológico de Monterrey).

---

## 2. Razones sociales del cliente (importante)

El cliente opera bajo **3 razones sociales** simultáneas, parte de su estrategia fiscal, más **1 persona física** registrada como entidad propietaria. El sistema debe permitir que un inmueble pertenezca legalmente a una entidad pero sea administrado y facturado por otra.

- **CRT** — Inmobiliaria principal. Dueña de la mayoría de inmuebles.
- **TSR** — Factura activos como Inbursa, La Chila Garmendia, Capilla del Carmen, Nayarit 52.
- **QHS** — Dueña legal del terreno de Plaza Quiroga, administrada por CRT.
- **JCL** — Juan Carlos L (persona física). Dueño de **Bodega** y **La Jolla**; CRT administra. `isOperator: false` — no factura, sólo aparece como owner formal.

> ⚠️ En la transcripción de la junta inicial estos acrónimos aparecen como TCR y UHS (error de transcripción). El Excel real del cliente confirma CRT, TSR, QHS.

---

## 3. Stack tecnológico

### Frontend / Backend (mismo proyecto)
- **Next.js 15** con App Router
- **TypeScript estricto** (`"strict": true`)
- **Tailwind CSS v4**
- **shadcn/ui** para componentes
- **Server Actions** + **API Routes** para backend

### Datos
- **PostgreSQL 16+** (en producción: Neon)
- **Prisma ORM** — el schema vive en `prisma/schema.prisma`
- **Zod** para validación (mismo schema en cliente y servidor)

### Servicios
- **Clerk** — autenticación, roles, 2FA
- **Cloudflare R2** — almacenamiento de archivos (fotos, PDFs)
- **Resend** — correos transaccionales
- **WhatsApp Cloud API** (Meta) — mensajes a inquilinos
- **Mapbox** — vista de mapa de inmuebles
- **React-PDF** — generación de cartas de desalojo y estados de cuenta

### Testing
- **Vitest** — unit tests (lógica de negocio crítica: cálculo de adeudos, generación de avisos)
- **Playwright** — E2E (login, crear contrato, registrar pago)

### Infraestructura
- **Vercel** — hosting
- **GitHub** — repo y CI/CD
- **Jira** — gestión de tareas

---

## 4. Arquitectura: principios no negociables

### 4.1 Multi-tenancy desde el día 1
Todas las tablas (excepto las globales como `Role` y `Permission`) tienen una columna `tenantId`. **Toda query a Prisma debe filtrar por `tenantId`**.

Para evitar olvidos, usamos un middleware de Prisma (`lib/prisma/tenant-middleware.ts`) que inyecta automáticamente `tenantId` en operaciones donde el contexto del request ya lo conoce. Aún así, en código nuevo siempre se pasa explícito.

### 4.2 Separación clara entre Contract → Rent → Payment
- **Contract**: el acuerdo (monto mensual, fechas).
- **Rent**: el cargo de cada mes que ese contrato genera (auto-creado por cron).
- **Payment**: cada movimiento de dinero. Un Payment se aplica a uno o más Rent.

Esta separación permite manejar pagos parciales, adelantos masivos (caso Bluecell pagó 6 meses) y morosidad escalonada.

### 4.3 Property y Unit son entidades distintas
- **Property** = inmueble completo (ej. "Plaza Magnum Progreso").
- **Unit** = espacio rentable individual (ej. "L1 - Goyoma").

Una Plaza con 9 locales = 1 Property + 9 Units.

### 4.4 LegalEntity dentro de Tenant
`ownerEntity` y `managerEntity` pueden ser distintos en una misma `Property`. Esto refleja el contrato de administración interno entre CRT y QHS.

### 4.5 Auditoría obligatoria
Toda operación CREATE/UPDATE/DELETE en entidades sensibles (Contract, Payment, Expense, Guarantee) debe escribir un `AuditLog`. Esto fue un requerimiento explícito del cliente.

---

## 5. Convenciones de código

### Estructura de carpetas
```
rex/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── (auth)/              # rutas con layout de auth
│   │   ├── (dashboard)/         # rutas autenticadas
│   │   ├── api/                 # API routes
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                  # shadcn (NO MODIFICAR sin razón)
│   │   ├── forms/               # formularios reutilizables
│   │   ├── tables/              # tablas con TanStack Table
│   │   └── shared/              # otros componentes compartidos
│   ├── lib/
│   │   ├── prisma/              # cliente y middleware
│   │   ├── auth/                # helpers de Clerk
│   │   ├── validators/          # schemas Zod
│   │   ├── services/            # lógica de negocio (rent generation, etc.)
│   │   └── utils.ts
│   ├── hooks/                   # custom React hooks
│   └── types/                   # tipos compartidos
├── tests/
│   ├── unit/
│   └── e2e/
├── public/
└── CLAUDE.md
```

### Naming
- **Archivos de componente**: `PascalCase.tsx` (ej. `PropertyTable.tsx`)
- **Archivos de utilidades**: `kebab-case.ts` (ej. `format-currency.ts`)
- **Server Actions**: prefijo `action` (ej. `actionCreateProperty`)
- **Validadores Zod**: sufijo `Schema` (ej. `createPropertySchema`)
- **Tipos de Prisma**: usar el tipo generado (`Property`, `Unit`) o derivados (`PropertyWithUnits`)
- **Variables de DB**: `camelCase` en TypeScript, `snake_case` en SQL (Prisma lo mapea con `@map`)

### Componentes
- **Server Components por defecto.** Solo agregar `"use client"` cuando sea estrictamente necesario (interactividad, hooks, browser APIs).
- **Forms**: usar `react-hook-form` + `zodResolver`. Los schemas Zod viven en `src/lib/validators/`.
- **Tablas**: TanStack Table v8 con shadcn `Table` como base.
- **Toasts/notificaciones**: `sonner` (ya viene con shadcn).

### Server Actions
- Toda Server Action recibe input ya validado con Zod.
- Toda Server Action verifica permisos antes de ejecutar.
- Toda Server Action que muta datos sensibles escribe `AuditLog`.
- Patrón estándar:
```typescript
"use server";

export async function actionCreateContract(input: CreateContractInput) {
  const { userId, tenantId } = await requireAuth();
  await requirePermission(userId, "contract.create");

  const validated = createContractSchema.parse(input);

  const contract = await prisma.contract.create({
    data: { ...validated, tenantId }
  });

  await logAudit({ userId, tenantId, action: "CREATE", entityType: "Contract", entityId: contract.id });

  revalidatePath("/contracts");
  return contract;
}
```

### Errores
- Errores de validación Zod → status 400, mensaje al usuario.
- Errores de permisos → status 403, mensaje genérico.
- Errores inesperados → loguear con detalle (usar `console.error` por ahora, después Sentry), mensaje genérico al usuario.

### Comentarios
- En español si describen lógica de negocio (ej. "// Política CRT: 3 avisos antes de desalojo").
- En inglés si describen detalles técnicos (ej. "// Debounce to avoid race condition on save").

---

## 6. Reglas para Claude Code

### Antes de programar:
1. **Lee este CLAUDE.md completo.**
2. **Lee `prisma/schema.prisma`** antes de crear cualquier feature relacionada con datos.
3. **Revisa convenciones existentes** en archivos similares antes de crear uno nuevo.

### Al programar:
1. **No instalar librerías nuevas sin justificación clara.** El stack ya está decidido.
2. **No reescribir componentes shadcn/ui** salvo extender vía composición.
3. **Filtrar siempre por `tenantId`** en queries de Prisma.
4. **Validar inputs con Zod** antes de tocar la base.
5. **Escribir tests unitarios** para lógica de negocio crítica (no para CRUDs simples).
6. **Sin `any`.** Si Prisma no genera el tipo que necesitas, pide ayuda en lugar de escapar tipos.

### Al terminar:
1. **Correr `pnpm lint` y `pnpm typecheck`** antes de commit.
2. **Verificar que el feature funcione end-to-end** (no solo que compile).
3. **Commits con mensajes en formato conventional**: `feat(contracts): add renewal flow`.

---

## 7. Datos del cliente para seed

El cliente tiene un Excel real (`PRESUPUESTO_INMOBILIARIAS_2026_ANALISIS_2025.xlsx`) con datos reales de 30+ inquilinos. La función seed (`prisma/seed.ts`) debe crear:

- 1 Tenant: "Plazas Magnum"
- 4 LegalEntities: CRT, TSR, QHS, JCL (persona física dueña de Bodega y La Jolla)
- 4 Properties principales: Plaza Progreso, Plaza Olivares, Plaza Quiroga 1, Plaza Quiroga 2
- 5 Properties individuales: Inbursa Blvd Kino, La Chila Garmendia, Capilla del Carmen, Oficina Elias Piso 2, Nayarit 52
- ~30 Units con sus inquilinos actuales y montos
- ExpenseCategories iniciales: Predial, Nómina Dirección, Nómina General, CFE, Agua, Telmex, Telcel, IMSS, SAT, Mantenimiento, Honorarios, Comisiones Bancarias, Seguros, Financiamiento Vehículos, Papelería, Gasolina, Otros
- 1 usuario admin de prueba (Aaron, Leo o Cristian)

---

## 8. Roadmap de fases

- **Fase 1 (MVP)**: Inmuebles, Contratos, Cobranza con calendario, Inquilinos, Roles básicos. Meta: que CRT pueda dejar el Excel principal.
- **Fase 2**: WhatsApp + automatización de avisos en 3 escalones, plantillas, generación de PDFs.
- **Fase 3**: Mantenimientos, Garantías, Presupuesto/Financiero, Dashboard ejecutivo.
- **Fase 4**: Promotores externos con links públicos, onboarding multi-cliente.
- **Fase 5**: Perfil Comercializadora (lo que estaba en el demo original).

Estamos arrancando **Fase 1**.

---

## 9. Glosario rápido

- **Inquilino / Locatario / Lessee**: la persona o empresa que renta un local. En el código se llama `Lessee`.
- **Locatario** = inquilino (el cliente usa ambos términos).
- **LP (Local Principal)**: el local más grande/importante de una plaza, usualmente con un ancla (ej. 7-Eleven, Benavides).
- **Espectacular**: estructura para anuncio publicitario rentada a empresas de marketing. Cuenta como Unit pero con `PropertyType.ESPECTACULAR`.
- **Predial**: impuesto municipal anual sobre el inmueble. Pagable en 1, 2 o 4 parcialidades.
- **Depósito en garantía**: 1 mes de renta que el inquilino entrega al inicio. Se devuelve al cierre menos deducciones por daños.
- **CFE**: Comisión Federal de Electricidad (compañía de luz en México).