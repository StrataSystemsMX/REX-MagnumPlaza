import { cookies, headers } from "next/headers";
import { userAgent } from "next/server";
import { cache } from "react";

/** Cookie con la preferencia explícita de vista ("mobile" | "desktop"). */
export const VIEW_PREFERENCE_COOKIE = "rex_view";

export type ViewPreference = "mobile" | "desktop";

/**
 * ¿El request viene de un teléfono? Se decide en el servidor por user-agent
 * para renderizar UN solo árbol (móvil o escritorio) y no duplicar queries ni
 * DOM. Tablets y desktops angostos siguen viendo la versión de escritorio
 * (que ya es responsiva).
 */
export const isPhoneUserAgent = cache(async (): Promise<boolean> => {
  const { device } = userAgent({ headers: await headers() });
  return device.type === "mobile";
});

/**
 * Vista a renderizar en el request actual. La cookie `rex_view` (que el
 * usuario fija con "Ver versión de escritorio/móvil") tiene prioridad sobre
 * la detección por user-agent.
 */
export const getIsMobileView = cache(async (): Promise<boolean> => {
  const pref = (await cookies()).get(VIEW_PREFERENCE_COOKIE)?.value;
  if (pref === "mobile") return true;
  if (pref === "desktop") return false;
  return isPhoneUserAgent();
});
