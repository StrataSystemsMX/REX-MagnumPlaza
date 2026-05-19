import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<{ year?: string }>;
}

export default async function YearlyCollectionsRedirect({ searchParams }: PageProps) {
  const params = await searchParams;
  const qs = params.year ? `?year=${encodeURIComponent(params.year)}` : "";
  redirect(`/ingresos${qs}`);
}
