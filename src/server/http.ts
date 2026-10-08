import { ZodError } from "zod";
import { TimeInputError } from "@/domain/time";
import { AppError } from "./errors";

export function json(data: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("cache-control", "no-store");
  return Response.json(data, { status, headers });
}

export function errorBody(error: AppError) {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.fields ? { fields: error.fields } : {}),
    },
  };
}

export async function withErrors(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) return json(errorBody(error), error.status);
    if (error instanceof TimeInputError) {
      return json(errorBody(new AppError("INVALID_TIME", error.message, 400)), 400);
    }
    if (error instanceof ZodError) {
      return json(errorBody(fromZod(error)), 400);
    }
    const message = error instanceof Error ? error.message : "unknown";
    console.error(JSON.stringify({ level: "error", message }));
    return json(
      errorBody(new AppError("INTERNAL", "Something went wrong. Please try again.", 500)),
      500,
    );
  }
}

export function fromZod(error: ZodError): AppError {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!fields[key]) fields[key] = fieldMessage(key, issue.message);
  }
  return new AppError("INVALID_INPUT", "Some of that needs another look.", 400, fields);
}

function fieldMessage(key: string, issue: string): string {
  if (key.endsWith("url") || issue === "url") return "Use a normal web link, or leave it blank.";
  if (key.endsWith("date") || issue === "date") return "Use a date like 2026-04-12, or leave it blank.";
  if (key === "text" || key.endsWith(".text") || key === "message") return "Write a little something first.";
  if (key === "title" || key === "prompt") return "This needs a few words.";
  if (key === "mediaId" || key.endsWith("mediaId")) return "Add the photo or sound first.";
  return "Please check this.";
}

export async function readJson(req: Request, maxBytes = 100_000): Promise<unknown> {
  const declared = req.headers.get("content-length");
  if (declared && Number(declared) > maxBytes) {
    throw new AppError("PAYLOAD_TOO_LARGE", "That was too large to accept.", 413);
  }
  const text = await req.text();
  if (text.length > maxBytes) {
    throw new AppError("PAYLOAD_TOO_LARGE", "That was too large to accept.", 413);
  }
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError("INVALID_JSON", "The request could not be read.", 400);
  }
}

export function assertMutation(req: Request): void {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) {
    throw new AppError("FORBIDDEN", "This request could not be verified.", 403);
  }
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError("FORBIDDEN", "This request could not be verified.", 403);
  }
  if (originHost !== host) {
    throw new AppError("FORBIDDEN", "This request could not be verified.", 403);
  }
}

export function clientAddress(req: Request): string {
  if (process.env.TRUST_PROXY === "1") {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim().slice(0, 64) || "unknown";
  }
  return "local";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertIdempotencyKey(value: string | null): string {
  const key = value?.trim() ?? "";
  if (!UUID.test(key)) {
    throw new AppError("IDEMPOTENCY_KEY_REQUIRED", "Please try that again.", 400);
  }
  return key;
}

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  const secure = cookieSecure() ? "; Secure" : "";
  return `bloom_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearSessionCookie(): string {
  const secure = cookieSecure() ? "; Secure" : "";
  return `bloom_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}

function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === "0") return false;
  if (process.env.COOKIE_SECURE === "1") return true;
  return process.env.NODE_ENV === "production";
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export const dynamicRoute = {
  dynamic: "force-dynamic" as const,
  runtime: "nodejs" as const,
};
