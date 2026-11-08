"use client";

import { ImageOff, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UnitForm } from "@/components/forms/UnitForm";
import { UnitPhotoGallery } from "@/components/properties/UnitPhotoGallery";
import { unitStatusLabel, unitStatusVariant } from "@/shared/i18n/enums";
import { actionDeleteUnit } from "@/server/services/units";
import { actionCountSubjectDependents } from "@/server/services/audit-actions";
import { DependentsWarning } from "@/components/historial/DangerConfirmDialog";
import type { DependentCounts } from "@/server/services/audit-undo";
import type { UnitStatus } from "@/generated/prisma/enums";
import { formatMXN } from "@/shared/format-currency";
export interface UnitCardData {
  id: string;
  code: string;
  name: string | null;
  status: UnitStatus;
  estimatedRent: string | number | null;
  coverPhotoUrl: string | null;
  area?: number | string | null;
  notes?: string | null;
  parentUnitId?: string | null;
  childUnits?: ReadonlyArray<{
    id: string;
    code: string;
    area?: number | string | null;
  }>;
  photos?: ReadonlyArray<{ id: string; url: string; filename: string }>;
  contracts: ReadonlyArray<{
    id: string;
    monthlyAmount: string | number;
    startDate?: string | Date;
    endDate?: string | Date;
    lessee: { id: string; legalName: string };
  }>;
}

export interface SiblingUnit {
  id: string;
  code: string;
  name?: string | null;
  parentUnitId: string | null;
}

function useUnitDialogControls(unit: UnitCardData) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteDeps, setDeleteDeps] = useState<DependentCounts | null>(null);
  const [pending, startTransition] = useTransition();

  // Cuenta dependientes al abrir el borrado, para el aviso destacado.
  useEffect(() => {
    if (!deleteOpen) {
      setDeleteDeps(null);
      return;
    }
    let active = true;
    actionCountSubjectDependents("Unit", unit.id)
      .then((d) => {
        if (active) setDeleteDeps(d);
      })
      .catch(() => {
        if (active) setDeleteDeps(null);
      });
    return () => {
      active = false;
    };
  }, [deleteOpen, unit.id]);

  function openDetail() {
    router.push(`/properties/${unit.id}`);
  }

  function confirmDelete() {
    startTransition(async () => {
      try {
        await actionDeleteUnit(unit.id);
        toast.success(`Local ${unit.code} eliminado.`);
        setDeleteOpen(false);
        router.refresh();
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Error al eliminar.";
        toast.error(msg);
      }
    });
  }

  return {
    router,
    editOpen,
    setEditOpen,
    photosOpen,
    setPhotosOpen,
    deleteOpen,
    setDeleteOpen,
    deleteDeps,
    pending,
    openDetail,
    confirmDelete,
  };
}

type UnitDialogControls = ReturnType<typeof useUnitDialogControls>;

function UnitDialogs({
  unit,
  propertyId,
  controls,
  siblings,
}: {
  unit: UnitCardData;
  propertyId: string;
  controls: UnitDialogControls;
  siblings?: ReadonlyArray<SiblingUnit>;
}) {
  return (
    <>
      <Dialog open={controls.editOpen} onOpenChange={controls.setEditOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar local {unit.code}</DialogTitle>
            <DialogDescription>
              Modifica la información del local.
            </DialogDescription>
          </DialogHeader>
          <UnitForm
            initial={{
              id: unit.id,
              propertyId,
              code: unit.code,
              name: unit.name,
              area:
                unit.area !== null && unit.area !== undefined
                  ? Number(unit.area)
                  : null,
              estimatedRent:
                unit.estimatedRent !== null && unit.estimatedRent !== undefined
                  ? Number(unit.estimatedRent)
                  : null,
              status: unit.status,
              parentUnitId: unit.parentUnitId ?? null,
              notes: unit.notes ?? null,
            }}
            eligibleParents={
              (unit.childUnits?.length ?? 0) > 0
                ? []
                : (siblings ?? [])
                    .filter((s) => s.id !== unit.id && s.parentUnitId === null)
                    .map((s) => ({ id: s.id, code: s.code, name: s.name ?? null }))
            }
            groupedChildren={(unit.childUnits ?? []).map((c) => ({
              id: c.id,
              code: c.code,
            }))}
            onSuccess={() => {
              controls.setEditOpen(false);
              controls.router.refresh();
            }}
            submitLabel="Guardar cambios"
            secondaryAction={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  controls.setEditOpen(false);
                  controls.setDeleteOpen(true);
                }}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
                Eliminar local
              </Button>
            }
          />
        </DialogContent>
      </Dialog>

      <Dialog open={controls.photosOpen} onOpenChange={controls.setPhotosOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              Fotos del local {unit.code}
              {unit.name ? ` · ${unit.name}` : null}
            </DialogTitle>
            <DialogDescription>
              Sube imágenes para este local. La más reciente aparecerá como portada.
            </DialogDescription>
          </DialogHeader>
          <UnitPhotoGallery unitId={unit.id} photos={unit.photos ?? []} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={controls.deleteOpen} onOpenChange={controls.setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar local {unit.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              El local se marcará como inactivo. Los contratos y pagos históricos se
              conservan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {controls.deleteDeps && <DependentsWarning dependents={controls.deleteDeps} />}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={controls.pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                controls.confirmDelete();
              }}
              disabled={controls.pending}
            >
              {controls.pending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface UnitCardProps {
  unit: UnitCardData;
  propertyId: string;
  /** Otras unidades del mismo inmueble para popular el select "Local padre" en el form de edición. */
  siblings?: ReadonlyArray<SiblingUnit>;
}

export function UnitCard({ unit, propertyId, siblings }: UnitCardProps) {
  const controls = useUnitDialogControls(unit);

  const contract = unit.contracts[0] ?? null;
  const lessee = contract?.lessee ?? null;
  const monthly = contract
    ? Number(contract.monthlyAmount)
    : unit.estimatedRent !== null
      ? Number(unit.estimatedRent)
      : null;

  const showUnitName = unit.name && unit.name !== lessee?.legalName;
  const childCount = unit.childUnits?.length ?? 0;
  const displayCode =
    childCount > 0
      ? [unit.code, ...(unit.childUnits ?? []).map((c) => c.code)]
          .sort()
          .join("-")
      : unit.code;

  function handleCardKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      controls.openDetail();
    }
  }

  return (
    <>
      <Card
        onClick={controls.openDetail}
        onKeyDown={handleCardKey}
        role="button"
        tabIndex={0}
        aria-label={`Ver detalle de ${unit.code}`}
        className="group flex h-full cursor-pointer flex-col overflow-hidden p-0 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
          {unit.coverPhotoUrl ? (
            <>
              <Image
                src={unit.coverPhotoUrl}
                alt=""
                aria-hidden
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                className="scale-110 object-cover blur-xl"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-background/40" />
              <Image
                src={unit.coverPhotoUrl}
                alt={unit.code}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                className="object-contain transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/30 to-transparent" />
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground/60">
              <ImageOff className="size-10" />
              <span className="text-[10px] uppercase tracking-wider">Sin foto</span>
            </div>
          )}
          <Badge
            variant={unitStatusVariant(unit.status)}
            className="absolute left-2.5 top-2.5 shadow-sm"
          >
            {unitStatusLabel(unit.status)}
          </Badge>
          <span className="absolute bottom-2.5 left-2.5 rounded-md bg-black/70 px-2 py-0.5 font-mono text-xs font-semibold text-white shadow-sm backdrop-blur-sm">
            {displayCode}
          </span>
          {childCount > 0 ? (
            <span className="absolute bottom-2.5 right-2.5 rounded-md bg-emerald-600/90 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm backdrop-blur-sm">
              {childCount + 1} locales
            </span>
          ) : null}
        </div>
        <CardContent className="flex flex-1 flex-col gap-2 p-4">
          <div className="min-w-0">
            {lessee ? (
              <Link
                href={`/lessees/${lessee.id}`}
                onClick={(e) => e.stopPropagation()}
                className="line-clamp-1 text-sm font-semibold hover:underline"
              >
                {lessee.legalName}
              </Link>
            ) : (
              <p className="text-sm font-semibold text-muted-foreground">
                Disponible
              </p>
            )}
            {showUnitName ? (
              <p className="line-clamp-1 text-xs text-muted-foreground">
                {unit.name}
              </p>
            ) : null}
          </div>

          <div className="mt-auto flex items-baseline justify-between border-t pt-3">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {contract ? "Renta mensual" : "Renta estimada"}
            </span>
            {monthly !== null ? (
              <span
                className={`tabular-nums ${
                  contract
                    ? "text-base font-bold text-foreground"
                    : "text-sm font-medium text-muted-foreground"
                }`}
              >
                {formatMXN(monthly)}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </div>
        </CardContent>
      </Card>

      <UnitDialogs unit={unit} propertyId={propertyId} controls={controls} siblings={siblings} />
    </>
  );
}

export const UNIT_GRID_COLS =
  "minmax(60px, 0.7fr) minmax(90px, 0.9fr) minmax(120px, 2fr) minmax(80px, 1fr)";

interface UnitRowProps {
  unit: UnitCardData;
  propertyId: string;
  siblings?: ReadonlyArray<SiblingUnit>;
}

export function UnitRow({ unit, propertyId, siblings }: UnitRowProps) {
  const controls = useUnitDialogControls(unit);

  const contract = unit.contracts[0] ?? null;
  const lessee = contract?.lessee ?? null;
  const monthly = contract
    ? Number(contract.monthlyAmount)
    : unit.estimatedRent !== null
      ? Number(unit.estimatedRent)
      : null;

  const childCount = unit.childUnits?.length ?? 0;
  const displayCode =
    childCount > 0
      ? [unit.code, ...(unit.childUnits ?? []).map((c) => c.code)]
          .sort()
          .join("-")
      : unit.code;

  function handleRowKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      controls.openDetail();
    }
  }

  return (
    <>
      <div
        role="row"
        onClick={controls.openDetail}
        onKeyDown={handleRowKey}
        tabIndex={0}
        aria-label={`Ver detalle de ${unit.code}`}
        className="grid cursor-pointer items-center border-b text-sm transition-colors last:border-b-0 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
        style={{ gridTemplateColumns: UNIT_GRID_COLS }}
      >
        <div
          role="cell"
          className="truncate px-3 py-2.5 font-mono text-xs font-semibold"
        >
          {displayCode}
          {childCount > 0 ? (
            <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-800">
              {childCount + 1} locales
            </span>
          ) : null}
        </div>
        <div role="cell" className="overflow-hidden px-3 py-2.5">
          <Badge variant={unitStatusVariant(unit.status)}>
            {unitStatusLabel(unit.status)}
          </Badge>
        </div>
        <div role="cell" className="truncate px-3 py-2.5">
          {lessee ? (
            <Link
              href={`/lessees/${lessee.id}`}
              onClick={(e) => e.stopPropagation()}
              className="hover:underline"
            >
              {lessee.legalName}
            </Link>
          ) : (
            <span className="text-muted-foreground">Disponible</span>
          )}
          {unit.name && unit.name !== lessee?.legalName ? (
            <p className="truncate text-xs text-muted-foreground">{unit.name}</p>
          ) : null}
        </div>
        <div
          role="cell"
          className="px-3 py-2.5 text-right font-mono tabular-nums"
        >
          {monthly !== null ? (
            contract ? (
              <span className="font-semibold">{formatMXN(monthly)}</span>
            ) : (
              <span className="text-muted-foreground">
                ~{formatMXN(monthly)}
              </span>
            )
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      </div>

      <UnitDialogs unit={unit} propertyId={propertyId} controls={controls} siblings={siblings} />
    </>
  );
}
