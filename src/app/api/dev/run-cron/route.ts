import { NextResponse } from "next/server";
import { runDailyMorosityCron } from "@/lib/services/cron-runner";

/**
 * Endpoint sólo-dev para disparar el cron de morosidad a mano sin necesidad
 * del CRON_SECRET. Devuelve 404 en producción para evitar exposición.
 */
export async function POST(): Promise<NextResponse> {
  if (process.env["NODE_ENV"] === "production") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const summary = await runDailyMorosityCron();
  return NextResponse.json(summary);
}
