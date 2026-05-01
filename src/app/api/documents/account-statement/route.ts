import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { generateAccountStatement } from "@/lib/pdf/generator";

export async function GET(request: Request): Promise<Response> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "lessee.view");

  const url = new URL(request.url);
  const lesseeId = url.searchParams.get("lesseeId");
  if (!lesseeId) {
    return NextResponse.json(
      { error: "Falta query param 'lesseeId'." },
      { status: 400 },
    );
  }

  try {
    const pdf = await generateAccountStatement(tenantId, lesseeId, {
      uploadedById: dbUser.id,
    });
    return new Response(new Uint8Array(pdf.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdf.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al generar PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
