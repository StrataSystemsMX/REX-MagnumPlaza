"use client";

import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UnitForm } from "@/components/forms/UnitForm";
import { unitStatusLabel, unitStatusVariant } from "@/lib/i18n/enums";
import { actionDeleteUnit } from "@/lib/services/units";
import type { UnitWithContract } from "@/lib/services/properties-queries";

interface UnitTableProps {
  propertyId: string;
  units: ReadonlyArray<UnitWithContract>;
}

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

export function UnitTable({ propertyId, units }: UnitTableProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UnitWithContract | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UnitWithContract | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      try {
        await actionDeleteUnit(target.id);
        toast.success(`Unidad ${target.code} eliminada.`);
        setDeleteTarget(null);
        router.refresh();
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Error al eliminar.";
        toast.error(msg);
      }
    });
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {units.length} unidad{units.length === 1 ? "" : "es"} activa{units.length === 1 ? "" : "s"}.
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

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead className="text-right">Área (m²)</TableHead>
              <TableHead className="text-right">Renta estimada</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Inquilino actual</TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  Aún no hay unidades. Usa &quot;Nueva Unidad&quot; para agregarlas.
                </TableCell>
              </TableRow>
            ) : (
              units.map((u) => {
                const contract = u.contracts[0] ?? null;
                const lessee = contract?.lessee ?? null;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-sm">{u.code}</TableCell>
                    <TableCell>{u.name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {u.area !== null ? Number(u.area).toLocaleString("es-MX") : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {u.estimatedRent !== null ? MXN.format(Number(u.estimatedRent)) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={unitStatusVariant(u.status)}>
                        {unitStatusLabel(u.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {lessee ? (
                        <div className="text-sm">
                          <p className="font-medium">{lessee.legalName}</p>
                          {lessee.contactName ? (
                            <p className="text-xs text-muted-foreground">
                              {lessee.contactName}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Acciones</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditTarget(u)}>
                            <Pencil className="size-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(u)}
                          >
                            <Trash2 className="size-4" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar unidad</DialogTitle>
            <DialogDescription>
              Modifica la información de la unidad {editTarget?.code}.
            </DialogDescription>
          </DialogHeader>
          {editTarget ? (
            <UnitForm
              initial={{
                id: editTarget.id,
                propertyId,
                code: editTarget.code,
                name: editTarget.name,
                area: editTarget.area,
                estimatedRent:
                  editTarget.estimatedRent !== null
                    ? Number(editTarget.estimatedRent)
                    : null,
                status: editTarget.status,
                notes: editTarget.notes,
              }}
              onSuccess={() => {
                setEditTarget(null);
                router.refresh();
              }}
              submitLabel="Guardar cambios"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar unidad?</AlertDialogTitle>
            <AlertDialogDescription>
              La unidad {deleteTarget?.code} se marcará como inactiva. Los contratos y pagos
              históricos se conservan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={pending}
            >
              {pending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
