"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";

interface YearSelectorProps {
  currentYear: number;
  options: number[];
}

export function YearSelector({ currentYear, options }: YearSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("year", e.target.value);
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`);
    });
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="year" className="text-muted-foreground">
        Ejercicio
      </label>
      <select
        id="year"
        name="year"
        value={String(currentYear)}
        onChange={handleChange}
        disabled={isPending}
        className="rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      >
        {options.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
