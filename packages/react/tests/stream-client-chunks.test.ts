/**
 * What a bundle of the query callers loads before any stream or channel is
 * opened: the SSE and WebSocket clients load when a stream first opens, not
 * with an application's first page, whether or not it ever opens one.
 */
import { resolve } from "node:path";
import { build, type Metafile } from "esbuild";
import { describe, expect, it } from "vitest";

const SRC = resolve(import.meta.dirname, "../src");
/* Code only the SSE client and the WebSocket client run: the header a stream resumes
   with, and the reason a socket is dropped when its server falls silent. */
const SSE_CLIENT = '"Last-Event-ID"';
const WS_CLIENT = '"Server silence"';

/* The chunks a page loads with the entry: it and what it imports statically. */
function loadedWith(entry: string, outputs: Metafile["outputs"]): Set<string> {
  const loaded = new Set<string>();
  const visit = (path: string): void => {
    const output = outputs[path];
    if (!output || loaded.has(path)) return;
    loaded.add(path);
    for (const imported of output.imports) {
      if (imported.kind === "import-statement") visit(imported.path);
    }
  };
  visit(entry);
  return loaded;
}

async function bundleOf(caller: string): Promise<{ atOnce: string; all: string }> {
  const { outputFiles, metafile } = await build({
    stdin: {
      contents: `export { ${caller} } from "./index.ts";`,
      resolveDir: SRC,
      loader: "ts",
    },
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "browser",
    outdir: resolve(SRC, "../out"),
    write: false,
    metafile: true,
    /* Courier's packages resolved as an application resolves them: built. */
    tsconfigRaw: {},
    external: ["react", "react-dom", "@tanstack/react-query"],
    logLevel: "silent",
  });
  const entry = Object.keys(metafile.outputs).find((path) => path.endsWith("stdin.js")) ?? "";
  const loaded = loadedWith(entry, metafile.outputs);
  const texts = outputFiles.map((file) => ({
    /* The metafile names outputs with forward slashes, Windows ones too. */
    loaded: [...loaded].some((path) =>
      file.path.replaceAll("\\", "/").endsWith(path.replace(/^.*out\//, "out/")),
    ),
    text: file.text,
  }));
  return {
    atOnce: texts
      .filter((file) => file.loaded)
      .map((file) => file.text)
      .join("\n"),
    all: texts.map((file) => file.text).join("\n"),
  };
}

describe("a bundle of a query caller", () => {
  it.each(["createProxyQueryCaller", "createQueryCaller"])(
    "loads the stream and channel clients of %s only when one opens",
    async (caller) => {
      const { atOnce, all } = await bundleOf(caller);

      expect(atOnce).not.toBe("");
      expect([atOnce.includes(SSE_CLIENT), atOnce.includes(WS_CLIENT)]).toEqual([false, false]);
      expect([all.includes(SSE_CLIENT), all.includes(WS_CLIENT)]).toEqual([true, true]);
    },
    30_000,
  );
});
