import { accessToken } from "./auth";
import {backendFetch} from '../lib/transport';
import {isPublicApiPath} from '../lib/apiPaths';
export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const token = method==='GET'&&isPublicApiPath(path)?null:await accessToken();
  const response = await backendFetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new APIError(response.status, result.error || "Request failed.");
  return result;
}
