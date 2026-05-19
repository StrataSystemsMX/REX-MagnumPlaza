"use client";

import { useState } from "react";
import {
  PROPERTIES_VIEW_COOKIE,
  type PropertiesViewMode,
} from "@/lib/properties-view-mode";

const ONE_YEAR = 60 * 60 * 24 * 365;

export function usePropertiesViewMode(
  initial: PropertiesViewMode,
): [PropertiesViewMode, (v: PropertiesViewMode) => void] {
  const [view, setView] = useState<PropertiesViewMode>(initial);

  function update(next: PropertiesViewMode) {
    setView(next);
    try {
      document.cookie = `${PROPERTIES_VIEW_COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    } catch {
      // ignore
    }
  }

  return [view, update];
}
