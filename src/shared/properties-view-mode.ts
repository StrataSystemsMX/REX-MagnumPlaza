export const PROPERTIES_VIEW_COOKIE = "rex_properties_view";

export type PropertiesViewMode = "cards" | "table";

export function parsePropertiesViewMode(
  value: string | undefined | null,
): PropertiesViewMode {
  return value === "table" ? "table" : "cards";
}
