import { NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/get-session";
import { requirePermission } from "@/server/auth/permissions";
import { generateOverdueReminder } from "@/server/pdf/generator";
import type { ReminderLevel } from "@/server/pdf/template-config";

const VALID_LEVELS: ReminderLevel[] = ["1M", "2M", "3M"];

function isLevel(v: string): v is ReminderLevel {
  return (VALID_LEVELS as string[]).includes(v);
}

export async function GET(request: Request): Promise<Response> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "lessee.view");

  const url = new URL(request.url);
  const rentId = url.searchParams.get("rentId");
  const levelParam = url.searchParams.get("level");
  if (!rentId || !levelParam) {
    return NextResponse.json(
      { error: "Faltan query params 'rentId' y/o 'level'." },
      { status: 400 },
    );
  }
  if (!isLevel(levelParam)) {
    return NextResponse.json(
      { error: "level debe ser uno de: 1M, 2M, 3M." },
      { status: 400 },
    );
  }

  try {
    const pdf = await generateOverdueReminder(tenantId, rentId, levelParam, {
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
