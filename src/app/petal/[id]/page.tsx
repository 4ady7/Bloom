import { redirect } from "next/navigation";
import { Reveal } from "@/components/Reveal";
import { AppError } from "@/server/errors";
import { getCurrentUser } from "@/server/current";
import { deliverDuePetals } from "@/server/deliver";
import { markAnswerNotificationsRead } from "@/server/notifications";
import { getPetal } from "@/server/petals";

export const dynamic = "force-dynamic";

export default async function PetalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const { id } = await params;
  const { notice } = await searchParams;
  await deliverDuePetals();
  markAnswerNotificationsRead(user.id, id, Date.now());
  try {
    const petal = getPetal(user.id, id);
    return <Reveal initial={petal} notice={notice} timezone={user.timezone} />;
  } catch (error) {
    const message = error instanceof AppError ? error.message : "This isn't here.";
    return <Reveal initial={null} notice={notice ?? message} timezone={user.timezone} />;
  }
}
