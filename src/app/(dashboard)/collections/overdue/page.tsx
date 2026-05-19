import { redirect } from "next/navigation";

const ALLOWED_ESCALONES = new Set(["1m", "2m", "3m"]);

export default async function OverdueCollectionsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const escalon = tab && ALLOWED_ESCALONES.has(tab) ? tab : "1m";
  redirect(`/collections?tab=por-cobrar&escalon=${escalon}`);
}
