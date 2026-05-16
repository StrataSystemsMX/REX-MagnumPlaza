"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UnitForm } from "@/components/forms/UnitForm";
import { UnitCard } from "@/components/properties/UnitCard";
import type { UnitWithContract } from "@/lib/services/properties-queries";

interface UnitTableProps {
  propertyId: string;
  units: ReadonlyArray<UnitWithContract>;
}

export function UnitTable({ propertyId, units }: UnitTableProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {units.length} unidad{units.length === 1 ? "" : "es"} activa
          {units.length === 1 ? "" : "s"}.
        </p>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="size-4" />
            Nueva Unidad
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Nueva unidad</DialogTitle>
              <DialogDescription>
                Captura los datos de la unidad rentable.
              </DialogDescription>
            </DialogHeader>
            <UnitForm
              initial={{ propertyId, code: "", status: "DISPONIBLE" }}
              onSuccess={() => {
                setCreateOpen(false);
                router.refresh();
              }}
              submitLabel="Crear unidad"
            />
          </DialogContent>
        </Dialog>
      </div>

      {units.length === 0 ? (
        <div className="rounded-md border bg-card p-12 text-center text-sm text-muted-foreground">
          Aún no hay unidades. Usa &quot;Nueva Unidad&quot; para agregarlas.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {units.map((u) => (
            <UnitCard
              key={u.id}
              propertyId={propertyId}
              unit={{
                id: u.id,
                code: u.code,
                name: u.name,
                status: u.status,
                estimatedRent:
                  u.estimatedRent !== null ? Number(u.estimatedRent) : null,
                coverPhotoUrl: u.documents[0]?.url ?? null,
                area: u.area,
                notes: u.notes,
                photos: u.documents.map((d) => ({
                  id: d.id,
                  url: d.url,
                  filename: d.filename,
                })),
                contracts: u.contracts.map((c) => ({
                  id: c.id,
                  monthlyAmount: Number(c.monthlyAmount),
                  startDate: c.startDate,
                  endDate: c.endDate,
                  lessee: { id: c.lessee.id, legalName: c.lessee.legalName },
                })),
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
