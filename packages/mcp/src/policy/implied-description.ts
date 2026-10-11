import type { PlacedEndpoint } from "@noverax/courier/internal";

/**
 * What a tool says of an endpoint the policy offers without `.agent()`,
 * for the model deciding to call it: the description its definition
 * carries — `.meta({ description })`, which an imported specification's
 * summary becomes — or else its verb, its path and its call.
 *
 * @param endpoint - The endpoint, as its API places it
 * @param path - Its call under its source: `shop.orders.get`
 * @param verb - The verb its call is sent with: `GET`
 * @returns The description
 * @example
 * ```ts
 * impliedDescription(placed, "shop.orders.get", "GET"); // "GET orders/:id — shop.orders.get"
 * ```
 */
export function impliedDescription(endpoint: PlacedEndpoint, path: string, verb: string): string {
  const meta = endpoint.options.meta ?? {};
  return (
    textOf(meta.description) ??
    textOf(meta.summary) ??
    `${verb} ${endpoint.path === "" ? "/" : endpoint.path} — ${path}`
  );
}

function textOf(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
