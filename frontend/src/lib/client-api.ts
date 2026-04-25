"use client";

/** Относительный путь по умолчанию проксируется Next (см. rewrites в next.config). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "/api/backend").replace(/\/$/, "");
const ACCESS_KEY = "domain-admin-access";
const REFRESH_KEY = "domain-admin-refresh";

export type ApiError = {
  detail?: string | Record<string, unknown> | string[];
  [key: string]: unknown;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  retry?: boolean;
};

function canUseStorage() {
  return typeof window !== "undefined";
}

export function getStoredAccessToken() {
  return canUseStorage() ? window.localStorage.getItem(ACCESS_KEY) : null;
}

export function getStoredRefreshToken() {
  return canUseStorage() ? window.localStorage.getItem(REFRESH_KEY) : null;
}

export function setStoredTokens(access: string, refresh: string) {
  if (!canUseStorage()) {
    return;
  }
  window.localStorage.setItem(ACCESS_KEY, access);
  window.localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearStoredTokens() {
  if (!canUseStorage()) {
    return;
  }
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

async function readResponse(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function refreshAccessToken() {
  const refresh = getStoredRefreshToken();
  if (!refresh) {
    clearStoredTokens();
    return null;
  }

  const response = await fetch(`${API_URL}/auth/token/refresh/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh }),
  });

  if (!response.ok) {
    clearStoredTokens();
    return null;
  }

  const data = (await response.json()) as { access: string };
  const currentRefresh = getStoredRefreshToken();
  if (currentRefresh) {
    setStoredTokens(data.access, currentRefresh);
  }
  return data.access;
}

export function formatApiError(error: unknown) {
  if (!error) {
    return "Операция не выполнена.";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object") {
    const payload = error as ApiError;
    if (typeof payload.detail === "string") {
      return payload.detail;
    }
    if (Array.isArray(payload.detail)) {
      return payload.detail.join(", ");
    }
    if (payload.detail && typeof payload.detail === "object") {
      return JSON.stringify(payload.detail);
    }
    return JSON.stringify(payload);
  }
  return "Операция не выполнена.";
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, retry = true } = options;
  const accessToken = getStoredAccessToken();
  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && retry && getStoredRefreshToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiRequest<T>(path, { ...options, retry: false });
    }
  }

  const payload = await readResponse(response);
  if (!response.ok) {
    throw payload ?? new Error(`HTTP ${response.status}`);
  }
  return payload as T;
}

type LoginProxyOk = { ok: true; access: string; refresh: string };
type LoginProxyErr = { ok: false; detail: string };

export async function loginRequest(username: string, password: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  const payload = (await readResponse(response)) as LoginProxyOk | LoginProxyErr | null;
  if (!response.ok) {
    throw new Error("Сервис входа временно недоступен.");
  }
  if (!payload || typeof payload !== "object" || !("ok" in payload)) {
    throw new Error("Не удалось войти.");
  }

  if (!payload.ok) {
    throw { detail: payload.detail };
  }

  setStoredTokens(payload.access, payload.refresh);
  return { access: payload.access, refresh: payload.refresh };
}
