import { redirect } from "next/navigation";
import { HomeView } from "@/components/HomeView";
import { getCurrentUser } from "@/server/current";
import { getHome } from "@/server/petals";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const home = await getHome(user.id);
  if (!home.relationship || home.relationship.status !== "active") redirect("/pair");
  return <HomeView home={home} />;
}
