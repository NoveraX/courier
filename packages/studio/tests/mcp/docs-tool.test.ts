/**
 * Studio's `docs` tool, which tells an agent where Courier's docs for the
 * project's version are: the folder `@noverax/courier-docs` installs, its
 * index in pieces as long as a page's read, and whether its version is
 * the project's Courier's — or, in a project without it, how to install it
 * and where the site has the docs meanwhile.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { docsTool } from "../../src/server/mcp/docs-tool";

const work = mkdtempSync(join(tmpdir(), "courier-studio-docs-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/* A project at a folder of its own, with the packages named installed at their versions. */
function project(name: string, packages: Record<string, string>, index?: string): string {
  const root = join(work, name);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name }));
  for (const [pkg, version] of Object.entries(packages)) {
    const dir = join(root, "node_modules", pkg);
    mkdirSync(dir, { recursive: true });
    const exports = { "./package.json": "./package.json" };
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: pkg, version, exports }));
  }
  if (index !== undefined) {
    const docs = join(root, "node_modules/@noverax/courier-docs/docs");
    mkdirSync(docs, { recursive: true });
    writeFileSync(join(docs, "index.md"), index);
  }
  return root;
}

async function ask(root: string, args: Record<string, unknown> = {}) {
  return docsTool(root).run(args, { signal: new AbortController().signal });
}

const INDEX = "# Courier 0.4.0 docs\n\n- [Quick Start](quick-start.md): set Courier up\n";

describe("Studio's docs tool", () => {
  it("names the docs the project installs, with their index, matched to its Courier", async () => {
    const root = project(
      "same",
      { "@noverax/courier-docs": "0.4.0", "@noverax/courier": "0.4.0" },
      INDEX,
    );

    expect(await ask(root)).toEqual({
      ok: true,
      data: {
        installed: true,
        version: "0.4.0",
        courier: "0.4.0",
        matches: true,
        folder: join("node_modules", "@noverax", "courier-docs", "docs"),
        read: expect.stringContaining("<page>.md in that folder"),
        index: INDEX,
        offset: 0,
        totalChars: INDEX.length,
      },
    });
  });

  it("says when the docs are another version's than the project's Courier, and how to match them", async () => {
    const root = project(
      "older",
      { "@noverax/courier-docs": "0.4.0", "@noverax/courier": "0.5.0" },
      INDEX,
    );
    const answer = await ask(root);

    expect(answer).toMatchObject({
      ok: true,
      data: { matches: false, update: "npm install --save-dev @noverax/courier-docs@0.5.0" },
    });
  });

  it("hands a long index in pieces, each ended at a line's end, with where to read on", async () => {
    const line = `- [A page](a.md): ${"what it covers ".repeat(6)}\n`;
    const index = line.repeat(Math.ceil(70_000 / line.length));
    const root = project("long", { "@noverax/courier-docs": "0.4.0" }, index);
    const pieces: string[] = [];
    let offset: number | undefined = 0;
    while (offset !== undefined) {
      const answer = await ask(root, { offset });
      if (!answer.ok) throw new Error(answer.message);
      const data = answer.data as { index: string; nextOffset?: number; totalChars: number };
      expect(data.index.length).toBeLessThanOrEqual(32_000);
      expect(data.totalChars).toBe(index.length);
      pieces.push(data.index);
      offset = data.nextOffset;
    }

    expect(pieces.length).toBe(3);
    expect(pieces.every((piece) => piece.endsWith("\n"))).toBe(true);
    expect(pieces.join("")).toBe(index);
  });

  it("tells a project without the docs how to install them, and where the site has them", async () => {
    const root = project("without", { "@noverax/courier": "0.4.0" });

    expect(await ask(root)).toEqual({
      ok: true,
      data: {
        installed: false,
        install: "npm install --save-dev @noverax/courier-docs",
        read: expect.stringContaining("the site has the latest release's docs"),
        index: "https://courier.noverax.cloud/llms.txt",
        page: "https://courier.noverax.cloud/docs/<page>.md",
      },
    });
  });

  it("refuses an offset that is no place in the index, and docs installed without one", async () => {
    const root = project("refused", { "@noverax/courier-docs": "0.4.0" }, INDEX);
    const broken = project("broken", { "@noverax/courier-docs": "0.4.0" });

    expect(await ask(root, { offset: -1 })).toEqual({
      ok: false,
      message: "offset is a whole number, from 0",
    });
    expect(await ask(root, { offset: INDEX.length + 1 })).toEqual({
      ok: false,
      message: `index.md has ${INDEX.length} characters, fewer than ${INDEX.length + 1}`,
    });
    expect(await ask(broken)).toEqual({
      ok: false,
      message: "@noverax/courier-docs 0.4.0 has no docs/index.md: install it again",
    });
  });
});
