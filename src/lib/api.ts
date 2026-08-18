export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("otp_token");
}
export function setToken(token: string): void { localStorage.setItem("otp_token", token); }
export function removeToken(): void { localStorage.removeItem("otp_token"); }

export async function apiFetch<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {};
  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // Merge user headers
  if (options.headers) {
    Object.assign(headers, options.headers as Record<string, string>);
  }

  const res = await fetch(url, { ...options, headers });

  const text = await res.text();
  let data: Record<string, unknown>;
  try { data = JSON.parse(text); } catch {
    if (res.ok) return {} as T;
    data = { error: text || `Erreur HTTP ${res.status}` };
  }

  if (res.status === 401) removeToken();
  if (!res.ok) throw new Error((data.error as string) || `Erreur HTTP ${res.status}`);
  return data as T;
}
