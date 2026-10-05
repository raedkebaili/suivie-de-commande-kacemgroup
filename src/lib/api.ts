export async function apiFetch<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {};
  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }
  if (options.headers) {
    Object.assign(headers, options.headers as Record<string, string>);
  }

  const res = await fetch(url, {
    ...options,
    credentials: options.credentials ?? "same-origin",
    headers,
  });

  const text = await res.text();
  let data: Record<string, unknown>;
  try { data = JSON.parse(text); } catch {
    if (res.ok) return {} as T;
    data = { error: text || `Erreur HTTP ${res.status}` };
  }

  if (!res.ok) throw new Error((data.error as string) || `Erreur HTTP ${res.status}`);
  return data as T;
}
