import type { PublicUser } from "@/domain/types";
import { userFromToken } from "./auth";
import { AppError } from "./errors";
import { readCookie } from "./http";
import { startScheduler } from "./scheduler";

export function requireSession(req: Request): { user: PublicUser; token: string } {
  startScheduler();
  const token = readCookie(req, "bloom_session");
  const user = userFromToken(token);
  if (!user || !token) throw new AppError("UNAUTHENTICATED", "Sign in to continue.", 401);
  return { user, token };
}
