export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const TOKEN_KEY = "ipbs_token";
const REFRESH_KEY = "ipbs_refresh";

export function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getRefreshToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(REFRESH_KEY) || "";
}

export function setRefreshToken(token: string) {
  localStorage.setItem(REFRESH_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

function apiUnreachableError() {
  return new Error(
    `Cannot reach API at ${API_URL}. Start the API server (npm run dev:api) and try again.`,
  );
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw apiUnreachableError();
  }
  if (res.status === 401 && !path.startsWith("/auth/")) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers.set("Authorization", `Bearer ${getToken()}`);
      try {
        const retry = await fetch(`${API_URL}${path}`, { ...init, headers });
        return readJson<T>(retry, path);
      } catch {
        throw apiUnreachableError();
      }
    }
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/";
    throw new Error("Unauthorized");
  }
  return readJson<T>(res, path);
}

async function tryRefresh() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { accessToken?: string; refreshToken?: string };
  if (!data.accessToken) return false;
  setToken(data.accessToken);
  if (data.refreshToken) setRefreshToken(data.refreshToken);
  return true;
}

async function readJson<T>(res: Response, path: string): Promise<T> {
  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined" && !path.startsWith("/auth/login") && !path.startsWith("/auth/otp")) {
      window.location.href = "/";
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `Request failed (${res.status})`);
  }
  return data as T;
}
