"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/server/auth/get-session";
import { VIEW_PREFERENCE_COOKIE } from "@/server/mobile/viewport";

const viewPreferenceSchema = z.enum(["mobile", "desktop"]);

/** Fija la vista preferida (móvil / escritorio) para este navegador. */
export async function actionSetViewPreference(input: "mobile" | "desktop"): Promise<void> {
  await requireAuth();
  const view = viewPreferenceSchema.parse(input);
  (await cookies()).set(VIEW_PREFERENCE_COOKIE, view, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
