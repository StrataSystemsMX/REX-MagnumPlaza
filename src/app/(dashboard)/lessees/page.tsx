import { LesseeTable } from "@/components/lessees/LesseeTable";
import { getLessees } from "@/lib/services/lessees-queries";

export default async function LesseesPage() {
  const lessees = await getLessees();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inquilinos</h1>
        <p className="text-sm text-muted-foreground">
          {lessees.length} inquilinos registrados. Gestiona razones sociales, contactos y
          canales de comunicación.
        </p>
      </div>
      <LesseeTable lessees={lessees} />
    </div>
  );
}
