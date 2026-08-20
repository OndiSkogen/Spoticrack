export const SESSION_EXPIRED_EVENT = "spoticrack:session-expired";

export type ApiResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "unauthenticated" }
  | { kind: "error"; message: string };

async function handleApiResponse<T>(res: Response): Promise<ApiResult<T>> {
  if (res.status === 401) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    return { kind: "unauthenticated" };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : res.statusText || "Something went wrong.";
    return { kind: "error", message };
  }

  const data = (await res.json()) as T;
  return { kind: "ok", data };
}

export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  const res = await fetch(path);
  return handleApiResponse<T>(res);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  const res = await fetch(
    path,
    body !== undefined
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { method: "POST" },
  );
  return handleApiResponse<T>(res);
}
