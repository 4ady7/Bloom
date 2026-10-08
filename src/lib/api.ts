export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

interface ApiPayload {
  error?: { code?: string; message?: string; fields?: Record<string, string> };
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown; idempotencyKey?: string }): Promise<T> {
  const method = init?.method ?? (init?.body === undefined ? "GET" : "POST");
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...(init?.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(init?.idempotencyKey ? { "idempotency-key": init.idempotencyKey } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "The connection slipped. Nothing was confirmed.");
  }

  const text = await response.text();
  let data: ApiPayload | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as ApiPayload;
    } catch {
      throw new ApiError(response.status, "BAD_RESPONSE", "The response could not be read.");
    }
  }
  if (response.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
    window.location.assign("/sign-in?reason=ended");
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error?.code ?? "ERROR",
      data?.error?.message ?? "Something went wrong. Please try again.",
      data?.error?.fields,
    );
  }
  return data as T;
}
