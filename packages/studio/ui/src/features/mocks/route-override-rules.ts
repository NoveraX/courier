import type { RouteOverride } from "@/store/mock-slice";
import { setsAnything } from "./route-overrides";

/* An override is on while it sets anything of its own. */
function settled(override: RouteOverride): RouteOverride {
  return { ...override, enabled: setsAnything(override) };
}

/**
 * A route override failing with the faults given, in place of the mix;
 * none takes the route back to the mix. A route given faults while nothing
 * would fail it — no rate of its own and a global rate of 0 — is given a
 * rate of 100%, so the faults it was given happen.
 *
 * @param override - The route's override
 * @param faults - The faults, as the mock names them
 * @param globalRate - The mock's error rate, 0–1
 * @returns The override
 * @example
 * ```ts
 * withFaults({ routeId: "files:upload", enabled: false }, ["413"], 0);
 * // → { routeId: "files:upload", enabled: true, faultTypes: ["413"], errorRate: 1 }
 * ```
 */
export function withFaults(
  override: RouteOverride,
  faults: readonly string[],
  globalRate: number,
): RouteOverride {
  const { faultTypes: _dropped, ...rest } = override;
  if (faults.length === 0) return settled(rest);
  const failsNothing = (override.errorRate ?? globalRate) === 0;
  return settled({ ...rest, faultTypes: [...faults], ...(failsNothing && { errorRate: 1 }) });
}

/**
 * A route override with an upload rule of its own — its largest upload in
 * bytes, or its types of file — or, given `undefined`, with the mock's.
 *
 * @param override - The route's override
 * @param rule - The rule
 * @param value - Its value, or `undefined` for the mock's
 * @returns The override
 * @example
 * ```ts
 * withUploadRule({ routeId: "users:avatar", enabled: false }, "maxBytes", 1_048_576);
 * // → { routeId: "users:avatar", enabled: true, uploads: { maxBytes: 1_048_576 } }
 * ```
 */
export function withUploadRule<TRule extends "maxBytes" | "accept">(
  override: RouteOverride,
  rule: TRule,
  value: NonNullable<RouteOverride["uploads"]>[TRule] | undefined,
): RouteOverride {
  const { uploads, ...rest } = override;
  const { [rule]: _dropped, ...others } = uploads ?? {};
  const next = value === undefined ? others : { ...others, [rule]: value };
  return settled(Object.keys(next).length > 0 ? { ...rest, uploads: next } : rest);
}
