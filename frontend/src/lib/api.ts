const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

type FetchOptions<T> = {
  path: string;
  fallback: T;
};

export async function fetchApi<T>({ path, fallback }: FetchOptions<T>): Promise<T> {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return fallback;
    }
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}
