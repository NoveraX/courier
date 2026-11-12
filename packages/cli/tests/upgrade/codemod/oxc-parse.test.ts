/**
 * How the upgrade takes oxc's tree of each file: through the memory oxc
 * shares with JavaScript where the system reserves it as it is written,
 * which is several times as fast as JSON and gives the same tree; as JSON
 * on Windows, which commits that memory whole, and from the moment the
 * system refuses it.
 */
import type * as OxcParser from "oxc-parser";
import { parseSync } from "oxc-parser";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { parsePiece } from "../../../src/upgrade/codemod/piece-parse";
import type { CodePiece } from "../../../src/upgrade/codemod/source-files";
import { moduleRecord } from "../../../src/upgrade/entries/module-records";
import { projectWith, removeProjects } from "../../helpers/temp-project";

vi.mock("oxc-parser", async (importOriginal) => {
  const actual = await importOriginal<typeof OxcParser>();
  return { ...actual, parseSync: vi.fn(actual.parseSync) };
});

afterAll(removeProjects);

const REAL_PLATFORM = process.platform;
const TEXT =
  'import { isHTTPError } from "@noverax/courier";\nexport const status = (error: unknown) => (isHTTPError(error) ? error.status : 0n);\n';
const PIECE: CodePiece = {
  path: "src/a.ts",
  text: TEXT,
  offset: 0,
  parseAs: ".ts",
  kind: "module",
};

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
    enumerable: true,
  });
}

/* Whether a call of oxc's parse takes its tree through the memory oxc shares with JavaScript. */
function throughShared(options: unknown): boolean {
  return (
    (options as { experimentalRawTransfer?: boolean } | undefined)?.experimentalRawTransfer === true
  );
}

/* Whether each call of oxc's parse so far took its tree that way. */
function shared(): boolean[] {
  return vi.mocked(parseSync).mock.calls.map(([, , options]) => throughShared(options));
}

/* A file's tree and the graph's record of it, each parsed as the upgrade parses them. */
function parseBoth(): void {
  parsePiece(PIECE, TEXT).program();
  moduleRecord(projectWith({ "src/a.ts": TEXT }), "src/a.ts");
}

afterEach(async () => {
  setPlatform(REAL_PLATFORM);
  const actual = await vi.importActual<typeof OxcParser>("oxc-parser");
  vi.mocked(parseSync).mockImplementation(actual.parseSync);
  vi.mocked(parseSync).mockClear();
});

describe("the upgrade's parse of a file's code", () => {
  it("takes the tree through the memory oxc shares with JavaScript on Linux and macOS, the same tree as JSON gives", async () => {
    const actual = await vi.importActual<typeof OxcParser>("oxc-parser");
    for (const platform of ["darwin", "linux"] as const) {
      setPlatform(platform);
      vi.mocked(parseSync).mockClear();

      parseBoth();

      expect(shared()).toEqual([true, true]);
    }
    expect(parsePiece(PIECE, TEXT).program()).toEqual(actual.parseSync("piece.ts", TEXT).program);
  });

  it("takes it as JSON on Windows, which commits that memory whole", () => {
    setPlatform("win32");

    parseBoth();

    expect(shared()).toEqual([false, false]);
  });

  it("takes it as JSON from then on where the system refuses that memory", async () => {
    const actual = await vi.importActual<typeof OxcParser>("oxc-parser");
    vi.mocked(parseSync).mockImplementation((filename, text, options) => {
      if (throughShared(options)) throw new RangeError("Array buffer allocation failed");
      return actual.parseSync(filename, text, options);
    });
    vi.resetModules();
    const fresh = await import("../../../src/upgrade/codemod/piece-parse");
    setPlatform("linux");

    const tree = fresh.parsePiece(PIECE, TEXT).program();
    fresh.parsePiece(PIECE, TEXT).program();

    expect(tree).toEqual(actual.parseSync("piece.ts", TEXT).program);
    expect(shared()).toEqual([true, false, false]);
  });
});
