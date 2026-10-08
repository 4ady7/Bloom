import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/server/current";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect("/home");
  const { reason } = await searchParams;
  return (
    <>
      {reason === "ended" ? (
        <p className="banner" role="status">
          Your session ended. Come back in when you&apos;re ready.
        </p>
      ) : null}
      <AuthForm mode="sign-in" />
    </>
  );
}
