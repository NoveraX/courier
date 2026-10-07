import type { Received } from "./api";

/** The addresses the global setup serves the checks on. */
export const APP = process.env.COURIER_APP_URL ?? "";
export const API = process.env.COURIER_API_URL ?? "";
export const ATTACKER = process.env.COURIER_ATTACKER_URL ?? "";

/**
 * Forget what the API has received so far, so a check reads what it set off alone.
 *
 * @example
 * ```ts
 * await clearReceived();
 * ```
 */
export async function clearReceived(): Promise<void> {
  await fetch(`${API}/__log?clear=1`);
}

/**
 * The requests the API received for one route, oldest first.
 *
 * @param method - The method
 * @param path - The path, without a query
 * @returns The requests
 * @example
 * ```ts
 * const [me] = await received("GET", "/me");
 * expect(me?.headers.cookie).toBe("sid=a1");
 * ```
 */
export async function received(method: string, path: string): Promise<Received[]> {
  const all: unknown = await (await fetch(`${API}/__log`)).json();
  if (!Array.isArray(all)) throw new Error("The API's log is not a list");
  return all.filter(
    (entry: unknown): entry is Received =>
      isReceived(entry) && entry.method === method && entry.url.split("?")[0] === path,
  );
}

function isReceived(value: unknown): value is Received {
  if (typeof value !== "object" || value === null) return false;
  const { method, url, headers } = value as Record<string, unknown>;
  return typeof method === "string" && typeof url === "string" && typeof headers === "object";
}

/**
 * A link on another site to an address of the application.
 *
 * @param path - The application's path the link leads to
 * @returns The other site's page that shows the link, as `#go`
 * @example
 * ```ts
 * await page.goto(linkElsewhere("/attack"));
 * ```
 */
export function linkElsewhere(path: string): string {
  return `${ATTACKER}/link?to=${encodeURIComponent(`${APP}${path}`)}`;
}

/**
 * The cookies a `Cookie` header carries, in name order. A browser lists them
 * by how long it has kept each, which a check need not care about; which
 * cookies were sent is what it reads.
 *
 * @param header - The header, as the API received it
 * @returns Its `name=value` pairs, sorted
 * @example
 * ```ts
 * cookiesIn("sid=a1; csrftoken=t1"); // ["csrftoken=t1", "sid=a1"]
 * ```
 */
export function cookiesIn(header: string | undefined): string[] {
  return (header ?? "").split("; ").filter(Boolean).sort();
}
