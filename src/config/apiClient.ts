const TOKEN_KEY = "pm_access_token";

export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_URL as string | undefined;
  if (!raw || raw.trim() === "") return "/api";
  return raw.replace(/\/$/, "");
}

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

type ApiErrorBody = { message?: string | string[]; statusCode?: number };

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function messageFromBody(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const m = (body as ApiErrorBody).message;
  if (Array.isArray(m)) return m.join(", ");
  if (typeof m === "string") return m;
  return fallback;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  const h = new Headers(headers);
  if (!h.has("Content-Type") && rest.body) {
    h.set("Content-Type", "application/json");
  }
  if (auth) {
    const token = getAccessToken();
    if (token) h.set("Authorization", `Bearer ${token}`);
  }
  const url = `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, { ...rest, headers: h });
  const body = await parseBody(res);
  if (!res.ok) {
    if (res.status === 401) {
      setAccessToken(null);
      window.dispatchEvent(new CustomEvent("pm:auth-changed", { detail: null }));
    }
    throw new ApiError(
      res.status,
      messageFromBody(body, res.statusText || "Error de API"),
      body
    );
  }
  return body as T;
}

export const apiGet = <T = unknown>(path: string) =>
  apiRequest<T>(path, { method: "GET" });

export const apiPost = <T = unknown>(path: string, body?: unknown) =>
  apiRequest<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body)
  });

export const apiPut = <T = unknown>(path: string, body?: unknown) =>
  apiRequest<T>(path, {
    method: "PUT",
    body: body === undefined ? undefined : JSON.stringify(body)
  });

export const apiPatch = <T = unknown>(path: string, body?: unknown) =>
  apiRequest<T>(path, {
    method: "PATCH",
    body: body === undefined ? undefined : JSON.stringify(body)
  });

export const apiDelete = <T = unknown>(path: string) =>
  apiRequest<T>(path, { method: "DELETE" });
