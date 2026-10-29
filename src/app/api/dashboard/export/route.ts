import { NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/get-session";
import { canExportFinancials } from "@/server/auth/permissions";
import { generateDashboardSummary } from "@/server/pdf/generator";

export async function GET(request: Request): Promise<Response> {
  const { tenantId, dbUser } = await requireAuth();
  if (!(await canExportFinancials(dbUser.id))) {
    return NextResponse.json({ error: "No tienes permiso para exportar." }, { status: 403 });
  }

  const url = new URL(request.url);
  const month = url.searchParams.get("month") ?? undefined;
  const legalEntity = url.searchParams.get("legalEntity") ?? undefined;

  try {
    const pdf = await generateDashboardSummary(tenantId, { month, legalEntityId: legalEntity });
    return new Response(new Uint8Array(pdf.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdf.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    // Detalle solo al log del servidor; mensaje genérico al cliente.
    console.error("[api/dashboard/export] PDF generation failed", e);
    return NextResponse.json({ error: "Error al generar el PDF." }, { status: 500 });
  }
}
