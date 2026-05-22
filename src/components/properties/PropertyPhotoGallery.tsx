"use client";

import { ImagePlus, Loader2, Trash2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
  isPlaza?: boolean;
}

const MIN_SLOTS = 4;

export function PropertyPhotoGallery({
  propertyId,
  photos,
  canEdit,
  isPlaza = false,
}: Props) {
  const subjectLabel = isPlaza ? "la plaza" : "el inmueble";
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

  const emptySlots = Math.max(0, MIN_SLOTS - photos.length);

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {photos.length === 0
          ? "Aún no hay fotos. Haz click en cualquier recuadro para subir."
          : `${photos.length} foto${photos.length === 1 ? "" : "s"}. La más reciente aparece como portada.`}
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
          >
            <button
              type="button"
              onClick={() => setPreviewUrl(photo.url)}
              className="absolute inset-0"
              aria-label={`Ver ${photo.filename}`}
            >
              <Image
                src={photo.url}
                alt=""
                aria-hidden
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="scale-110 object-cover blur-xl"
              />
              <div className="absolute inset-0 bg-background/30" />
              <Image
                src={photo.url}
                alt={photo.filename}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-contain transition-transform group-hover:scale-105"
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

        {canEdit
          ? Array.from({ length: emptySlots }).map((_, i) => (
              <button
                key={`empty-${i}`}
                type="button"
                onClick={() => setUploadOpen(true)}
                aria-label="Subir foto"
                className="group flex aspect-square items-center justify-center rounded-lg border border-dashed bg-muted/40 transition-colors hover:border-primary/50 hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ImagePlus className="size-10 text-muted-foreground/40 transition-colors group-hover:text-primary/70" />
              </button>
            ))
          : null}
      </div>

      {canEdit ? (
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Subir fotos de {subjectLabel}</DialogTitle>
              <DialogDescription>
                Las imágenes se guardan en almacenamiento seguro y se asocian a{" "}
                {subjectLabel}.
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

      <Dialog
        open={previewUrl !== null}
        onOpenChange={(open) => !open && setPreviewUrl(null)}
      >
        <DialogContent className="w-fit max-h-none max-w-none gap-0 overflow-hidden border-none bg-transparent p-0 shadow-none ring-0 sm:max-w-none">
          <DialogHeader className="sr-only">
            <DialogTitle>Vista previa</DialogTitle>
          </DialogHeader>
          {previewUrl ? (
            <div
              className="flex h-[96vh] w-[98vw] cursor-zoom-out items-center justify-center"
              onClick={() => setPreviewUrl(null)}
            >
              <Image
                src={previewUrl}
                alt="Vista previa"
                width={3840}
                height={2160}
                sizes="98vw"
                className="h-auto max-h-[96vh] w-auto max-w-[98vw] cursor-default rounded-md object-contain"
                style={{ width: "auto", height: "auto" }}
                priority
                onClick={(e) => e.stopPropagation()}
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
