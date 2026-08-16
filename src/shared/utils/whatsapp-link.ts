export function buildWhatsAppUrl(phone: string, message: string): string {
  const sanitized = phone.replace(/\D/g, "");
  return `https://wa.me/${sanitized}?text=${encodeURIComponent(message)}`;
}
