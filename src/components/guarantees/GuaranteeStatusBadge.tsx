import type { GuaranteeStatus } from "@/generated/prisma/enums";

const CONFIG: Record<GuaranteeStatus, { label: string; className: string }> = {
  HELD: {
    label: "En custodia",
    className: "bg-blue-100 text-blue-800",
  },
  PARTIALLY_RETURNED: {
    label: "Devolución parcial",
    className: "bg-amber-100 text-amber-800",
  },
  RETURNED: {
    label: "Devuelto",
    className: "bg-emerald-100 text-emerald-800",
  },
};

export function GuaranteeStatusBadge({ status }: { status: GuaranteeStatus }) {
  const { label, className } = CONFIG[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
