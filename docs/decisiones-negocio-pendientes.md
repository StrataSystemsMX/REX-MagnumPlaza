# Decisiones de negocio pendientes (auditoría 2026-07-15)

Tres hallazgos de la auditoría de código requieren una decisión del cliente
(CRT) antes de implementarse. Se documenta el comportamiento actual, el
problema y la propuesta, para revisarlos en la próxima junta.

---

## 1. La mora se borra al saldar el principal

**Hoy:** el interés moratorio (`Rent.lateFeeAccrued`, 5% mensual) se recalcula
sobre el saldo pendiente en cada pago (`src/lib/services/late-fees.ts`,
`rent-recalc.ts`). Si el inquilino paga tarde pero salda el principal completo,
el saldo queda en 0 → la mora recalculada da 0 → **el interés devengado
desaparece y nunca se cobra**.

**Decisión requerida:** cuando un inquilino salda el principal tarde,
¿la mora devengada hasta ese momento…

- (a) …se cobra? → congelar `lateFeeAccrued` al momento del pago y tratarla
  como cargo exigible independiente (propuesta técnica: persistirla como
  concepto separado que no se anule con el pago del principal).
- (b) …se condona automáticamente? → dejar el comportamiento actual y
  documentarlo como política.

## 2. Adelantos que cruzan el año / saldo a favor

**Hoy:** la cascada de excedentes de un pago solo aplica a rentas impagas del
**mismo año calendario** (`src/lib/services/payments.ts`, ~línea 141-245). Un
pago en diciembre que cubre enero-junio del año siguiente NO liquida esas
rentas: el sobrante se registra sobre la renta original con nota "saldo a
favor", dejando `amountPaid > amountDue` (infla la matriz anual de cobranza).

**Caso real:** Bluecell paga 6 meses por adelantado.

**Decisión requerida:**
- (a) Extender la cascada a periodos futuros sin límite de año (recomendado —
  el pago liquida las rentas de los meses que cubre, sin importar el año).
- (b) Además/en su lugar, modelar un "saldo a favor" explícito por contrato
  cuando el excedente supere las rentas existentes.

## 3. Prorrateo del primer/último mes

**Hoy:** `generateRentsForContract` (`src/lib/services/rent-generation.ts`)
cobra `monthlyAmount` completo en cada mes entre `startDate` y `endDate`,
aunque el contrato inicie o termine a mitad de mes.

**Decisión requerida:** ¿un contrato que arranca el día 15…
- (a) …paga mes completo (política actual, común en locales comerciales)?
  → solo documentar.
- (b) …paga proporcional a los días? → implementar prorrateo en la generación
  del primer/último cargo.

---

*Origen: plan de auditoría Fase 2 (`~/.claude/plans/vamos-a-hacer-una-serene-lampson.md`).
El resto de los hallazgos de la auditoría se implementó sin necesidad de
decisión (ver commits `fix(security)`, `fix(core)`, `feat(core)` en la rama
`fix/auditoria-fase-0-seguridad`).*
