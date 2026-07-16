import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireAuth } from "@/lib/auth/get-session";
import { getUserRoleCodes } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import { getLegalEntityMetrics } from "@/lib/services/legal-entity-queries";
import { LegalEntityStatementPdf } from "@/lib/pdf/templates/LegalEntityStatementPdf";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const { tenantId, dbUser } = await requireAuth();
  const roles = await getUserRoleCodes(dbUser.id);

  // Solo MASTER y ACCOUNTANT ven finanzas por LegalEntity (CLAUDE.md §2).
  const canExport =
    roles.includes("MASTER") ||
    roles.includes("ACCOUNTANT");
  if (!canExport) {
    return NextResponse.json(
      { error: "No tienes permiso para exportar." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const yearParam = url.searchParams.get("year");
  const now = new Date();
  const year = yearParam ? Number(yearParam) : now.getUTCFullYear();
  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: "Año inválido." }, { status: 400 });
  }

  try {
    const [tenant, metrics] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      getLegalEntityMetrics(tenantId, id, year),
    ]);

    if (!metrics) {
      return NextResponse.json(
        { error: "Razón social no encontrada." },
        { status: 404 },
      );
    }

    const billingEntity = {
      legalName: metrics.legalName,
      rfc: metrics.rfc,
      address: metrics.address,
    };

    const buffer = await renderToBuffer(
      <LegalEntityStatementPdf
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
        metrics={metrics}
      />,
    );

    const filename = `estado-resultados-${metrics.code}-${year}.pdf`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al generar el PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
