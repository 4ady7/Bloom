import { redirect } from "next/navigation";
import { Pairing } from "@/components/Pairing";
import { getCurrentUser } from "@/server/current";
import { getRelationship } from "@/server/relationship";

export const dynamic = "force-dynamic";

export default async function PairPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const relationship = getRelationship(user.id);
  if (relationship?.status === "active") redirect("/home");
  return <Pairing pending={relationship?.status === "pending"} />;
}
