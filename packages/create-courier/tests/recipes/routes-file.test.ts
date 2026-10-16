/**
 * React Router's routes file, as the command changes it: a route module
 * it lists already — however the path is written — is not listed again,
 * and a URL path a route of the project's has is left to the person.
 */
import { afterAll, describe, expect, it } from "vitest";

import type { Plan } from "../../src/plan/build-plan";
import { manifestWith, offered, planAt, setUp, write } from "./configured-fixture";
import { removeProjects } from "./project-fixture";

afterAll(removeProjects);

/* The plan's change to a file, as the file would read after it. */
function after(plan: Plan, path: string): string | undefined {
  return plan.edits.find((edit) => edit.path === path && edit.state === "edit")?.after;
}

describe("React Router's routes file", () => {
  const app = (routes: string) => ({
    "package.json": manifestWith({ "@react-router/dev": "^7.9.0", react: "19.2.0" }),
    "tsconfig.json": "{}",
    "vite.config.ts":
      'import { courierStudio } from "@noverax/courier-studio/remix";\n\nexport default defineConfig({ plugins: [courierStudio()] });\n',
    "app/routes.ts": routes,
  });

  it("counts a route written with ./ and its extension, or without either, and lists nothing twice", () => {
    for (const module of [
      "./routes/api.request.ts",
      "routes/api.request",
      "./routes/api.request",
    ]) {
      const root = setUp("react-router", "@react-router/dev", app("export default routes;\n"));
      write(root, {
        "app/routes.ts": `import { index, route } from "@react-router/dev/routes";\n\nexport default [index("./routes/home.tsx"), route("api/request", "${module}")];\n`,
      });
      const plan = planAt(root, "react-router", "@react-router/dev");

      expect(offered(plan)).toEqual([]);
      expect(after(plan, "app/routes.ts")).toBeUndefined();
    }
  });

  it("leaves the route to the person where a route of the project's has its URL path already", () => {
    const root = setUp("react-router", "@react-router/dev", app("export default routes;\n"));
    write(root, {
      "app/routes.ts":
        'import { index, route } from "@react-router/dev/routes";\n\nexport default [index("./routes/home.tsx"), route("/api/request", "./routes/legacy.ts")];\n',
    });
    const plan = planAt(root, "react-router", "@react-router/dev");

    expect(offered(plan)).toEqual(["step app/routes.ts"]);
    expect(after(plan, "app/routes.ts")).toBeUndefined();
  });

  it("lists the route once where the routes file has neither its module nor its path", () => {
    const root = setUp("react-router", "@react-router/dev", app("export default routes;\n"));
    write(root, {
      "app/routes.ts":
        'import { index } from "@react-router/dev/routes";\n\nexport default [index("./routes/home.tsx")];\n',
    });
    const changed = after(planAt(root, "react-router", "@react-router/dev"), "app/routes.ts");

    expect(changed?.match(/"api\/request"/g)).toHaveLength(1);
  });
});
