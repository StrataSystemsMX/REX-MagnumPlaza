"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  year: number;
  availableYears: ReadonlyArray<number>;
}

export function LegalEntityYearNav({ year, availableYears }: Props) {
  function goToYear(target: number) {
    const url = new URL(window.location.href);
    url.searchParams.set("year", String(target));
    window.location.href = url.toString();
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => goToYear(year - 1)}
        aria-label="Año anterior"
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Select
        value={String(year)}
        onValueChange={(v) => v && goToYear(Number(v))}
        items={Object.fromEntries(availableYears.map((y) => [String(y), String(y)]))}
      >
        <SelectTrigger className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {availableYears.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => goToYear(year + 1)}
        aria-label="Año siguiente"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
