import { createFetch } from "@noverax/nexus/fetch";
import type { HTTPError } from "@noverax/nexus";

export const API_BASE = import.meta.env.DEV ? "http://localhost:4380" : "";

export const client = createFetch({ baseURL: API_BASE });

/** Convert HTTPError into plain Error with server-provided message */
export function rethrowMessage(fallback: string) {
  return (error: unknown): never => {
    const data = (error as HTTPError).data as { error?: string } | undefined;
    throw new Error(data?.error ?? fallback);
  };
}
