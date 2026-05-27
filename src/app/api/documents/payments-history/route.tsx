import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireAuth } from "@/lib/auth/get-session";
import { getUserRoleCodes } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import { getPayments } from "@/lib/services/payments-queries";
import { paymentMethodLabel } from "@/lib/i18n/enums";
import { INMUEBLES_TAB_VALUE } from "@/components/shared/property-filter-constants";
import { PaymentsHistoryPdf } from "@/lib/pdf/templates/PaymentsHistoryPdf";
import type { PaymentMethod } from "@/generated/prisma/enums";

export async function GET(request: Request): Promise<Response> {
  const { tenantId, dbUser } = await requireAuth();
  const roles = await getUserRoleCodes(dbUser.id);
  const canExport =
    roles.includes("MASTER") ||
    roles.includes("ADMIN") ||
    roles.includes("ACCOUNTANT") ||
    roles.length === 0;
  if (!canExport) {
    return NextResponse.json(
      { error: "No tienes permiso para exportar." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const methodParam = url.searchParams.get("method");
  const searchParam = url.searchParams.get("search");
  const plazaIdParam = url.searchParams.get("plazaId");

  const VALID_METHODS: PaymentMethod[] = [
    "TRANSFER", "CASH", "CHECK", "DEPOSIT", "CARD", "OTHER",
  ];
  const method =
    methodParam && VALID_METHODS.includes(methodParam as PaymentMethod)
      ? (methodParam as PaymentMethod)
      : undefined;

  try {
    const [rawPayments, tenant, filteredProperty] = await Promise.all([
      getPayments({
        from: fromParam ? new Date(fromParam) : undefined,
        to: toParam ? new Date(toParam) : undefined,
        method,
        take: 5000,
      }),
      prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      plazaIdParam && plazaIdParam !== INMUEBLES_TAB_VALUE
        ? prisma.property.findFirst({
            where: { id: plazaIdParam, tenantId },
            select: { name: true },
          })
        : Promise.resolve(null),
    ]);

    // Aplicar filtros client-side (búsqueda de texto y plaza) igual que PaymentsTable
    const q = searchParam?.trim().toLowerCase() ?? "";
    const filtered = rawPayments.filter((p) => {
      const prop = p.rent.contract.unit.property;
      if (plazaIdParam === INMUEBLES_TAB_VALUE) {
        if (prop.type === "PLAZA_COMERCIAL") return false;
      } else if (plazaIdParam) {
        if (prop.id !== plazaIdParam) return false;
      }
      if (q) {
        const haystack =
          p.rent.contract.lessee.legalName.toLowerCase() +
          " " +
          (p.reference?.toLowerCase() ?? "") +
          " " +
          prop.name.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const totalAmount = filtered
      .reduce((acc, p) => acc + Number(p.amount), 0)
      .toFixed(2);

    const payments = filtered.map((p) => ({
      paymentDate: new Date(p.paymentDate),
      legalName: p.rent.contract.lessee.legalName,
      propertyName: p.rent.contract.unit.property.name,
      unitCode: p.rent.contract.unit.code,
      unitName: p.rent.contract.unit.name,
      isPlaza: p.rent.contract.unit.property.type === "PLAZA_COMERCIAL",
      period: new Date(p.rent.period),
      methodLabel: paymentMethodLabel(p.method),
      reference: p.reference,
      amount: String(p.amount),
    }));

    const contextName =
      filteredProperty?.name ??
      (plazaIdParam === INMUEBLES_TAB_VALUE ? "Inmuebles individuales" : "Todas las Propiedades");

    const now = new Date();
    const buffer = await renderToBuffer(
      <PaymentsHistoryPdf
        contextName={contextName}
        contactInfo={tenant.name}
        generatedAt={now}
        payments={payments}
        totalAmount={totalAmount}
        filters={{
          from: fromParam,
          to: toParam,
          method: method ? paymentMethodLabel(method) : null,
          search: searchParam?.trim() || null,
        }}
      />,
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="historial-pagos-${now.toISOString().slice(0, 10)}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al generar el PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
