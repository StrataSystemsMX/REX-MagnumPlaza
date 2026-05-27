"use client";

import React from "react";
import { EntityBudgetCard } from "./EntityBudgetCard";
import { BudgetClosingSection } from "./BudgetClosingSection";
import type { ConsolidatedBudget } from "@/lib/services/budgets-types";

interface Props {
  consolidated: ConsolidatedBudget;
}

export function ConsolidatedBudgetView({ consolidated }: Props) {
  return (
    <div>
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Razones sociales</h2>
          <p className="text-xs text-muted-foreground">
            Resumen anual por entidad. Haz clic en una tarjeta para ver el detalle.
          </p>
        </div>

        <div className="space-y-3">
          {consolidated.entities.map((entity) => (
            <EntityBudgetCard key={entity.legalEntityId} entity={entity} />
          ))}
        </div>
      </section>

      <div className="mt-8">
        <BudgetClosingSection consolidated={consolidated} />
      </div>
    </div>
  );
}
