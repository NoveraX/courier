import type { CheckedPolicy } from "../policy/checked-policy";

/** How many tools a client takes in comfortably: past it, some slow down and some leave tools out. */
export const MANY_TOOLS = 40;

/**
 * What a project should hear about its tools before an agent does: a
 * pattern that names no endpoint — a `deny` that protects nothing, most
 * likely misspelt — an offered endpoint left out for its name, and more
 * tools than a client takes in comfortably.
 *
 * @param policy - The policy the tools were decided by
 * @param paths - The call of every endpoint of every source, served or not
 * @param left - Each offered endpoint left out, and why
 * @param tools - How many tools are offered
 * @returns The warnings, each a sentence
 * @example
 * ```ts
 * catalogWarnings(policy, ["shop.orders.get"], [], 1); // ['agents.deny has "billing.**", which names no endpoint']
 * ```
 */
export function catalogWarnings(
  policy: CheckedPolicy,
  paths: readonly string[],
  left: readonly { readonly path: string; readonly why: string }[],
  tools: number,
): string[] {
  const unmatched = [...policy.deny, ...policy.allow]
    .filter((pattern) => !paths.some((path) => pattern.matches(path)))
    .map((pattern) => `${pattern.where} has "${pattern.text}", which names no endpoint`);
  const named = left.map(({ path, why }) => `${path} is offered, but left out: ${why}`);
  const many =
    tools > MANY_TOOLS
      ? [
          `${tools} tools are offered: past ${MANY_TOOLS}, some clients slow down or leave tools out — ` +
            "narrow them with agents.deny, agents.access or a smaller offer",
        ]
      : [];
  return [...unmatched, ...named, ...many];
}
