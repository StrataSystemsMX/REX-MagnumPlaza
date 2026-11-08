"use client";

import { Camera, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PropertyForm } from "@/components/forms/PropertyForm";
import { UnitForm } from "@/components/forms/UnitForm";
import { PropertyPhotoGallery } from "@/components/properties/PropertyPhotoGallery";
import { UnitPhotoGallery } from "@/components/properties/UnitPhotoGallery";
import { DependentsWarning } from "@/components/historial/DangerConfirmDialog";
import { actionCountSubjectDependents } from "@/server/services/audit-actions";
import { actionDeleteProperty } from "@/server/services/properties";
import { actionDeleteUnit } from "@/server/services/units";
import type { DependentCounts } from "@/server/services/audit-undo";
import type { UnitDetail } from "@/server/services/units-queries";
import type { LegalEntityOption } from "@/server/services/properties-queries";
import { isPlaza } from "@/shared/i18n/unit-label";

interface Props {
  unit: UnitDetail;
  legalEntities: ReadonlyArray<LegalEntityOption>;
}

/**
 * Editar/Fotos/Eliminar para la vista unificada de local/inmueble. Bifurca
 * entre editar el Unit (local dentro de una plaza) o la Property (inmueble
 * individual, donde el "local" ES el inmueble) — mismo criterio que ya usa
 * el resto de la app (isPlaza). Sin gate de permiso a nivel UI, igual que
 * InmueblesTable/PlazasTable — las Server Actions ya lo exigen internamente.
 */
export function UnitDetailActions({ unit, legalEntities }: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteDeps, setDeleteDeps] = useState<DependentCounts | null>(null);
  const [pending, startTransition] = useTransition();

  const plaza = isPlaza(unit.property.type);
  const deleteSubjectId = plaza ? unit.id : unit.property.id;
  const deleteLabel = plaza ? `local ${unit.code}` : `inmueble "${unit.property.name}"`;

  useEffect(() => {
    if (!deleteOpen) {
      setDeleteDeps(null);
      return;
    }
    let active = true;
    actionCountSubjectDependents(plaza ? "Unit" : "Property", deleteSubjectId)
      .then((d) => {
        if (active) setDeleteDeps(d);
      })
      .catch(() => {
        if (active) setDeleteDeps(null);
      });
    return () => {
      active = false;
    };
  }, [deleteOpen, plaza, deleteSubjectId]);

  function confirmDelete() {
    startTransition(async () => {
      try {
        if (plaza) {
          await actionDeleteUnit(unit.id);
        } else {
          await actionDeleteProperty(unit.property.id);
        }
        toast.success(`${plaza ? "Local" : "Inmueble"} eliminado.`);
        router.push(plaza ? "/plazas" : "/plazas?tab=inmuebles");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Error al eliminar.");
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setPhotosOpen(true)}>
          <Camera className="size-4" />
          Fotos
        </Button>
        <Button size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="size-4" />
          Editar
        </Button>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl">
          {plaza ? (
            <>
              <DialogHeader>
                <DialogTitle>Editar local {unit.code}</DialogTitle>
                <DialogDescription>Modifica la información del local.</DialogDescription>
              </DialogHeader>
              <UnitForm
                initial={{
                  id: unit.id,
                  propertyId: unit.property.id,
                  code: unit.code,
                  name: unit.name,
                  area: unit.area,
                  estimatedRent: unit.estimatedRent,
                  status: unit.status,
                  depositMonths: unit.depositMonths,
                  minContractMonths: unit.minContractMonths,
                  maintenanceFee: unit.maintenanceFee,
                  availableFrom: unit.availableFrom,
                  includedServices: unit.includedServices,
                  parentUnitId: unit.parentUnit?.id ?? null,
                  notes: unit.notes,
                }}
                eligibleParents={
                  unit.childUnits.length > 0
                    ? []
                    : unit.siblings
                        .filter((s) => s.parentUnitId === null)
                        .map((s) => ({ id: s.id, code: s.code, name: s.name ?? null }))
                }
                groupedChildren={unit.childUnits.map((c) => ({ id: c.id, code: c.code }))}
                onSuccess={() => {
                  setEditOpen(false);
                  router.refresh();
                }}
                submitLabel="Guardar cambios"
                secondaryAction={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditOpen(false);
                      setDeleteOpen(true);
                    }}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                    Eliminar local
                  </Button>
                }
              />
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Editar inmueble</DialogTitle>
                <DialogDescription>
                  Modifica la información de {unit.property.name}.
                </DialogDescription>
              </DialogHeader>
              <PropertyForm
                legalEntities={legalEntities}
                initial={{
                  id: unit.property.id,
                  name: unit.property.name,
                  type: unit.property.type,
                  status: unit.property.status,
                  address: unit.property.address,
                  ownerEntityId: unit.property.ownerEntity.id,
                  managerEntityId: unit.property.managerEntity.id,
                  cadastralKey: unit.property.cadastralKey,
                  latitude: unit.property.latitude,
                  longitude: unit.property.longitude,
                  totalArea: unit.property.totalArea,
                  notes: unit.property.notes,
                  insuranceProvider: unit.property.insuranceProvider,
                  insurancePolicyNumber: unit.property.insurancePolicyNumber,
                  insuranceExpiresAt: unit.property.insuranceExpiresAt,
                }}
                onSuccess={() => {
                  setEditOpen(false);
                  router.refresh();
                }}
                submitLabel="Guardar cambios"
                secondaryAction={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditOpen(false);
                      setDeleteOpen(true);
                    }}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                    Eliminar inmueble
                  </Button>
                }
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={photosOpen} onOpenChange={setPhotosOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Fotos {plaza ? `del local ${unit.code}` : `de ${unit.property.name}`}</DialogTitle>
            <DialogDescription>
              Sube imágenes {plaza ? "de este local" : "de este inmueble"}. La más reciente
              aparecerá como portada.
            </DialogDescription>
          </DialogHeader>
          {plaza ? (
            <UnitPhotoGallery unitId={unit.id} photos={unit.photos} />
          ) : (
            <PropertyPhotoGallery
              propertyId={unit.property.id}
              photos={unit.property.photos}
              canEdit
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {deleteLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              {plaza
                ? "El local se marcará como inactivo. Los contratos y pagos históricos se conservan."
                : "El inmueble se marcará como inactivo. Los contratos y pagos históricos se conservan."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteDeps && <DependentsWarning dependents={deleteDeps} />}
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
