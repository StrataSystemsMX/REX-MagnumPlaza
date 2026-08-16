"use client";

import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
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
  actionDeleteContractDocument,
  actionUploadContractDocument,
} from "@/server/services/contract-documents";
import {
  ALLOWED_CONTRACT_DOCUMENT_MIME_TYPES,
  MAX_CONTRACT_DOCUMENT_SIZE_BYTES,
  contractDocumentFileSchema,
} from "@/shared/validators/document";
import { capitalizeFirst } from "@/shared/utils";

interface ContractDocument {
  id: string;
  filename: string;
  url: string;
  type: string;
  sizeBytes: number | null;
  createdAt: Date;
}

interface Props {
  contractId: string;
  documents: ReadonlyArray<ContractDocument>;
  canEdit: boolean;
}

const ACCEPT = ALLOWED_CONTRACT_DOCUMENT_MIME_TYPES.join(",");
const MAX_MB = MAX_CONTRACT_DOCUMENT_SIZE_BYTES / 1024 / 1024;

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

export function ContractDocumentManager({ contractId, documents, canEdit }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<ContractDocument | null>(null);
  const [deleting, startDelete] = useTransition();

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (files.length === 0) return;

    const valid: File[] = [];
    for (const file of files) {
      const result = contractDocumentFileSchema.safeParse(file);
      if (!result.success) {
        toast.error(`${file.name}: ${result.error.issues[0]?.message ?? "inválido"}`);
        continue;
      }
      valid.push(file);
    }
    if (valid.length === 0) return;

    startUpload(async () => {
      let succeeded = 0;
      for (const file of valid) {
        try {
          const fd = new FormData();
          fd.set("contractId", contractId);
          fd.set("file", file);
          await actionUploadContractDocument(fd);
          succeeded += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Error al subir.";
          toast.error(`${file.name}: ${msg}`);
          break;
        }
      }
      if (succeeded > 0) {
        toast.success(
          succeeded === 1
            ? "Documento subido."
            : `${succeeded} documentos subidos.`,
        );
        router.refresh();
      }
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startDelete(async () => {
      try {
        await actionDeleteContractDocument({ documentId: target.id });
        toast.success("Documento eliminado.");
        setDeleteTarget(null);
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error al eliminar.";
        toast.error(msg);
      }
    });
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {documents.length === 0
              ? "Aún no hay documentos."
              : `${documents.length} documento${documents.length === 1 ? "" : "s"}.`}
          </p>
          {canEdit ? (
            <>
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
                {uploading ? "Subiendo…" : "Subir contrato firmado"}
              </Button>
            </>
          ) : null}
        </div>

        {documents.length === 0 ? (
          <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
            {canEdit
              ? `Sube el contrato firmado en PDF (máx. ${MAX_MB} MB). Quedará asociado a este contrato y disponible para descarga.`
              : "No tienes permiso para subir documentos."}
          </div>
        ) : (
          <ul className="divide-y rounded-md border bg-card">
            {documents.map((d) => (
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
                    {capitalizeFirst(DATETIME.format(d.createdAt))} · {formatSize(d.sizeBytes)}
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
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará &quot;{deleteTarget?.filename}&quot; del contrato. Esta
              acción no se puede deshacer.
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
              {deleting ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
