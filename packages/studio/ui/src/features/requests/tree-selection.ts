/** Whether a row of a filter is chosen: wholly, in part — some of the values under it — or not. */
export type SelectionState = "on" | "mixed" | "off";

/**
 * How much of a row's values are chosen.
 *
 * @param chosen - The values chosen
 * @param values - The row's values: itself, and in a tree everything under it
 * @returns `on` when all are, `mixed` when some are, `off` when none is
 * @example
 * ```ts
 * selectionState(["billing.invoices"], ["billing", "billing.invoices"]); // → "mixed"
 * ```
 */
export function selectionState(
  chosen: readonly string[],
  values: readonly string[],
): SelectionState {
  const picked = values.filter((value) => chosen.includes(value)).length;
  if (picked === 0) return "off";
  return picked === values.length ? "on" : "mixed";
}

/**
 * The choice after a row is ticked: all of its values, or — when all of
 * them were chosen — none of them.
 *
 * @param chosen - The values chosen
 * @param values - The row's values
 * @returns The values chosen after the tick
 * @example
 * ```ts
 * toggleValues([], ["billing", "billing.invoices"]); // → ["billing", "billing.invoices"]
 * ```
 */
export function toggleValues(chosen: readonly string[], values: readonly string[]): string[] {
  if (selectionState(chosen, values) === "on") {
    return chosen.filter((value) => !values.includes(value));
  }
  return [...chosen, ...values.filter((value) => !chosen.includes(value))];
}
