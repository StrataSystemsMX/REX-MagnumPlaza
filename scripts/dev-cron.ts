/**
 * Dispara el cron de morosidad localmente sin pasar por HTTP.
 * Uso: pnpm dev:cron
 *
 * Carga .env.local automáticamente (ver script en package.json) y procesa
 * todos los tenants activos. Útil para verificar transiciones después de
 * tocar fechas en la DB de desarrollo.
 */
import { runDailyMorosityCron } from "../src/lib/services/cron-runner";

async function main(): Promise<void> {
  const summary = await runDailyMorosityCron();
  console.log("Cron ejecutado:");
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((e) => {
    console.error("Cron falló:", e);
    process.exit(1);
  })
  .finally(() => {
    // Forzamos exit para que el adaptador Postgres cierre conexiones colgantes.
    setTimeout(() => process.exit(0), 100);
  });
