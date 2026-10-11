export type ApiError = { error: string; message: string };

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => null)) as T | ApiError | null;
  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body ? body.message : `${response.status} from ${path}`;
    throw new Error(String(message));
  }
  return body as T;
}
