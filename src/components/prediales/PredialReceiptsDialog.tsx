"use client";

import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  actionDeleteCadastralReceipt,
  actionUploadCadastralReceipt,
} from "@/lib/services/cadastral";
import type { CadastralListItem } from "@/lib/services/cadastral-queries";
import {
  ALLOWED_CADASTRAL_RECEIPT_MIME_TYPES,
  MAX_CADASTRAL_RECEIPT_SIZE_BYTES,
  cadastralReceiptFileSchema,
} from "@/lib/validators/cadastral";
import { capitalizeFirst } from "@/lib/utils";

const ACCEPT = ALLOWED_CADASTRAL_RECEIPT_MIME_TYPES.join(",");
const MAX_MB = MAX_CADASTRAL_RECEIPT_SIZE_BYTES / 1024 / 1024;

const DATETIME = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

type ReceiptDoc = CadastralListItem["documents"][number];

interface Props {
  target: CadastralListItem | null;
  canEdit: boolean;
  onClose: () => void;
}

export function PredialReceiptsDialog({ target, canEdit, onClose }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<ReceiptDoc[]>([]);
  const [uploading, startUpload] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<ReceiptDoc | null>(null);

  useEffect(() => {
    if (target) setDocs([...target.documents]);
  }, [target]);

  if (!target) return null;

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (!target) return;
    const targetPayment = target;
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (files.length === 0) return;

    const valid: File[] = [];
    for (const f of files) {
      const r = cadastralReceiptFileSchema.safeParse(f);
      if (!r.success) {
        toast.error(`${f.name}: ${r.error.issues[0]?.message ?? "inválido"}`);
        continue;
      }
      valid.push(f);
    }
    if (valid.length === 0) return;

    startUpload(async () => {
      let ok = 0;
      for (const f of valid) {
        try {
          const fd = new FormData();
          fd.set("cadastralPaymentId", targetPayment.id);
          fd.set("file", f);
          const created = await actionUploadCadastralReceipt(fd);
          ok += 1;
          setDocs((prev) => [
            {
              id: created.id,
              filename: created.filename,
              url: created.url,
              mimeType: f.type,
              sizeBytes: f.size,
              createdAt: new Date(),
            },
            ...prev,
          ]);
        } catch (err) {
          toast.error(
            err instanceof Error ? `${f.name}: ${err.message}` : "Error.",
          );
          break;
        }
      }
      if (ok > 0) {
        toast.success(ok === 1 ? "Boleta subida." : `${ok} boletas subidas.`);
        router.refresh();
      }
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const t = deleteTarget;
    startDelete(async () => {
      try {
        await actionDeleteCadastralReceipt({ documentId: t.id });
        setDocs((prev) => prev.filter((d) => d.id !== t.id));
        toast.success("Boleta eliminada.");
        setDeleteTarget(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error.");
      }
    });
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && !uploading && onClose()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Boletas del predial</DialogTitle>
            <DialogDescription>
              {target.propertyName} · {target.year}
              {target.cadastralKey ? ` · clave ${target.cadastralKey}` : ""}
            </DialogDescription>
          </DialogHeader>

          {canEdit ? (
            <div className="space-y-1">
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                multiple
                className="hidden"
                onChange={handleSelect}
              />
              <Button
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                {uploading ? "Subiendo…" : "Subir boleta"}
              </Button>
              <p className="text-xs text-muted-foreground">
                PDF, JPG o PNG. Máximo {MAX_MB} MB por archivo.
              </p>
            </div>
          ) : null}

          {docs.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              {canEdit
                ? "Aún no hay boletas. Sube la boleta predial generada por el ayuntamiento."
                : "No hay boletas adjuntas."}
            </div>
          ) : (
            <ul className="divide-y rounded-md border bg-card">
              {docs.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center gap-3 p-3 text-sm"
                >
                  <FileText className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate font-medium hover:underline"
                    >
                      {d.filename}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {capitalizeFirst(DATETIME.format(d.createdAt))} ·{" "}
                      {formatSize(d.sizeBytes)}
                    </p>
                  </div>
                  {canEdit ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(d)}
                      aria-label={`Eliminar ${d.filename}`}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={onClose} disabled={uploading}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar boleta?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará &quot;{deleteTarget?.filename}&quot;. Esta acción no
              se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
