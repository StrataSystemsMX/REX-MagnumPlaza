import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/get-session";
import { getUserRoleCodes } from "@/lib/auth/permissions";
import { generateDashboardSummary } from "@/lib/pdf/generator";

export async function GET(request: Request): Promise<Response> {
  const { tenantId, dbUser } = await requireAuth();
  const roles = await getUserRoleCodes(dbUser.id);
  const canExport =
    roles.includes("MASTER") ||
    roles.includes("ADMIN") ||
    roles.includes("ACCOUNTANT") ||
    roles.length === 0;
  if (!canExport) {
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
    const message = e instanceof Error ? e.message : "Error al generar el PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
