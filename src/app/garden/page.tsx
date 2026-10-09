import Link from "next/link";
import { redirect } from "next/navigation";
import { GardenScene } from "@/components/GardenScene";
import { Nav } from "@/components/Chrome";
import { PETAL_LABEL } from "@/domain/types";
import { formatWhen } from "@/domain/time";
import { getCurrentUser } from "@/server/current";
import { getHome, listPetals } from "@/server/petals";

export const dynamic = "force-dynamic";

export default async function GardenPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const home = await getHome(user.id);
  if (!home.relationship || home.relationship.status !== "active") redirect("/pair");
  const { cursor } = await searchParams;
  const page = listPetals(user.id, cursor ?? null, 20);
  return (
    <main className="plain-page" id="content">
      <header className="topbar">
        <Link href="/home" className="word">
          Bloom
        </Link>
        <Link href="/settings" className="quiet-link">
          You
        </Link>
      </header>
      <h2>The path</h2>
      <p className="hint">
        Every small thing you&apos;ve left each other. For the living soil, open{" "}
        <Link href="/gardens">your gardens</Link>.
      </p>
      <GardenScene elements={home.garden.elements} season={home.garden.season} />
      {page.petals.length === 0 ? <p>The path is still quiet. That&apos;s alright.</p> : null}
      <div>
        {page.petals.map((petal) => (
          <Link key={petal.id} href={`/petal/${petal.id}`} className="kept">
            <span className="kept-kind">
              {petal.fromYou ? "You" : petal.senderName} · {PETAL_LABEL[petal.type]}
              {petal.status === "scheduled" ? " · not yet" : ""}
              {petal.status === "expired" ? " · faded" : ""}
            </span>
            <span className="kept-when">{formatWhen(petal.scheduledFor ?? petal.createdAt, user.timezone)}</span>
          </Link>
        ))}
      </div>
      {page.nextCursor ? <Link href={`/garden?cursor=${page.nextCursor}`}>Older things</Link> : null}
      <Nav />
    </main>
  );
}
