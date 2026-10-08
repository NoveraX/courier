/**
 * `courier-studio verify`, run as CI runs it: every recorded call checked
 * against the definition `courier.config.ts` declares now — exit 0 while
 * each still fits, 1 once one does not, with what broke it — as text, or as
 * Markdown written to a file for a pull request. A browser's own HAR in a
 * folder is passed over; one named outright, or no recordings at all, is
 * an error that says what to do.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fixturesToHar } from "@noverax/courier-mock/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CLI = join(__dirname, "../src/cli.ts");
const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

let root: string;

function config(route: string): string {
  return `import { courier, defineApi } from "@noverax/courier/define";
import { z } from "zod";
const { endpoint } = courier();
export default {
  sources: {
    shop: defineApi({
      baseURL: "https://shop.example",
      endpoints: { product: endpoint.get("${route}").variables(z.object({ id: z.string() })) },
    }),
  },
};
`;
}

function verify(...args: string[]) {
  return spawnSync(process.execPath, ["--import", TSX, CLI, "verify", "--cwd", root, ...args], {
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, NO_COLOR: "1" },
  });
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "courier-verify-"));
  symlinkSync(resolve(__dirname, "../../../node_modules"), join(root, "node_modules"), "dir");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "shop", type: "module" }));
  writeFileSync(join(root, "courier.config.ts"), config("products/:id"));
  mkdirSync(join(root, "tests/recorded"), { recursive: true });
  const recording = {
    source: "shop",
    group: "",
    method: "product",
    variables: { id: "p_1" },
    request: { method: "GET", url: "https://shop.example/products/p_1" },
    response: { status: 200, data: {}, headers: {} },
    duration: 30,
    recordedAt: "2026-10-09T01:00:00.000Z",
  };
  writeFileSync(
    join(root, "tests/recorded/checkout.shop.har"),
    JSON.stringify(fixturesToHar([recording])),
  );
  writeFileSync(
    join(root, "tests/recorded/browser.har"),
    JSON.stringify({ log: { entries: [{}] } }),
  );
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("courier-studio verify", () => {
  it("passes while every recorded call fits, passing over a browser's own HAR", () => {
    const run = verify();

    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain("tests/recorded/checkout.shop.har  1 calls");
    expect(run.stdout).toContain("tests/recorded/browser.har  passed over:");
    expect(run.stdout).toContain("1 recorded calls checked: 1 fit, 0 broke");
  });

  it("fails once a call no longer fits, saying what broke it, in Markdown for a pull request too", () => {
    writeFileSync(join(root, "courier.config.ts"), config("items/:id"));
    const summary = join(root, "summary.md");

    const text = verify();
    const markdown = verify("--format", "markdown", "--out", summary);
    const ignored = verify("--ignore", "product");

    expect([text.status, markdown.status, ignored.status]).toEqual([1, 1, 0]);
    expect(text.stdout).toContain("BROKE  shop product · GET /products/p_1 → 200");
    expect(text.stdout).toContain(
      "path changed: recorded at /products/p_1, but the endpoint now sends to /items/:id",
    );
    expect(readFileSync(summary, "utf8")).toContain(
      "| `shop product` | 1 | path changed — recorded at /products/p_1, but the endpoint now sends to /items/:id |",
    );
    writeFileSync(join(root, "courier.config.ts"), config("products/:id"));
  });

  it("refuses a file named that is not a recordings file, and a project with no recordings", () => {
    const named = verify("tests/recorded/browser.har");
    const elsewhere = spawnSync(
      process.execPath,
      ["--import", TSX, CLI, "verify", "--cwd", join(root, "tests")],
      { encoding: "utf8", timeout: 30_000, env: { ...process.env, NO_COLOR: "1" } },
    );

    expect(named.status).toBe(1);
    expect(named.stderr + named.stdout).toContain("is not a HAR log of Courier recordings");
    expect(elsewhere.status).toBe(1);
    expect(elsewhere.stderr + elsewhere.stdout).toContain(
      "No recordings to check: tests/recorded does not exist",
    );
  });
});
