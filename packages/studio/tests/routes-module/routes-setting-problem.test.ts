/**
 * `studio.routes` names a module in the project, or is `false`: a path that
 * leaves the project, a file that is not an ES module, one in a package's or
 * Studio's own folder, or a file Studio reads the project from is refused,
 * the setting named.
 */
import { describe, expect, it } from "vitest";

import { routesModulePath } from "../../src/server/routes-module/routes-module-path";
import { routesSettingProblem } from "../../src/server/routes-module/routes-setting-problem";

const NAMED = "courier.config.studio.routes";

describe("routesSettingProblem", () => {
  it.each([
    undefined,
    false,
    "courier.routes.ts",
    "src/lib/courier.routes.mts",
    "./web/routes.js",
    "src\\routes.mjs",
  ])("takes %j", (value) => {
    expect(routesSettingProblem(value)).toBeNull();
  });

  it.each([
    [true, `${NAMED} is true, not a path or false`],
    [7, `${NAMED} is 7, not a path or false`],
    [null, `${NAMED} is null, not a path or false`],
    ["", `${NAMED} is "", not a path in the project: it is empty`],
    [
      "../web/routes.ts",
      `${NAMED} is "../web/routes.ts", not a path in the project: it leaves the project`,
    ],
    ["/app/routes.ts", `${NAMED} is "/app/routes.ts", not a path in the project: it is absolute`],
    ["C:routes.ts", `${NAMED} is "C:routes.ts", not a path in the project: it names a drive`],
    ["src/routes.json", `${NAMED} is "src/routes.json", not a .ts, .mts, .js or .mjs module`],
    ["src/routes.cjs", `${NAMED} is "src/routes.cjs", not a .ts, .mts, .js or .mjs module`],
    [
      "node_modules/x/routes.ts",
      `${NAMED} is "node_modules/x/routes.ts", inside node_modules, which is not the project's own code`,
    ],
    [
      ".courier/routes.ts",
      `${NAMED} is ".courier/routes.ts", inside .courier, which is not the project's own code`,
    ],
    ["courier.config.ts", `${NAMED} is "courier.config.ts", a file Studio reads the project from`],
    [
      "./courier.mocks.mts",
      `${NAMED} is "./courier.mocks.mts", a file Studio reads the project from`,
    ],
  ])("refuses %j", (value, message) => {
    expect(routesSettingProblem(value)).toBe(message);
  });

  it("names the setting it is given, for the command's own", () => {
    expect(routesSettingProblem("../x.ts", "--out")).toBe(
      '--out is "../x.ts", not a path in the project: it leaves the project',
    );
  });
});

describe("routesModulePath", () => {
  it.each([
    ["/app/courier.config.ts", "courier.routes.ts"],
    ["/app/courier.config.mts", "courier.routes.mts"],
    ["/app/courier.config.cts", "courier.routes.ts"],
    ["/app/courier.config.js", "courier.routes.js"],
    ["/app/courier.config.mjs", "courier.routes.mjs"],
    ["/app/courier.config.cjs", "courier.routes.mjs"],
  ])("puts the module beside %s, in its language, as %s", (configFile, path) => {
    expect(routesModulePath(configFile, undefined)).toBe(path);
  });

  it("puts it where the setting says, with / between names", () => {
    expect(routesModulePath("/app/courier.config.ts", "./src\\lib/../courier.routes.ts")).toBe(
      "src/courier.routes.ts",
    );
  });

  it("puts it nowhere when the setting is false", () => {
    expect(routesModulePath("/app/courier.config.ts", false)).toBeNull();
  });
});
