import { redirect } from "next/navigation";

export default function RentasPage() {
  redirect("/collections?tab=rentas");
}
