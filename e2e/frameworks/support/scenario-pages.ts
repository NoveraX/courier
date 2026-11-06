import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { SCENARIOS, type Scenario } from "../../../scripts/browser-bundles/scenarios.mjs";

/**
 * The folder of a scenario's page under the application's `app/`.
 *
 * @param scenario - The scenario's name
 * @returns Its folder, as `bundle/react-query-hooks-direct`
 * @example
 * pageOf("React Query hooks, direct"); // "bundle/react-query-hooks-direct"
 */
export function pageOf(scenario: string): string {
  return `bundle/${scenario.toLowerCase().replace(/\W+/g, "-")}`;
}

/**
 * A scenario's code as a module a page runs once it has hydrated: its
 * last statement, the one that does the work, becomes `run()` — run at the
 * top of a module, it would call the API while the page is prerendered.
 *
 * @param code - The scenario's code
 * @returns The module's source
 * @example
 * scenarioModule('import { a } from "a";\nexport const q = a();'); // '…export function run() {\n  return a();\n}'
 */
export function scenarioModule(code: string): string {
  const lines = code.trimEnd().split("\n");
  const work = (lines.pop() ?? "").replace(/^export const \w+ = /, "").replace(/;$/, "");
  return `${lines.join("\n")}\nexport function run() {\n  return ${work};\n}\n`;
}

/**
 * Write a page for each scenario into the application: plain JavaScript,
 * which a build type-checks nothing of, running the scenario's work in an
 * effect, as a page calls an API once it has hydrated.
 *
 * @param root - The application's folder
 * @param scenarios - The scenarios (default: every one)
 * @example
 * writeScenarioPages("/tmp/courier-frameworks/next-16");
 */
export function writeScenarioPages(root: string, scenarios: readonly Scenario[] = SCENARIOS): void {
  for (const scenario of scenarios) {
    const dir = join(root, "app", pageOf(scenario.name));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "scenario.js"), scenarioModule(scenario.code));
    writeFileSync(
      join(dir, "page.jsx"),
      [
        '"use client";',
        'import { useEffect } from "react";',
        'import { run } from "./scenario.js";',
        "",
        "export default function Page() {",
        "  useEffect(() => {",
        "    run();",
        "  }, []);",
        "  return null;",
        "}",
        "",
      ].join("\n"),
    );
  }
}
