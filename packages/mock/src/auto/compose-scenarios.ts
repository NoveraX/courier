import type { MockScenario } from "../types";

/**
 * Merge built-in presets and user scenarios under a canonical "happy-path".
 * happy-path is a no-op that clears the scenario layer, revealing base auto-CRUD;
 * user config cannot override it.
 */
export function composeScenarios(
  presets: Record<string, MockScenario>,
  userScenarios?: Record<string, MockScenario>,
): Record<string, MockScenario> {
  const happyPath: MockScenario = { name: "happy-path", apply: () => {} };
  const merged = { ...userScenarios };
  delete merged["happy-path"];
  return {
    "happy-path": happyPath,
    ...presets,
    ...merged,
  };
}
