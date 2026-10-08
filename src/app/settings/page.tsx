import Link from "next/link";
import { redirect } from "next/navigation";
import { SettingsForm } from "@/components/SettingsForm";
import { getCurrentUser } from "@/server/current";
import { getRelationship } from "@/server/relationship";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const relationship = getRelationship(user.id);
  return (
    <>
      <div className="plain-page" style={{ paddingBottom: 0 }}>
        <Link href="/home" className="quiet-link">
          Back
        </Link>
      </div>
      <SettingsForm user={user} partnerName={relationship?.status === "active" ? relationship.partner?.displayName ?? null : null} />
    </>
  );
}
