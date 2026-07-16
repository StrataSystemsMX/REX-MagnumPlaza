import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireAuth } from "@/lib/auth/get-session";
import { canExportFinancials } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import { getAnnualClosingBundle } from "@/lib/services/cierres-queries";
import { CierreAnualPdf } from "@/lib/pdf/templates/CierreAnualPdf";

export async function GET(request: Request): Promise<Response> {
  const { tenantId, dbUser } = await requireAuth();
  if (!(await canExportFinancials(dbUser.id))) {
    return NextResponse.json(
      { error: "No tienes permiso para exportar." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const yearParam = url.searchParams.get("year");
  const entityParam = url.searchParams.get("entity");
  const now = new Date();
  const year = yearParam ? Number(yearParam) : now.getUTCFullYear();
  if (!Number.isFinite(year)) {
    return NextResponse.json(
      { error: "Año inválido." },
      { status: 400 },
    );
  }

  try {
    const [tenant, closing, operatorEntity, fallbackEntity] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      getAnnualClosingBundle(tenantId, year),
      prisma.legalEntity.findFirst({
        where: { tenantId, isActive: true, isOperator: true },
        select: { legalName: true, rfc: true, address: true },
      }),
      prisma.legalEntity.findFirst({
        where: { tenantId, isActive: true },
        select: { legalName: true, rfc: true, address: true },
      }),
    ]);

    const billingEntity = operatorEntity ??
      fallbackEntity ?? { legalName: tenant.name, rfc: null, address: null };

    const buffer = await renderToBuffer(
      <CierreAnualPdf
        tenant={{
          name: tenant.name,
          brandLogoUrl: tenant.brandLogoUrl,
          brandPrimaryColor: tenant.brandPrimaryColor,
        }}
        billingEntity={billingEntity}
        contactInfo={[
          billingEntity.legalName,
          billingEntity.rfc ? `RFC ${billingEntity.rfc}` : null,
          billingEntity.address,
        ]
          .filter(Boolean)
          .join(" · ")}
        generatedAt={now}
        closing={closing}
        entityFilter={entityParam}
      />,
    );

    const suffix = entityParam ? `-${entityParam}` : "";
    const filename = `cierre-anual-${year}${suffix}.pdf`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    // Detalle solo al log del servidor; mensaje genérico al cliente.
    console.error("[api/cierres/anual/pdf] PDF generation failed", e);
    return NextResponse.json({ error: "Error al generar el PDF." }, { status: 500 });
  }
}
