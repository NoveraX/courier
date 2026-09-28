/**
 * Error names in a minified bundle.
 *
 * Each error took its name from its class, and a minifier renames classes:
 * in a production build `HTTPError` came out as `R` and `ConfigurationError`
 * as `z`, so logs said nothing and a `name === "ConfigurationError"` check
 * never matched.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

const SRC = resolve(import.meta.dirname, "../src");

const ENTRY = `
import { ConfigurationError, CourierError, HTTPError } from "${SRC}/errors/index.ts";
import { ValidationError } from "${SRC}/validation/index.ts";
import { AuthError, RealtimeError } from "${SRC}/realtime/errors.ts";

export const names = [
  new HTTPError({ status: 404, headers: new Headers(), data: null }).name,
  new ConfigurationError("PROXY_PATH_INVALID", "bad").name,
  new ValidationError("response", []).name,
  new CourierError("bad", { code: "X" }).name,
  new RealtimeError(4000, "bad").name,
  new AuthError("bad").name,
];
`;

async function namesFromMinifiedBundle(): Promise<unknown> {
  const result = await build({
    stdin: { contents: ENTRY, resolveDir: SRC, loader: "ts" },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "neutral",
    write: false,
  });
  const dir = await mkdtemp(join(tmpdir(), "courier-names-"));
  try {
    const file = join(dir, "bundle.mjs");
    await writeFile(file, result.outputFiles[0]?.text ?? "");
    const bundle: { names: unknown } = await import(pathToFileURL(file).href);
    return bundle.names;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("error names after minification", () => {
  it("stay the names of the classes", async () => {
    expect(await namesFromMinifiedBundle()).toEqual([
      "HTTPError",
      "ConfigurationError",
      "ValidationError",
      "CourierError",
      "RealtimeError",
      "AuthError",
    ]);
  });
});
