/**
 * An import declared from traffic stays tied to it: the wizard's write says
 * the specification was read from the calls Studio recorded — only for one
 * pasted as raw — Studio records that with the import, keeps it while
 * endpoints are added or removed, drops it when another specification is
 * written in its place, and the pages are told, so managing the import reads
 * its traffic again.
 */
import { describe, expect, it } from "vitest";

import { type ImportsState, recordImport } from "../src/apis/imports-state";
import { isImportStateEntry } from "../src/apis/imports-state-guard";
import { parseSpec } from "../src/apis/parser/parse-spec";
import type { FilePlan } from "../src/server/import-files/file-plan-types";
import { recordAfterApply } from "../src/server/import-files/record-after-apply";
import { summarizeImports } from "../src/server/imports-bridge";
import { readWriteBody } from "../src/server/write-body";

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: "catalogue", version: "0.0.0" },
    paths: { "/items": { get: { operationId: "list", tags: ["items"], responses: {} } } },
  }),
);

const PLAN: FilePlan = {
  importName: "catalogue",
  dir: "src/api/catalogue",
  writes: [],
  removals: [],
  kept: [],
  pending: [],
  forgotten: [],
  blocked: [],
  digest: "d",
};

function write(fields: Record<string, unknown>) {
  return readWriteBody({
    sourceName: "catalogue",
    spec: SPEC,
    options: { type: "openapi", outputDir: "src/api", sourceName: "catalogue" },
    ...fields,
  });
}

describe("an import declared from traffic", () => {
  it("says so in the wizard's write only for a specification pasted as raw", () => {
    expect(write({ importType: "raw", origin: "traffic" })).toMatchObject({ origin: "traffic" });
    expect(write({ importType: "raw" })).not.toHaveProperty("origin");
    expect(
      write({ importType: "url", specUrl: "https://specs.example/a.json", origin: "traffic" }),
    ).toBeNull();
    expect(write({ importType: "raw", origin: "pasted" })).toBeNull();
  });

  it("is recorded with the import, kept as endpoints change, and dropped for another specification", () => {
    const declared = recordAfterApply(undefined, PLAN, { specHash: "h1", origin: "traffic" }, "t1");
    const grown = recordAfterApply(declared, PLAN, { specHash: "h2" }, "t2");
    const replaced = recordAfterApply(grown, PLAN, { specHash: "h3", origin: "given" }, "t3");

    expect(declared).toMatchObject({ specHash: "h1", origin: "traffic" });
    expect(grown).toMatchObject({ specHash: "h2", origin: "traffic" });
    expect(replaced).not.toHaveProperty("origin");
    expect(isImportStateEntry(declared)).toBe(true);
    expect(isImportStateEntry({ ...declared, origin: "pasted" })).toBe(false);
  });

  it("is told to the pages for a raw import whose record says so", () => {
    const entry = recordAfterApply(undefined, PLAN, { specHash: "h1", origin: "traffic" }, "t1");
    const state: ImportsState = recordImport(
      { version: 2, imports: {}, applied: [] },
      "catalogue",
      entry,
    );
    const declaration = { type: "openapi", outputDir: "src/api", sourceName: "catalogue" } as const;

    const [traffic] = summarizeImports({
      declarations: { catalogue: { ...declaration, importType: "raw" } },
      state,
    });
    const [file] = summarizeImports({
      declarations: { catalogue: { ...declaration, importType: "file" } },
      state,
    });

    expect(traffic).toMatchObject({ name: "catalogue", importType: "raw", fromTraffic: true });
    expect(file).not.toHaveProperty("fromTraffic");
  });
});
