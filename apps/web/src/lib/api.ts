export const portegoApiUrl = process.env.NEXT_PUBLIC_PORTEGO_API_URL ?? "http://localhost:4000";

export class PortegoApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PortegoApiError";
    this.status = status;
  }
}

type ApiRequestInit = RequestInit & { csrfToken?: string | null };

export async function apiRequest<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { csrfToken, ...requestInit } = init;
  const response = await fetch(portegoApiUrl + path, {
    ...requestInit,
    credentials: "include",
    headers: {
      ...(requestInit.body ? { "Content-Type": "application/json" } : {}),
      ...(csrfToken ? { "X-Portego-CSRF": csrfToken } : {}),
      ...requestInit.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      detail?: string | Array<{ msg?: string }>;
      error?: string;
    };
    const detail = Array.isArray(body.detail)
      ? body.detail
          .map((item) => item.msg)
          .filter(Boolean)
          .join(" ")
      : body.detail;
    throw new PortegoApiError(
      response.status,
      detail || body.error || "Portego could not complete the request.",
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
