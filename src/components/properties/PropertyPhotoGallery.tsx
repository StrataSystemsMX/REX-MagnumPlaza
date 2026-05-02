"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PropertyPhotoUploader } from "@/components/properties/PropertyPhotoUploader";
import { actionDeletePropertyPhoto } from "@/lib/services/property-photos";

interface Photo {
  id: string;
  url: string;
  filename: string;
}

interface Props {
  propertyId: string;
  photos: ReadonlyArray<Photo>;
  canEdit: boolean;
}

export function PropertyPhotoGallery({ propertyId, photos, canEdit }: Props) {
  const router = useRouter();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Photo | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      try {
        await actionDeletePropertyPhoto({ documentId: target.id });
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
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {photos.length === 0
            ? "Aún no hay fotos."
            : `${photos.length} foto${photos.length === 1 ? "" : "s"}. La más reciente aparece como portada.`}
        </p>
        {canEdit ? (
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger render={<Button />}>
              <Plus className="size-4" />
              Subir fotos
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Subir fotos del inmueble</DialogTitle>
                <DialogDescription>
                  Las imágenes se guardan en almacenamiento seguro y se asocian a este
                  inmueble.
                </DialogDescription>
              </DialogHeader>
              <PropertyPhotoUploader
                propertyId={propertyId}
                onUploaded={() => {
                  setUploadOpen(false);
                  router.refresh();
                }}
              />
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      {photos.length === 0 ? (
        <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
          Sube la primera foto para que aparezca como portada en el listado.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-cover transition-transform group-hover:scale-105"
                />
              </button>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => setDeleteTarget(photo)}
                  className="absolute right-2 top-2 rounded-full bg-background/90 p-1.5 opacity-0 shadow transition-opacity hover:bg-background group-hover:opacity-100"
                  aria-label={`Eliminar ${photo.filename}`}
                >
                  <Trash2 className="size-4 text-destructive" />
                </button>
              ) : null}
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
              Se borrará &quot;{deleteTarget?.filename}&quot; del inmueble. Esta acción
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
    </>
  );
}
