import { readFileSync } from "node:fs";
import nodePath, { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { readSamplePages } from "./doc-samples.mjs";
import { proseProblems } from "./prose-entries.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENTRY_EXPORTS = JSON.parse(
  readFileSync(join(ROOT, "packages/core/entry-exports.json"), "utf8"),
);
const PAGE = "docs/src/content/docs/api/a.mdx";

/* What a refusal says, the line it names left out. */
const said = (text) =>
  proseProblems([{ page: PAGE, text }]).map((problem) => problem.replace(/^\S+ /, ""));
/* The lines of a page's prose refused, each as `page:line`. */
const refused = (text) =>
  proseProblems([{ page: PAGE, text }]).map((problem) => problem.replace(/ .*$/, ""));

describe("the docs' prose", () => {
  it("is refused the root as the entry to take names from, in each way it is written", () => {
    const forms = [
      "Narrow it with `isHTTPError` from `@noverax/courier`.",
      "From `@noverax/courier`, take `isHTTPError`.",
      "Take `isHTTPError` from the `@noverax/courier` package.",
      "Take `isHTTPError` from **`@noverax/courier`**.",
      "Take `isHTTPError` from _@noverax/courier_, or from @noverax/courier.",
      'Take `isHTTPError` from "@noverax/courier", or from “@noverax/courier”.',
      'Write `import { isHTTPError } from "@noverax/courier"` in the page.',
      "Write `import { isHTTPError } from '@noverax/courier'` in the page.",
    ];
    expect(refused(forms.join("\n\n"))).toEqual(forms.map((_, n) => `${PAGE}:${2 * n + 1}`));
  });

  it("reads a paragraph's lines together, at the line the root is taken on", () => {
    const text =
      "# Errors\n\nNarrow a hook's error with `isHTTPError`, which comes from\n`@noverax/courier`.\n";
    expect(refused(text)).toEqual([`${PAGE}:3`]);
  });

  it("may take names from an entry under the root, or from another package", () => {
    const text = [
      "Narrow it with `isHTTPError` from `@noverax/courier/client`, and on a server from `@noverax/courier/server`.",
      "The realtime errors come from `@noverax/courier/realtime`, the routes from the `@noverax/courier/routes` module.",
      'Write `import { defineApi } from "@noverax/courier/define"`, and take the hooks from the `@noverax/courier-react` package.',
      "`@noverax/courier` keeps every name it had, and is the CLI's peer.",
    ].join("\n\n");
    expect(refused(text)).toEqual([]);
  });

  it("leaves code alone: its fences, and its tabbed code", () => {
    const fenced = '```ts root="its exports"\n// from `@noverax/courier`\nexport {}\n```\n';
    const indented = '  ```ts\n  import { isHTTPError } from "@noverax/courier"\n  ```\n';
    const tilde = "~~~md\nTake it from `@noverax/courier`.\n~~~\n";
    const tabs = [
      "<CodeGroup",
      "  items={[",
      '    { label: "Root", side: "both", root: "its caller", code: `import { createCaller } from "@noverax/courier"`, language: "ts" },',
      "  ]}",
      "/>",
    ].join("\n");
    expect(refused(`${fenced}\n${indented}\n${tilde}\n${tabs}\n`)).toEqual([]);
  });

  it("reads each row of a table alone", () => {
    const text = [
      "| Import | Where |",
      "|---|---|",
      "| `isHTTPError` | from `@noverax/courier` |",
      "",
      "Narrow it with `isHTTPError` from `@noverax/courier`.",
    ].join("\n");
    expect(refused(text)).toEqual([`${PAGE}:3`, `${PAGE}:5`]);
  });

  it("names each side's entry for the names the root is taken for, by the entries each side takes them from", () => {
    expect(said("Narrow it with `isHTTPError` from `@noverax/courier`.")).toEqual([
      `the prose takes isHTTPError from "@noverax/courier": name the entry of the side it speaks of, "@noverax/courier/client" for a page's code, "@noverax/courier/server" for a server's`,
    ]);
    expect(said("Take `redact()` from `@noverax/courier`.")).toEqual([
      `the prose takes redact from "@noverax/courier": name the entry of the side it speaks of, the root for a page's code, as "the root", since "@noverax/courier/client" leaves it out, "@noverax/courier/server" for a server's`,
    ]);
    expect(said("Make the handler with `createHandler` from `@noverax/courier`.")).toEqual([
      `the prose takes createHandler from "@noverax/courier": name the entry of the side it speaks of, "@noverax/courier/server", which alone gives it`,
    ]);
    expect(said("Smooth a bar with `smoothProgress` from `@noverax/courier`.")).toEqual([
      `the prose takes smoothProgress from "@noverax/courier": name the entry of the side it speaks of, "@noverax/courier/client", which alone gives it`,
    ]);
    expect(said("Take `redact` and `isHTTPError` from `@noverax/courier`.")).toEqual([
      `the prose takes redact, isHTTPError from "@noverax/courier": name the entry of the side it speaks of, for redact, the root for a page's code, as "the root", since "@noverax/courier/client" leaves it out, "@noverax/courier/server" for a server's; for isHTTPError, "@noverax/courier/client" for a page's code, "@noverax/courier/server" for a server's`,
    ]);
  });

  it('reads the names a "from" takes in its sentence: before it, after it, or in an import written inline', () => {
    const takes = (text) =>
      said(text).map((problem) => problem.replace(/ from "@noverax\/courier": .*$/, ""));
    expect(takes("From `@noverax/courier`, take `redact`.")).toEqual(["the prose takes redact"]);
    expect(
      takes('Write `import { redact, type CallOptions as Options } from "@noverax/courier"`.'),
    ).toEqual(["the prose takes redact, CallOptions"]);
    expect(
      takes(
        "Take `createCaller` from `@noverax/courier/client` and `redact` from `@noverax/courier`. Then call `createHandler`.",
      ),
    ).toEqual(["the prose takes redact"]);
    expect(
      takes("Take `useQuery` from the hooks and `isHTTPError` from `@noverax/courier`."),
    ).toEqual(["the prose takes isHTTPError"]);
  });

  it("names, where the sentence names nothing of the core, the names a page takes from the root alone", () => {
    const rootOnly = Object.keys(ENTRY_EXPORTS["./client"].rootOnly);
    expect(rootOnly.length).toBeGreaterThan(0);
    expect(said("Import it from `@noverax/courier`.")).toEqual([
      `the prose takes names from "@noverax/courier": name the entry of the side it speaks of, "@noverax/courier/client" for a page's code, or the root, as "the root", for ${rootOnly.join(", ")}, which it leaves out, and "@noverax/courier/server" for a server's`,
    ]);
  });

  it("names a side's entry on every page of the docs and every README", () => {
    expect(proseProblems(readSamplePages(ROOT))).toEqual([]);
  });

  it("reads the pages alike however the system names them, as Windows does too", () => {
    expect(proseProblems(readSamplePages(ROOT, nodePath.win32))).toEqual([]);
  });
});
