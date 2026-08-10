import { NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/get-session";
import { requirePermission } from "@/server/auth/permissions";
import { generateAccountStatement } from "@/server/pdf/generator";

// Ventana móvil de los últimos N meses (incluye el mes en curso), en UTC,
// alineada al primer día de cada mes (igual que Rent.period).
function trailingPeriodWindow(months: number): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1),
  );
  return { from, to };
}

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

  // Filtro de plazo: 'months' (ventana móvil) tiene prioridad; si no, 'from'/'to'
  // explícitos (ISO). Sin ninguno, el estado de cuenta cubre todo el historial.
  let from: Date | undefined;
  let to: Date | undefined;
  const monthsParam = url.searchParams.get("months");
  if (monthsParam) {
    const months = Number(monthsParam);
    if (!Number.isInteger(months) || months < 1 || months > 120) {
      return NextResponse.json(
        { error: "'months' debe ser un entero entre 1 y 120." },
        { status: 400 },
      );
    }
    ({ from, to } = trailingPeriodWindow(months));
  } else {
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    if (fromParam) {
      from = new Date(fromParam);
      if (Number.isNaN(from.getTime())) {
        return NextResponse.json(
          { error: "'from' no es una fecha válida." },
          { status: 400 },
        );
      }
    }
    if (toParam) {
      to = new Date(toParam);
      if (Number.isNaN(to.getTime())) {
        return NextResponse.json(
          { error: "'to' no es una fecha válida." },
          { status: 400 },
        );
      }
    }
    if (from && to && from > to) {
      return NextResponse.json(
        { error: "'from' no puede ser posterior a 'to'." },
        { status: 400 },
      );
    }
  }

  try {
    const pdf = await generateAccountStatement(tenantId, lesseeId, {
      uploadedById: dbUser.id,
      from,
      to,
    });
    return new Response(new Uint8Array(pdf.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdf.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    // Detalle solo al log del servidor; mensaje genérico al cliente.
    console.error("[api/documents/account-statement] PDF generation failed", e);
    return NextResponse.json({ error: "Error al generar el PDF." }, { status: 500 });
  }
}
