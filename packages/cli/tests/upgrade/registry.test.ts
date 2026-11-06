import { managerFor } from "@noverax/create-courier/engine";
import { describe, expect, it } from "vitest";
import { publishedAt, readPublished, saysMissing, viewCommand } from "../../src/upgrade/registry";
import { projectWith } from "../helpers/temp-project";

describe("the registry", () => {
  it("reads a version and the Node.js it asks for, from one answer or the last of several", () => {
    expect(readPublished('{ "version": "0.5.0", "engines": { "node": ">=22.13" } }')).toEqual({
      version: "0.5.0",
      node: ">=22.13",
    });
    expect(readPublished('[{ "version": "0.5.0" }, { "version": "0.5.1" }]')).toEqual({
      version: "0.5.1",
      node: undefined,
    });
    expect(readPublished("")).toBeUndefined();
    expect(readPublished('"0.5.0"')).toBeUndefined();
  });

  it("tells a package or version that is not there from a registry that did not answer", () => {
    expect(saysMissing("npm error code E404\nnpm error 404 Not Found")).toBe(true);
    expect(
      saysMissing("npm error code ETARGET\nnpm error notarget No matching version found"),
    ).toBe(true);
    expect(saysMissing("npm error code ECONNREFUSED")).toBe(false);
  });

  it("asks through npm, and through yarn where Yarn's own settings name the registry", () => {
    const plain = projectWith({});
    const berry = projectWith({
      ".yarnrc.yml": "npmRegistryServer: https://registry.example.com\n",
    });

    expect(viewCommand(plain, managerFor(plain, "pnpm"), "@noverax/courier@latest")).toEqual([
      "npm",
      "view",
      "@noverax/courier@latest",
      "version",
      "engines",
      "--json",
    ]);
    expect(viewCommand(berry, managerFor(berry, "yarn"), "@noverax/courier@0.5.0")).toEqual([
      "yarn",
      "npm",
      "info",
      "@noverax/courier@0.5.0",
      "--fields",
      "version,engines",
      "--json",
    ]);
  });

  it("asks of every package at one version, a few at a time", async () => {
    let asking = 0;
    let most = 0;
    const registry = {
      async published(spec: string) {
        asking++;
        most = Math.max(most, asking);
        await Promise.resolve();
        asking--;
        return spec.startsWith("@noverax/gone@")
          ? undefined
          : { version: "0.5.0", node: undefined };
      },
    };
    const names = [
      "@noverax/courier",
      "@noverax/gone",
      ...Array.from({ length: 8 }, (_, at) => `@noverax/p${at}`),
    ];

    const found = await publishedAt(registry, names, "0.5.0");

    expect(found.get("@noverax/courier")).toEqual({ version: "0.5.0", node: undefined });
    expect(found.has("@noverax/gone") && found.get("@noverax/gone")).toBeUndefined();
    expect(found.size).toBe(10);
    expect(most).toBeLessThanOrEqual(4);
  });
});
