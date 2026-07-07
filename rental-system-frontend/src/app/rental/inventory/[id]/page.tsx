import { redirect } from "next/navigation";

export default function RentalInventoryDetailRedirectPage({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/rental/${encodeURIComponent(params.id)}`);
}
