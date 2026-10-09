import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Chrome";
import { GardenList } from "@/components/GardenList";
import { getCurrentUser } from "@/server/current";
import { listGardens } from "@/server/gardens";
import { getRelationship } from "@/server/relationship";

export const dynamic = "force-dynamic";

export default async function GardensPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const relationship = getRelationship(user.id);
  if (!relationship || relationship.status !== "active") redirect("/pair");
  const gardens = listGardens(user.id);
  return (
    <main className="plain-page gardens-index" id="content">
      <header className="topbar">
        <Link href="/home" className="word">
          Bloom
        </Link>
        <Link href="/settings" className="quiet-link">
          You
        </Link>
      </header>
      <p className="section-label">Welcome back</p>
      <h2>Your gardens</h2>
      <p className="hint">
        Places you keep with {relationship.partner?.displayName ?? "them"}. Flowers planted here stay.
      </p>
      <GardenList initial={gardens} />
      <Nav />
    </main>
  );
}
