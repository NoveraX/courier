import { afterAll, describe, expect, it } from "vitest";

import { expoRecipe } from "../../src/recipes/expo";
import { contextOf, manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

describe("expoRecipe", () => {
  it("builds the API from a factory, at the platform's address in the app and the mock's for Studio", () => {
    const root = projectWith({
      "package.json": manifest({ expo: "~57.0.27", react: "19.2.3" }),
      "tsconfig.json": "{}",
      "app.json": '{ "expo": { "scheme": "expoapp" } }',
      "src/app/index.tsx": "",
    });
    const recipe = expoRecipe(contextOf(root, "expo"));
    const byPath = new Map(recipe.files.map((file) => [file.path, file.content]));

    expect(byPath.get("src/courier/api.ts")).toContain(
      "export function createApi(baseURL: string) {",
    );
    expect(byPath.get("courier.config.ts")).toContain(
      'sources: { api: createApi("http://localhost:7001") },',
    );
    expect(byPath.get("src/courier/address.ts")).toContain(
      'Platform.OS === "android" ? "http://10.0.2.2:7001"',
    );
    expect(byPath.get("src/app/courier.tsx")).toContain("export default function CourierScreen()");
    expect(byPath.get("src/app/courier.tsx")).toContain('keyboardShouldPersistTaps="handled"');
    expect(byPath.get("src/app/courier.tsx")).toContain("onSubmitEditing={add}");
    expect(recipe.next.at(-1)).toEqual({
      command: "",
      what: "In the simulator or on a phone, open expoapp://courier",
    });
  });
});
