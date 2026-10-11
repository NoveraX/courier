import { groupOptionsOf } from "../../define/group-options-of";
import { groupChain } from "../../define/group-tree";
import { fieldOf } from "./read-definition";

/** An endpoint as a direct caller addresses it. */
export interface PlacedEndpoint {
  /** Its definition, or `undefined` when its group or the endpoint is not there */
  readonly definition: unknown;
  /** The prefixes of its group and every group above it, joined; `""` at the source */
  readonly prefix: string;
}

/**
 * Find an endpoint where its group's path puts it — at any depth — with the
 * prefix its address starts with.
 *
 * @param api - The source
 * @param group - The group's path, `billing.invoices`; empty for the source's own endpoints
 * @param method - The endpoint's name
 * @returns The endpoint's definition and its prefix
 * @example
 * ```ts
 * placedEndpoint(api, "billing.invoices", "watch").prefix; // → "billing/invoices"
 * ```
 */
export function placedEndpoint(api: object, group: string, method: string): PlacedEndpoint {
  const chain = groupChain(api, group);
  const holder = chain === undefined ? undefined : (chain.at(-1) ?? api);
  return {
    definition: holder === undefined ? undefined : fieldOf(holder, method),
    prefix: chain?.length ? (groupOptionsOf(chain).prefix ?? "") : "",
  };
}
