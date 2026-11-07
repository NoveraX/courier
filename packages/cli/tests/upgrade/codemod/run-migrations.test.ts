import { describe, expect, it } from "vitest";

import { isNode, walk } from "../../../src/upgrade/codemod/ast";
import { migrateCode } from "../../../src/upgrade/codemod/run-migrations";
import type { Migration } from "../../../src/upgrade/migration";
import { REALTIME_ERRORS } from "../../../src/upgrade/migrations/realtime-errors";
import { SUBSCRIPTION_TYPE } from "../../../src/upgrade/migrations/subscription-type";
import { UNTOLD } from "../migrations/migrate-with";

/* A migration that finds each call of report(), and changes nothing. */
const FINDS_REPORT: Migration = {
  id: "test/finds-report",
  title: "finds report()",
  mentions: ["report"],
  migrate(file) {
    const findings: Array<{ at: number; what: string; instead: string[] }> = [];
    walk(file.program, ({ node }) => {
      if (node.type === "CallExpression" && isNode(node.callee) && node.callee.name === "report")
        findings.push({ at: node.start, what: "report() is gone", instead: ["log()"] });
    });
    return { edits: [], findings, packages: [] };
  },
};

/* A migration whose change leaves the file unparsable. */
const BREAKS: Migration = {
  id: "test/breaks",
  title: "breaks the file",
  mentions: ["AuthError"],
  migrate: () => ({ edits: [{ start: 0, end: 0, text: "import {" }], findings: [], packages: [] }),
};

const code = (files: Array<{ path: string; text: string }>) => ({
  files,
  paths: files.map((file) => file.path),
  links: new Map<string, string>(),
  unread: [],
  stopped: false,
});

describe("migrateCode", () => {
  it("runs each migration on the text the one before left, and finds what is left at its line in the file as it ends", () => {
    const text = `import { AuthError, TimeoutError } from "@noverax/courier";
import type { SSESubscription } from "@noverax/courier/realtime";

let stream: SSESubscription;
report(new TimeoutError());
`;

    const migrated = migrateCode(
      code([{ path: "src/a.ts", text }]),
      [REALTIME_ERRORS, SUBSCRIPTION_TYPE, FINDS_REPORT],
      UNTOLD,
    );

    expect(migrated.edits).toHaveLength(1);
    expect(
      migrated.edits[0]?.after,
    ).toBe(`import { AuthError, RealtimeTimeoutError } from "@noverax/courier/realtime";
import type { Subscription } from "@noverax/courier/realtime";

let stream: Subscription;
report(new RealtimeTimeoutError());
`);
    expect(migrated.edits[0]?.purpose).toBe(
      "imports the realtime errors from @noverax/courier/realtime; names a stream's subscription Subscription",
    );
    expect(migrated.manual).toEqual([
      { file: "src/a.ts", what: "line 5: report() is gone", lines: ["log()"] },
    ]);
  });

  it("migrates a component's script blocks in place, and leaves the rest of its file as written", () => {
    const vue = `<template><p>{{ x }}</p></template>\n<script setup lang="ts">\nimport { AuthError } from "@noverax/courier";\n</script>\n`;

    const [edit] = migrateCode(
      code([{ path: "src/App.vue", text: vue }]),
      [REALTIME_ERRORS],
      UNTOLD,
    ).edits;

    expect(edit?.after).toBe(vue.replace('"@noverax/courier"', '"@noverax/courier/realtime"'));
  });

  it("drops a change that would not parse, and says a file it cannot parse was left to the person", () => {
    const unparsable = migrateCode(
      code([{ path: "src/b.ts", text: 'import { AuthError from "@noverax/courier";\n' }]),
      [REALTIME_ERRORS],
      UNTOLD,
    );
    const broken = migrateCode(
      code([{ path: "src/c.ts", text: 'import { AuthError } from "@noverax/courier";\n' }]),
      [BREAKS],
      UNTOLD,
    );

    expect(unparsable.edits).toEqual([]);
    expect(unparsable.manual[0]?.what).toMatch(
      /^line 1: it does not parse, so the upgrade left it as written: /,
    );
    expect(broken.edits).toEqual([]);
    expect(broken.manual[0]?.what).toBe(
      "line 1: the change that breaks the file would not parse, so it was left to you",
    );
  });

  it("passes over a migration whose words a file does not write, and parses no file that writes none", () => {
    const untouched: Migration = {
      id: "test/untouched",
      title: "is never run",
      mentions: ["sendAuthRequired"],
      migrate: () => {
        throw new Error("run on a file that writes none of its words");
      },
    };

    const migrated = migrateCode(
      code([
        { path: "src/a.ts", text: 'import { AuthError } from "@noverax/courier";\n' },
        { path: "src/b.ts", text: 'import { from "@noverax/courier";\n' },
      ]),
      [untouched, FINDS_REPORT],
      UNTOLD,
    );

    expect(migrated).toEqual({ edits: [], manual: [], needs: [] });
  });

  it("leaves a file Studio wrote to Studio, naming one a migration has something for", () => {
    const signed = `// @courier-generated {"import":"pets","sha256":"${"0".repeat(64)}"}\n// Courier Studio wrote this file. It keeps your edits to endpoints when it updates the file.\n`;
    const old = 'import { AuthError } from "@noverax/courier";\nreport(new AuthError());\n';

    const migrated = migrateCode(
      code([
        { path: "src/courier/pets.ts", text: `${signed}${old}` },
        {
          path: "src/courier/owners.ts",
          text: `${signed}import { courier } from "@noverax/courier/define";\n`,
        },
        { path: "src/courier/copied.ts", text: `// @courier-generated {"import":"pets"}\n${old}` },
      ]),
      [REALTIME_ERRORS, FINDS_REPORT],
      UNTOLD,
    );

    expect(migrated.edits.map((edit) => edit.path)).toEqual(["src/courier/copied.ts"]);
    expect(migrated.manual).toEqual([
      {
        file: "src/courier/pets.ts",
        what: expect.stringMatching(
          /^Studio wrote it, so the upgrade left it as it is: Regenerate files, in the import's Manage/,
        ),
        lines: [],
      },
      { file: "src/courier/copied.ts", what: "line 3: report() is gone", lines: ["log()"] },
    ]);
  });

  it("names the files left unread, and a walk that stopped at its limit", () => {
    const migrated = migrateCode(
      {
        files: [],
        paths: [],
        links: new Map(),
        unread: [{ path: "src/huge.ts", why: "it is 3 MiB", folder: false }],
        stopped: true,
      },
      [],
      UNTOLD,
    );

    expect(migrated.manual.map((step) => step.file)).toEqual(["src/huge.ts", "."]);
  });
});
