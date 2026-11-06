import { readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import type { ServedTool } from "@noverax/courier-mcp/internal";

const DOCS = "@noverax/courier-docs";
const COURIER = "@noverax/courier";
const SITE = "https://courier.noverax.cloud";
/* As much of the index as the docs package's own docs_read hands out of a page at once. */
const PIECE_CHARS = 32_000;
/* The most read of the index, and of a package's manifest. */
const INDEX_BYTES = 512 * 1024;
const MANIFEST_BYTES = 1024 * 1024;

const READ =
  "Read a page as a file: <page>.md in that folder, as index.md links them — a link to /docs/<page> in a page names <page>.md there. " +
  `Or serve them as tools to the agent: npx ${DOCS} mcp.`;

/* A path with its links resolved, as the paths require.resolve finds are; itself when it is not there. */
function real(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/* The docs folder as the project names it: where its node_modules has the package — as the block
   in AGENTS.md names it — when that is the folder found, or the folder itself, from the root. */
function shown(root: string, folder: string): string {
  const named = join(root, "node_modules", DOCS, "docs");
  return real(named) === folder ? relative(root, named) : relative(real(root), folder);
}

/* A regular file's text, if it is one and no larger than `most` bytes. */
function textOf(file: string, most: number): string | undefined {
  try {
    const stats = statSync(file);
    return stats.isFile() && stats.size <= most ? readFileSync(file, "utf8") : undefined;
  } catch {
    return undefined;
  }
}

/* Where a package the project installs is, and its version: found as the project's own code would
   find it, from its root. Nothing when it is not installed. */
function installed(root: string, name: string): { dir: string; version: string } | undefined {
  let file: string;
  try {
    file = createRequire(join(root, "package.json")).resolve(`${name}/package.json`);
  } catch {
    return undefined;
  }
  const manifest = jsonOf(textOf(file, MANIFEST_BYTES));
  if (typeof manifest !== "object" || manifest === null || !("version" in manifest))
    return undefined;
  return typeof manifest.version === "string"
    ? { dir: dirname(file), version: manifest.version }
    : undefined;
}

/* A manifest's JSON, or nothing for a manifest that holds none. */
function jsonOf(text: string | undefined): unknown {
  try {
    return text === undefined ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}

/* Up to `most` characters of the text from `start`: ended at a line's end when it goes on past
   them, and never between the two halves of one character — as docs_read cuts a page. */
function piece(text: string, start: number, most: number): string {
  if (text.length - start <= most) return text.slice(start);
  let cut = text.slice(start, start + most);
  const lineEnd = cut.lastIndexOf("\n");
  if (lineEnd > 0) return cut.slice(0, lineEnd + 1);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut;
}

/* What an agent reads Courier's docs from when the project installs none: the site's. */
const NOT_INSTALLED = {
  installed: false,
  install: `npm install --save-dev ${DOCS}`,
  read: `The project installs no ${DOCS}: install it for the docs of the version it uses, read from node_modules with no network. Until then, the site has the latest release's docs, every page as Markdown at its address with .md after it.`,
  index: `${SITE}/llms.txt`,
  page: `${SITE}/docs/<page>.md`,
};

/**
 * `docs`: where Courier's documentation for the version the project
 * installs is — the Markdown `@noverax/courier-docs` ships, for the agent
 * to read as files — with its index, in pieces as long as a page's read,
 * whether its version is the project's Courier's, and the command that
 * serves it as tools. A project that installs none is told how to, and
 * where the site has the docs meanwhile. It reads the project's files
 * alone, and asks nothing of the network.
 *
 * @param root - The project's root, which the package is found from
 * @returns The tool
 * @example
 * ```ts
 * toolSet([docsTool(root)]);
 * ```
 */
export function docsTool(root: string): ServedTool {
  return {
    name: "docs",
    title: "Courier's docs",
    description: `Where Courier's documentation for the version this project installs is, as Markdown files to read before writing code that uses an @noverax/* package — with their index, ${PIECE_CHARS} characters at a time — or how to install it when the project has none.`,
    access: "read",
    idempotent: true,
    action: "read docs",
    inputSchema: {
      type: "object",
      properties: {
        offset: {
          type: "integer",
          minimum: 0,
          description: "Where to read on in the index, as the answer before said",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: { installed: { type: "boolean" } },
      required: ["installed"],
    },
    run: async ({ offset = 0 }) => {
      if (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0)
        return { ok: false, message: "offset is a whole number, from 0" };
      const docs = installed(root, DOCS);
      if (docs === undefined) return { ok: true, data: NOT_INSTALLED };
      const folder = join(docs.dir, "docs");
      const index = textOf(join(folder, "index.md"), INDEX_BYTES);
      if (index === undefined)
        return {
          ok: false,
          message: `${DOCS} ${docs.version} has no docs/index.md: install it again`,
        };
      if (offset > index.length)
        return {
          ok: false,
          message: `index.md has ${index.length} characters, fewer than ${offset}`,
        };
      const courier = installed(root, COURIER)?.version ?? null;
      const text = piece(index, offset, PIECE_CHARS);
      const end = offset + text.length;
      return {
        ok: true,
        data: {
          installed: true,
          version: docs.version,
          courier,
          matches: courier === docs.version,
          ...(courier !== null &&
            courier !== docs.version && { update: `npm install --save-dev ${DOCS}@${courier}` }),
          folder: shown(root, folder),
          read: READ,
          index: text,
          offset,
          ...(end < index.length && { nextOffset: end }),
          totalChars: index.length,
        },
      };
    },
  };
}
