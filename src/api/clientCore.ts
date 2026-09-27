import type { ApiReadResult, ApiResult } from './types';
const BASE = "/api";

export { BASE };

export async function get<T>(path: string): Promise<ApiReadResult<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, { credentials: "include" });

    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (!res.ok) {
      const message =
        typeof payload === "object" &&
        payload !== null &&
        typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : `Request failed (${res.status})`;

      return { ok: false, kind: 'http', status: res.status, error: message };
    }

    return { ok: true, data: payload as T };
  } catch {
    return {
      ok: false,
      kind: 'network',
      status: 0,
      error: "Cannot reach the API — is the server running?",
    };
  }
}

export async function send<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // Not every response carries JSON — 501 stubs and proxy errors may not.
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (!res.ok) {
      const message =
        typeof payload === "object" &&
        payload !== null &&
        typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : `Request failed (${res.status})`;
      return { ok: false, kind: 'http', status: res.status, error: message };
    }

    return { ok: true, data: payload as T };
  } catch {
    return { ok: false, kind: 'network', status: 0, error: "Cannot reach the API — is the server running?" };
  }
}

export async function uploadFile<T>(
  path: string,
  fieldName: string,
  file: File,
): Promise<ApiResult<T>> {
  try {
    const formData = new FormData();
    formData.append(fieldName, file);

    const res = await fetch(`${BASE}${path}`, {
      method: "PUT",
      credentials: "include",
      body: formData,
    });

    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (!res.ok) {
      const message =
        typeof payload === "object" &&
        payload !== null &&
        typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : `Request failed (${res.status})`;

      return { ok: false, kind: 'http', status: res.status, error: message };
    }

    return { ok: true, data: payload as T };
  } catch {
    return {
      ok: false,
      kind: 'network',
      status: 0,
      error: "Cannot reach the API — is the server running?",
    };
  }
}
