import { cookies } from "next/headers";
import type { PublicUser } from "@/domain/types";
import { userFromToken } from "./auth";
import { startScheduler } from "./scheduler";

export async function getCurrentUser(): Promise<PublicUser | null> {
  startScheduler();
  const jar = await cookies();
  return userFromToken(jar.get("bloom_session")?.value ?? null);
}
