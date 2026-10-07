import type { HeaderReader } from "./incoming-request";

/**
 * The origin a request was addressed to, as its client addressed it: the
 * proxy in front records it in `X-Forwarded-Host` and `X-Forwarded-Proto`,
 * and the request's own `Host` says it otherwise. A page cannot use them to
 * pass for another site — a browser sends neither header across origins
 * without a preflight — and where it matters, `Sec-Fetch-Site` decides
 * before any origin is compared.
 *
 * @param headers - The request's headers
 * @param fallbackProtocol - The scheme the request arrived over, when no proxy names one
 * @returns The origin, or `undefined` when no host is named or it does not parse
 * @example
 * ```ts
 * addressedOrigin(new Headers({ host: "app.example.com", "x-forwarded-proto": "https" }));
 * // "https://app.example.com"
 * ```
 */
export function addressedOrigin(
  headers: HeaderReader,
  fallbackProtocol: "http" | "https" = "http",
): string | undefined {
  const host = firstValue(headers.get("x-forwarded-host")) ?? firstValue(headers.get("host"));
  if (host === undefined) return undefined;
  const proto = firstValue(headers.get("x-forwarded-proto"))?.toLowerCase();
  const scheme = proto === "https" || proto === "http" ? proto : fallbackProtocol;
  const origin = `${scheme}://${host}`;
  return URL.canParse(origin) ? new URL(origin).origin : undefined;
}

/** The client-facing value of a forwarded header: the first of a chain. */
function firstValue(header: string | null): string | undefined {
  return header?.split(",")[0]?.trim() || undefined;
}
