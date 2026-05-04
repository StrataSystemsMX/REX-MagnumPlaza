import { RentasView } from "@/components/rentas/RentasView";
import { getRentasOverview } from "@/lib/services/rentas-queries";

export default async function RentasPage() {
  const overview = await getRentasOverview();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rentas</h1>
        <p className="text-sm text-muted-foreground">
          Ciclo mensual de facturación: lo que el sistema generó, lo que viene y
          anomalías de generación. Para registrar pagos y perseguir morosos usa{" "}
          <span className="font-medium">Cobranza</span>.
        </p>
      </div>
      <RentasView overview={overview} />
    </div>
  );
}
