import { ConfigurationError } from "../errors";
import { isRecord } from "./is-record";

const SCHEME = /^[a-z][a-z\d+.-]*:/i;

/**
 * Refuse a request address that is only a path where nothing can resolve
 * it. A browser resolves `/api/users` against the page; React Native and
 * Node have no page, and their fetch failed with a bare "Invalid URL" that
 * named neither the address nor the fix.
 *
 * @param url - The address a request is about to be sent to
 * @throws {ConfigurationError} `URL_NOT_ABSOLUTE` for a path with no page to resolve it against
 * @example
 * ```ts
 * assertAbsoluteUrl("https://api.example.com/users"); // passes
 * assertAbsoluteUrl("/api/users"); // throws in React Native and Node
 * ```
 */
export function assertAbsoluteUrl(url: string): void {
  if (SCHEME.test(url) || hasPageAddress()) return;
  throw new ConfigurationError(
    "URL_NOT_ABSOLUTE",
    `[courier] "${url}" is a path, and this runtime has no page address to resolve it against. Give baseURL as an absolute URL — "http://localhost:3000/api", or "http://10.0.2.2:3000/api" from an Android emulator.`,
  );
}

function hasPageAddress(): boolean {
  const location: unknown = Reflect.get(globalThis, "location");
  return isRecord(location) && typeof location.host === "string" && location.host !== "";
}
