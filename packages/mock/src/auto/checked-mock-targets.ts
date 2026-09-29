import type { AnyMockScenario, UntypedMockFn } from "../types";
import { MockTargetError } from "./mock-target-error";
import type { RouteInfo } from "./route-types";

/**
 * A `mock` that refuses an endpoint declared outside any group when it is
 * named under another collection than the one its path starts with — which
 * the types cannot check, since a path is only a string to them.
 *
 * @param routes - The source's routes, each filed under its collection
 * @param groupNames - The source's group names
 * @param mock - The mock function to guard
 * @returns The guarded mock function
 * @example
 * ```ts
 * config.overrides(checkedMock(routes, getSourceGroupNames(source), server.mock), server.store);
 * ```
 */
export function checkedMock(
  routes: readonly RouteInfo[],
  groupNames: ReadonlySet<string>,
  mock: UntypedMockFn,
): UntypedMockFn {
  const filedUnder = new Map<string, string>();
  for (const route of routes) {
    if (!groupNames.has(route.group)) filedUnder.set(route.endpoint, route.group);
  }
  return (group, method) => {
    const collection = filedUnder.get(method);
    if (collection !== undefined && group !== collection && !groupNames.has(group)) {
      throw new MockTargetError(group, method, collection);
    }
    return mock(group, method);
  };
}

/**
 * Scenarios whose `mock` is guarded as `checkedMock` guards one.
 *
 * @param scenarios - The scenarios by name
 * @param guard - Guards the mock function each is applied with
 * @returns The same scenarios, applied with the guarded function
 * @example
 * ```ts
 * const scenarios = withCheckedMock(allScenarios, (mock) => checkedMock(routes, groups, mock));
 * ```
 */
export function withCheckedMock(
  scenarios: Record<string, AnyMockScenario>,
  guard: (mock: UntypedMockFn) => UntypedMockFn,
): Record<string, AnyMockScenario> {
  const guarded: Record<string, AnyMockScenario> = {};
  for (const [name, scenario] of Object.entries(scenarios)) {
    guarded[name] = { ...scenario, apply: (mock) => scenario.apply(guard(mock)) };
  }
  return guarded;
}
