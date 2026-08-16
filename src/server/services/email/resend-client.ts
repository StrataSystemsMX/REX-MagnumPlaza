import { Resend } from "resend";

let cached: Resend | null = null;

export function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!cached) cached = new Resend(key);
  return cached;
}

export function getResendFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL ?? "no-reply@strata.mx";
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}
