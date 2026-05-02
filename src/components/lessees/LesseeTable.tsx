"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type ColumnDef,
  useReactTable,
} from "@tanstack/react-table";
import { ExternalLink, LayoutGrid, List, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LesseeForm } from "@/components/forms/LesseeForm";
import { TenantCard } from "@/components/lessees/TenantCard";
import { cn } from "@/lib/utils";
import { communicationChannelLabel } from "@/lib/i18n/enums";
import { actionDeleteLessee } from "@/lib/services/lessees";
import type { LesseeListItem } from "@/lib/services/lessees-queries";

interface LesseeTableProps {
  lessees: ReadonlyArray<LesseeListItem>;
}

export function LesseeTable({ lessees }: LesseeTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"table" | "cards">("table");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LesseeListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LesseeListItem | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lessees;
    return lessees.filter((l) => {
      return (
        l.legalName.toLowerCase().includes(q) ||
        (l.contactName?.toLowerCase().includes(q) ?? false) ||
        (l.rfc?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [lessees, search]);

  const columns = useMemo<ColumnDef<LesseeListItem>[]>(
    () => [
      {
        accessorKey: "legalName",
        header: "Razón social",
        cell: ({ row }) => (
          <div>
            <Link
              href={`/lessees/${row.original.id}`}
              className="font-medium hover:underline"
            >
              {row.original.legalName}
            </Link>
            {row.original.rfc ? (
              <p className="text-xs text-muted-foreground font-mono">{row.original.rfc}</p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "contactName",
        header: "Contacto",
        cell: ({ row }) => (
          <span className="text-sm">{row.original.contactName ?? "—"}</span>
        ),
      },
      {
        id: "phones",
        header: "Teléfono / WhatsApp",
        cell: ({ row }) => (
          <div className="text-xs">
            {row.original.phone ? <p>📞 {row.original.phone}</p> : null}
            {row.original.whatsapp ? <p>💬 {row.original.whatsapp}</p> : null}
            {!row.original.phone && !row.original.whatsapp ? (
              <span className="text-muted-foreground">—</span>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "preferredChannel",
        header: "Canal preferido",
        cell: ({ row }) => (
          <Badge variant="secondary">
            {communicationChannelLabel(row.original.preferredChannel)}
          </Badge>
        ),
      },
      {
        accessorKey: "activeContractsCount",
        header: () => <span>Contratos activos</span>,
        cell: ({ row }) => {
          const n = row.original.activeContractsCount;
          return (
            <span className="text-sm tabular-nums">
              {n > 0 ? (
                <Badge>{n}</Badge>
              ) : (
                <span className="text-muted-foreground">0</span>
              )}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Acciones</span>,
        cell: ({ row }) => (
          <div className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Acciones</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem render={<Link href={`/lessees/${row.original.id}`} />}>
                  <ExternalLink className="size-4" />
                  Ver detalle
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEditTarget(row.original)}>
                  <Pencil className="size-4" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteTarget(row.original)}
                >
                  <Trash2 className="size-4" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filtered as LesseeListItem[],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      try {
        await actionDeleteLessee(target.id);
        toast.success(`Inquilino "${target.legalName}" eliminado.`);
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
      <div className="flex items-center justify-between gap-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por razón social, contacto o RFC..."
          className="max-w-sm"
        />
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Cambiar vista"
            className="inline-flex h-8 overflow-hidden rounded-lg ring-1 ring-foreground/10"
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={view === "table"}
              onClick={() => setView("table")}
              className={cn(
                "h-8 rounded-none px-2.5",
                view === "table" && "bg-muted text-foreground",
              )}
            >
              <List className="size-3.5" />
              Tabla
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={view === "cards"}
              onClick={() => setView("cards")}
              className={cn(
                "h-8 rounded-none px-2.5",
                view === "cards" && "bg-muted text-foreground",
              )}
            >
              <LayoutGrid className="size-3.5" />
              Tarjetas
            </Button>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Nuevo inquilino
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Nuevo inquilino</DialogTitle>
              <DialogDescription>
                Captura los datos del inquilino. Después podrás vincularlo a contratos.
              </DialogDescription>
            </DialogHeader>
            <LesseeForm
              onSuccess={() => {
                setCreateOpen(false);
                router.refresh();
              }}
              submitLabel="Crear inquilino"
            />
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {view === "table" ? (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => (
                    <TableHead key={h.id}>
                      {h.isPlaceholder
                        ? null
                        : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No hay inquilinos registrados.
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No hay inquilinos registrados.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((lessee) => (
            <TenantCard key={lessee.id} lessee={lessee} />
          ))}
        </div>
      )}

      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar inquilino</DialogTitle>
            <DialogDescription>
              Modifica la información de {editTarget?.legalName}.
            </DialogDescription>
          </DialogHeader>
          {editTarget ? (
            <LesseeForm
              initial={{
                id: editTarget.id,
                legalName: editTarget.legalName,
                contactName: editTarget.contactName,
                rfc: editTarget.rfc,
                email: editTarget.email,
                phone: editTarget.phone,
                whatsapp: editTarget.whatsapp,
                preferredChannel: editTarget.preferredChannel,
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
            <AlertDialogTitle>¿Eliminar inquilino?</AlertDialogTitle>
            <AlertDialogDescription>
              Se marcará como inactivo &quot;{deleteTarget?.legalName}&quot;. Sus contratos y
              pagos históricos se conservan.
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
