import { parseApiJsonBody, readResponseText } from "@/lib/api-response";
import { apiUrl } from "@/lib/api";

export async function publicJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(apiUrl(path), options);
  const text = await readResponseText(res);
  const data = parseApiJsonBody(res, text);
  return data as T;
}
