"use client";

import { Loader2, Trash2 } from "lucide-react";
import Image from "next/image";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UnitPhotoUploader } from "@/components/properties/UnitPhotoUploader";
import { actionDeleteUnitPhoto } from "@/lib/services/unit-photos";

interface Photo {
  id: string;
  url: string;
  filename: string;
}

interface Props {
  unitId: string;
  photos: ReadonlyArray<Photo>;
}

export function UnitPhotoGallery({ unitId, photos }: Props) {
  const router = useRouter();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Photo | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      try {
        await actionDeleteUnitPhoto({ documentId: target.id });
        toast.success("Foto eliminada.");
        setDeleteTarget(null);
        router.refresh();
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Error al eliminar.";
        toast.error(msg);
      }
    });
  }

  return (
    <div className="space-y-4">
      <UnitPhotoUploader unitId={unitId} onUploaded={() => router.refresh()} />

      {photos.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aún no hay fotos para esta unidad.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="group relative aspect-[4/3] overflow-hidden rounded-md border bg-muted"
            >
              <button
                type="button"
                onClick={() => setPreviewUrl(photo.url)}
                className="absolute inset-0"
                aria-label={`Ver ${photo.filename}`}
              >
                <Image
                  src={photo.url}
                  alt={photo.filename}
                  fill
                  sizes="(max-width: 640px) 50vw, 33vw"
                  className="object-cover transition-transform group-hover:scale-105"
                />
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(photo)}
                className="absolute right-2 top-2 rounded-full bg-background/90 p-1.5 opacity-0 shadow transition-opacity hover:bg-background group-hover:opacity-100"
                aria-label={`Eliminar ${photo.filename}`}
              >
                <Trash2 className="size-4 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={previewUrl !== null}
        onOpenChange={(open) => !open && setPreviewUrl(null)}
      >
        <DialogContent className="max-w-4xl p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>Vista previa</DialogTitle>
          </DialogHeader>
          {previewUrl ? (
            <div className="relative aspect-[4/3] w-full">
              <Image
                src={previewUrl}
                alt="Vista previa"
                fill
                sizes="100vw"
                className="object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && !pending && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar foto?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará &quot;{deleteTarget?.filename}&quot; de la unidad. Esta acción
              no se puede deshacer.
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
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {pending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
