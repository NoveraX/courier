/**
 * Planning an import's file changes on a real project directory: what is
 * written, merged, removed, left alone, blocked or held for the user, and
 * the digest that ties a preview to its apply.
 */
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateFingerprints } from "../../src/apis/merge/fingerprint";
import { bodyHash } from "../../src/server/import-files/body-hash";
import { FilePlanError } from "../../src/server/import-files/file-plan-error";
import type { PlanTarget } from "../../src/server/import-files/file-plan-types";
import { signGeneratedFile } from "../../src/server/import-files/generated-header";
import { planFiles } from "../../src/server/import-files/plan-files";
import type { RecordedFile } from "../../src/server/import-files/recorded-file";
import { withConfirmations } from "../../src/server/import-files/with-confirmations";
import { type ProjectRoot, projectRootAt } from "../../src/server/project-fs/project-root";

const IS_WINDOWS = process.platform === "win32";
const DIR = "src/api/pets";

const GROUP = (listBody: string) => [
  'import { courier, defineGroup } from "@noverax/courier/define";',
  "",
  "const { endpoint } = courier();",
  "",
  "export const pets = defineGroup({",
  '  prefix: "/pets",',
  "  endpoints: {",
  `    listPets: endpoint.get("/")${listBody},`,
  '    createPet: endpoint.post("/"),',
  "  },",
  "});",
  "",
].join("\n");

let scratch: string;
let root: ProjectRoot;

beforeEach(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "courier-plan-files-")));
  mkdirSync(join(scratch, "proj"));
  root = projectRootAt(join(scratch, "proj"));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function put(path: string, content: string): void {
  mkdirSync(dirname(join(root.path, path)), { recursive: true });
  writeFileSync(join(root.path, path), content);
}

function generated(path: string, body: string): PlanTarget {
  return { path, body, kind: "generated", endpoints: {} };
}

function recordOf(body: string, extra: Partial<RecordedFile> = {}): RecordedFile {
  return { sha256: bodyHash(body), ...extra };
}

function plan(targets: PlanTarget[], removals: string[], recorded: Record<string, RecordedFile> = {}) {
  return planFiles(root, { importName: "pets", dir: DIR, targets, removals }, recorded);
}

describe("planFiles, for the files an operation wants", () => {
  it("creates a file that is not there", () => {
    const result = plan([generated(`${DIR}/index.ts`, "export {};\n")], []);

    expect(result.writes).toMatchObject([{ path: `${DIR}/index.ts`, action: "create", was: "absent" }]);
  });

  it("replaces Studio's own untouched file, and leaves one already right unchanged", () => {
    put(`${DIR}/index.ts`, "old\n");
    put(`${DIR}/source.ts`, "same\n");
    const recorded = { [`${DIR}/index.ts`]: recordOf("old\n"), [`${DIR}/source.ts`]: recordOf("same\n") };

    const result = plan(
      [generated(`${DIR}/index.ts`, "new\n"), generated(`${DIR}/source.ts`, "same\n")],
      [],
      recorded,
    );

    expect(result.writes.map((w) => [w.path, w.action])).toEqual([
      [`${DIR}/index.ts`, "replace"],
      [`${DIR}/source.ts`, "unchanged"],
    ]);
    expect(result.pending).toEqual([]);
  });

  it("holds replacing a generated file the user edited until the user allows it", () => {
    put(`${DIR}/source.ts`, "edited\n");

    const result = plan([generated(`${DIR}/source.ts`, "new\n")], [], {
      [`${DIR}/source.ts`]: recordOf("as written\n"),
    });

    expect(result.writes).toEqual([]);
    expect(result.pending.map((step) => step.confirmation)).toEqual([
      { path: `${DIR}/source.ts`, kind: "replace", reason: "edited", preselected: false },
    ]);
  });

  it("merges an endpoint file, keeping the endpoint the user edited and adding the new one", () => {
    const asGenerated = GROUP("");
    const regenerated = asGenerated.replace(
      '    createPet: endpoint.post("/"),',
      '    createPet: endpoint.post("/"),\n    deletePet: endpoint.delete("/:id"),',
    );
    put(`${DIR}/pets/index.ts`, GROUP(".query<{ page: number }>()"));
    const recorded = {
      [`${DIR}/pets/index.ts`]: recordOf(asGenerated, { endpoints: generateFingerprints(asGenerated) }),
    };

    const result = plan(
      [{ path: `${DIR}/pets/index.ts`, body: regenerated, kind: "merge", endpoints: generateFingerprints(regenerated) }],
      [],
      recorded,
    );

    expect(result.writes[0]).toMatchObject({ action: "merge", was: "recorded-edited", carriesEdits: true });
    expect(result.writes[0]?.body).toContain(".query<{ page: number }>()");
    expect(result.writes[0]?.body).toContain("deletePet");
  });

  it("merges the same way when nothing new was generated, leaving the file unchanged", () => {
    const asGenerated = GROUP("");
    const edited = GROUP(".query<{ page: number }>()");
    put(`${DIR}/pets/index.ts`, edited);
    const recorded = {
      [`${DIR}/pets/index.ts`]: recordOf(asGenerated, { endpoints: generateFingerprints(asGenerated) }),
    };

    const result = plan(
      [{ path: `${DIR}/pets/index.ts`, body: asGenerated, kind: "merge", endpoints: generateFingerprints(asGenerated) }],
      [],
      recorded,
    );

    expect(result.writes[0]).toMatchObject({ action: "unchanged", carriesEdits: true, body: edited });
  });

  it("uses a header's claim when there is no record, a fresh clone's files", () => {
    put(`${DIR}/index.ts`, signGeneratedFile("pets", "old\n"));

    const result = plan([generated(`${DIR}/index.ts`, "new\n")], []);

    expect(result.writes).toMatchObject([{ action: "replace", was: "claimed" }]);
  });

  it("holds replacing a file Studio never wrote, or wrote for another import", () => {
    put(`${DIR}/index.ts`, "hand-written\n");
    put(`${DIR}/source.ts`, signGeneratedFile("store", "theirs\n"));

    const result = plan(
      [generated(`${DIR}/index.ts`, "new\n"), generated(`${DIR}/source.ts`, "new\n")],
      [],
    );

    expect(result.pending.map((step) => [step.confirmation.path, step.confirmation.reason])).toEqual([
      [`${DIR}/index.ts`, "foreign"],
      [`${DIR}/source.ts`, "foreign"],
    ]);
  });

  it.skipIf(IS_WINDOWS)("blocks a target that is a link, or that a directory link leads outside", () => {
    put(`${DIR}/real.ts`, "x\n");
    symlinkSync(join(root.path, `${DIR}/real.ts`), join(root.path, `${DIR}/index.ts`));
    mkdirSync(join(scratch, "outside"));
    symlinkSync(join(scratch, "outside"), join(root.path, `${DIR}/pets`));

    const result = plan(
      [generated(`${DIR}/index.ts`, "new\n"), generated(`${DIR}/pets/index.ts`, "new\n")],
      [],
    );

    expect(result.blocked).toEqual([
      { path: `${DIR}/index.ts`, reason: "link" },
      { path: `${DIR}/pets/index.ts`, reason: "link" },
    ]);
    expect(result.writes).toEqual([]);
  });

  it("refuses a path outside the import's directory", () => {
    expect(() => plan([generated("src/api/other/index.ts", "x\n")], [])).toThrow(/outside the import's directory/);
  });
});

describe("planFiles, for the files an operation no longer wants", () => {
  it("removes Studio's own untouched file and forgets one already gone", () => {
    put(`${DIR}/old/index.ts`, "gen\n");

    const result = plan([], [`${DIR}/old/index.ts`, `${DIR}/gone.ts`], {
      [`${DIR}/old/index.ts`]: recordOf("gen\n"),
      [`${DIR}/gone.ts`]: recordOf("x\n"),
    });

    expect(result.removals).toEqual([{ path: `${DIR}/old/index.ts`, was: "recorded", priorSha256: bodyHash("gen\n") }]);
    expect(result.forgotten).toEqual([`${DIR}/gone.ts`]);
  });

  it("asks before removing an edited file, one that kept the user's edits, or one only a header claims", () => {
    put(`${DIR}/a.ts`, "edited\n");
    put(`${DIR}/b.ts`, "merged\n");
    put(`${DIR}/c.ts`, signGeneratedFile("pets", "claimed\n"));

    const result = plan([], [`${DIR}/a.ts`, `${DIR}/b.ts`, `${DIR}/c.ts`], {
      [`${DIR}/a.ts`]: recordOf("as written\n"),
      [`${DIR}/b.ts`]: recordOf("merged\n", { carriesEdits: true }),
    });

    expect(result.removals).toEqual([]);
    expect(result.pending.map((step) => step.confirmation)).toEqual([
      { path: `${DIR}/a.ts`, kind: "remove", reason: "edited", preselected: false },
      { path: `${DIR}/b.ts`, kind: "remove", reason: "edited", preselected: false },
      { path: `${DIR}/c.ts`, kind: "remove", reason: "claimed", preselected: true },
    ]);
  });

  it("never touches a file Studio did not write, nor a link", () => {
    put(`${DIR}/helpers.ts`, "hand-written\n");

    const result = plan([], [`${DIR}/helpers.ts`]);

    expect(result.kept).toEqual([{ path: `${DIR}/helpers.ts`, reason: "not-written-by-studio" }]);
    expect(result.removals).toEqual([]);
  });

  it("forgets rather than removes a file that is, on disk, one of the files it writes", () => {
    put(`${DIR}/index.ts`, "gen\n");
    linkSync(join(root.path, `${DIR}/index.ts`), join(root.path, `${DIR}/alias.ts`));

    const result = plan([generated(`${DIR}/index.ts`, "new\n")], [`${DIR}/alias.ts`], {
      [`${DIR}/index.ts`]: recordOf("gen\n"),
      [`${DIR}/alias.ts`]: recordOf("gen\n"),
    });

    expect(result.removals).toEqual([]);
    expect(result.forgotten).toEqual([`${DIR}/alias.ts`]);
  });
});

describe("the plan's digest and confirmations", () => {
  it("stays the same while nothing changes, and changes when a file it rests on does", () => {
    put(`${DIR}/index.ts`, "old\n");
    const recorded = { [`${DIR}/index.ts`]: recordOf("old\n") };
    const targets = [generated(`${DIR}/index.ts`, "new\n")];

    const first = plan(targets, [], recorded).digest;
    const again = plan(targets, [], recorded).digest;
    put(`${DIR}/index.ts`, "old, then edited\n");
    const afterEdit = plan(targets, [], recorded).digest;

    expect(again).toBe(first);
    expect(afterEdit).not.toBe(first);
  });

  it("takes the steps the user allowed and keeps the rest", () => {
    put(`${DIR}/a.ts`, "edited\n");
    put(`${DIR}/b.ts`, "edited\n");
    const recorded = { [`${DIR}/a.ts`]: recordOf("x\n"), [`${DIR}/b.ts`]: recordOf("y\n") };
    const previewed = plan([], [`${DIR}/a.ts`, `${DIR}/b.ts`], recorded);

    const applied = withConfirmations(previewed, [`${DIR}/a.ts`]);

    expect(applied.removals.map((r) => r.path)).toEqual([`${DIR}/a.ts`]);
    expect(applied.kept).toEqual([{ path: `${DIR}/b.ts`, reason: "unconfirmed" }]);
    expect(applied.digest).toBe(previewed.digest);
  });

  it("refuses consent to a step the plan does not hold", () => {
    const previewed = plan([], []);

    expect(() => withConfirmations(previewed, [`${DIR}/index.ts`])).toThrow(FilePlanError);
  });
});
