import { ApiError } from "@/lib/api";
import { getApiBase } from "@/lib/api";

export async function publicJson<T>(path: string): Promise<T> {
  const res = await fetch(`${getApiBase()}/api/v1${path}`);
  const text = await res.text();
  let data: { message?: string; code?: string } = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text || res.statusText };
  }
  if (!res.ok) {
    throw new ApiError(
      typeof data.message === "string" ? data.message : res.statusText,
      data.code,
      res.status,
    );
  }
  return data as T;
}
