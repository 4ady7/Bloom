import { redirect } from "next/navigation";
import { Composer } from "@/components/Composer";
import { getCurrentUser } from "@/server/current";
import { getRelationship } from "@/server/relationship";

export const dynamic = "force-dynamic";

export default async function SendPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const relationship = getRelationship(user.id);
  if (!relationship || relationship.status !== "active" || !relationship.partner) redirect("/pair");
  return <Composer timezone={user.timezone} partnerName={relationship.partner.displayName} />;
}
