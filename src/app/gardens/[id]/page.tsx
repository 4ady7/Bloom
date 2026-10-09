import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Chrome";
import { GardenRoom } from "@/components/GardenRoom";
import { AppError } from "@/server/errors";
import { getCurrentUser } from "@/server/current";
import { getGarden, listGardenFlowers } from "@/server/gardens";

export const dynamic = "force-dynamic";

export default async function GardenDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ planted?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const { id } = await params;
  const { planted } = await searchParams;
  try {
    const garden = getGarden(user.id, id);
    const page = listGardenFlowers(user.id, id, null, 120);
    return (
      <main className="garden-room-page" id="content">
        <header className="topbar plain-pad">
          <Link href="/gardens" className="quiet-link">
            All gardens
          </Link>
          <Link href="/settings" className="quiet-link">
            You
          </Link>
        </header>
        <GardenRoom garden={garden} flowers={page.flowers} justPlanted={planted === "1"} />
        <div className="plain-pad">
          <Nav />
        </div>
      </main>
    );
  } catch (error) {
    if (error instanceof AppError && error.status === 404) {
      return (
        <main className="plain-page">
          <h2>This garden isn&apos;t here.</h2>
          <Link href="/gardens" className="btn">
            Back to your gardens
          </Link>
        </main>
      );
    }
    throw error;
  }
}
