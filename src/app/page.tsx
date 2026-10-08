import Link from "next/link";
import { redirect } from "next/navigation";
import { Mark } from "@/components/Mark";
import { getCurrentUser } from "@/server/current";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) redirect("/home");
  return (
    <main className="landing">
      <span className="petal-drift one" aria-hidden="true" />
      <span className="petal-drift two" aria-hidden="true" />
      <span className="petal-drift three" aria-hidden="true" />
      <div className="landing-inner" id="content">
        <div className="flower-wrap" style={{ width: 72 }}>
          <Mark />
        </div>
        <h1>Bloom</h1>
        <p className="tagline">Little things, for no reason.</p>
        <p className="lede">A private place for two people to leave each other something small. Like flowers, when there is no occasion.</p>
        <div className="actions">
          <Link className="btn" href="/sign-up">
            Begin
          </Link>
          <Link className="btn-ghost" href="/sign-in">
            I already have a place
          </Link>
        </div>
      </div>
    </main>
  );
}
