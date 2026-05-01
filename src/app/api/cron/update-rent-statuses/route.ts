import { NextResponse } from "next/server";
import { runDailyMorosityCron } from "@/lib/services/cron-runner";

/**
 * Cron diario de actualización de morosidad. Disparado por Vercel Cron
 * (ver vercel.json). Acepta dos formas de auth:
 *   - x-cron-secret: <CRON_SECRET>           ← uso manual / curl / dev
 *   - Authorization: Bearer <CRON_SECRET>     ← header que Vercel manda automáticamente
 */
export async function GET(request: Request): Promise<NextResponse> {
  const expected = process.env["CRON_SECRET"];
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET no está configurado en el servidor." },
      { status: 500 },
    );
  }

  const fromHeader = request.headers.get("x-cron-secret");
  const fromBearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const got = fromHeader ?? fromBearer ?? "";
  if (got !== expected) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const summary = await runDailyMorosityCron();
    return NextResponse.json(summary);
  } catch (e) {
    console.error("[cron/update-rent-statuses] failed:", e);
    const message = e instanceof Error ? e.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
