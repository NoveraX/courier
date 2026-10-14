import { afterAll, describe, expect, it } from "vitest";

import { reactViteRecipe } from "../../src/recipes/react-vite";
import { contextOf, manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

describe("reactViteRecipe", () => {
  it("calls the API from the browser directly, on a page of its own, with no routes or server runtime", () => {
    const root = projectWith({
      "package.json": manifest({ vite: "^8.3.0", react: "^19.2.8" }),
      "tsconfig.json": "{}",
    });
    const recipe = reactViteRecipe(contextOf(root, "vite"));
    const byPath = new Map(recipe.files.map((file) => [file.path, file.content]));

    expect([...byPath.keys()]).not.toContain("courier.routes.ts");
    expect(byPath.get("src/courier/api.ts")).not.toContain("expose");
    expect(byPath.get("src/courier/query.ts")).toContain("createQueryCaller(api)");
    expect(byPath.get("courier.html")).toContain(
      '<script type="module" src="/src/courier/main.tsx"></script>',
    );
    expect(recipe.dependencies).not.toContain("@noverax/courier-studio-core");
    expect(recipe.next.at(-1)?.what).toContain("/courier.html");
  });
});
