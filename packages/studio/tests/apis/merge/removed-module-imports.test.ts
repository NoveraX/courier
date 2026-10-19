/**
 * An update that drops a group from an API whose source holds endpoints of
 * its own merges that source: the import of the dropped group's file goes,
 * unless what the merge keeps still uses it, so the file is removed as the
 * update says it is. An import of a module the update does not remove, used
 * or not, stays as the user wrote it.
 */
import { describe, expect, it } from "vitest";

import { generateCode } from "../../../src/apis/generator/generate-code";
import type { GeneratedFile, GenerateOptions } from "../../../src/apis/generator/types";
import { previewUpdate } from "../../../src/apis/merge/update-flow";
import { parseSpec } from "../../../src/apis/parser/parse-spec";

const ok = { 200: { description: "ok" } };
const OPTIONS: GenerateOptions = { type: "openapi", outputDir: "src/api", sourceName: "shop" };
const SOURCE = "src/api/shop/source.ts";

function spec(withStore: boolean) {
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Shop", version: withStore ? "1" : "2" },
      servers: [{ url: "https://shop.example" }],
      paths: {
        "/health": { get: { operationId: "health", responses: ok } },
        "/pets": { get: { operationId: "listPets", tags: ["pets"], responses: ok } },
        ...(withStore && {
          "/store": { get: { operationId: "listStore", tags: ["store"], responses: ok } },
        }),
      },
    }),
  );
}

function onDisk(
  files: GeneratedFile[],
  edit = (content: string) => content,
): Record<string, string> {
  return Object.fromEntries(
    files.map((file) => [file.path, file.path === SOURCE ? edit(file.content) : file.content]),
  );
}

function mergedSource(existing: Record<string, string>): string {
  const result = previewUpdate({}, generateCode(spec(false), OPTIONS), existing);
  expect(result.deletedFiles).toContain("src/api/shop/store/index.ts");
  return result.files.find((file) => file.path === SOURCE)?.content ?? "";
}

describe("previewUpdate, a group the specification dropped", () => {
  it("drops the import of its file from a source holding endpoints of its own", () => {
    const source = mergedSource(onDisk(generateCode(spec(true), OPTIONS)));

    expect(source).not.toContain("./store/index");
    expect(source).toContain('import { pets } from "./pets/index";');
  });

  it("keeps the import where code the merge keeps uses it", () => {
    const using = (content: string) => `${content}\nexport const kept = [store];\n`;
    const source = mergedSource(onDisk(generateCode(spec(true), OPTIONS), using));

    expect(source).toContain('import { store } from "./store/index";');
  });

  it("keeps an import of a module the update does not remove, though nothing uses it", () => {
    const helper = (content: string) => `import { debounce } from "lodash";\n${content}`;
    const source = mergedSource(onDisk(generateCode(spec(true), OPTIONS), helper));

    expect(source).toContain('import { debounce } from "lodash";');
    expect(source).not.toContain("./store/index");
  });
});
