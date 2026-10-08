/**
 * A session saved as a test: Studio plans the recordings and the vitest
 * file — secrets replaced, unanswered calls and repeats left out, the calls
 * checked now — and writes them only with the token, once the plan is the
 * one shown and a file there was agreed to be replaced. The test it writes
 * runs: it passes on the definition the calls were recorded against, and
 * fails once a route changes.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readRecordings } from "@noverax/courier-mock/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import { TOKEN_HEADER } from "../src/server/token-guard";
import type { StudioServer } from "../src/server/types";

const REPO_MODULES = resolve(import.meta.dirname, "../../../node_modules");

let root: string;
let url: string;
let studio: StudioServer | undefined;

function config(route: string): string {
  return `import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { z } from "zod";
const { endpoint } = courier();
const Product = z.object({ id: z.string(), price: z.number() });
export default {
  sources: {
    shop: defineApi({
      baseURL: "https://shop.example",
      groups: {
        products: defineGroup({
          prefix: "products",
          endpoints: {
            get: endpoint.get("${route}").variables(z.object({ id: z.string() })).response(Product),
            login: endpoint.post("login").variables(z.object({ email: z.string(), password: z.string() })),
          },
        }),
      },
    }),
  },
};
`;
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "courier-recorded-test-"));
  symlinkSync(REPO_MODULES, join(root, "node_modules"), "dir");
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "shop-app",
      type: "module",
      devDependencies: { vitest: "*", "@noverax/courier-mock": "*" },
    }),
  );
  writeFileSync(join(root, "courier.config.ts"), config(":id"));
  url = await new Promise<string>((done, fail) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: done,
      onError: fail,
    });
  });
});

afterAll(async () => {
  await studio?.close();
  rmSync(root, { recursive: true, force: true });
});

async function post(path: string, body: unknown, withToken = true): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(withToken && { [TOKEN_HEADER]: studio?.token ?? "" }),
    },
    body: JSON.stringify(body),
  });
}

function request(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(Math.random()),
    source: "shop",
    group: "products",
    method: "get",
    httpMethod: "GET",
    status: "success",
    statusCode: 200,
    startedAt: Date.parse("2026-10-09T01:00:00Z"),
    variables: { id: "p_1" },
    url: "https://shop.example/products/p_1",
    data: { id: "p_1", price: 12 },
    ...fields,
  };
}

const REQUESTS = [
  request({}),
  request({}),
  request({
    method: "login",
    httpMethod: "POST",
    url: "https://shop.example/products/login",
    variables: { email: "ada@example.com", password: "hunter2" },
    data: { ok: true },
  }),
  request({ status: "pending", statusCode: undefined }),
  request({ source: "billing" }),
];

const ASK = { title: "Checkout flow", requests: REQUESTS };

describe("saving a session as a test", () => {
  it("plans the recordings and the test, with the calls checked and what was left out", async () => {
    const plan = await (await post("/api/tests/plan", ASK)).json();

    expect(plan.files.map((file: { path: string }) => file.path)).toEqual([
      "tests/recorded/checkout-flow.shop.har",
      "tests/recorded/checkout-flow.test.ts",
    ]);
    expect(plan).toMatchObject({
      calls: 2,
      endpoints: 2,
      leftOut: { unanswered: 1, unknownSource: 1, repeats: 1 },
      redactions: ["#2 products.login · variables.password"],
      checks: { fits: 2, broken: 0, unchecked: 0, failures: [] },
      needs: [],
    });
    expect(plan.files[0].content).not.toContain("hunter2");
    expect(plan.files[1].content).toContain('import config from "../../courier.config";');
  });

  it("names a call the definition no longer fits before anything is written", async () => {
    const plan = await (
      await post("/api/tests/plan", { ...ASK, requests: [request({ variables: {} })] })
    ).json();

    expect(plan.checks).toMatchObject({ fits: 0, broken: 1 });
    expect(plan.checks.failures[0].problems[0]).toMatch(
      /^the recorded variables no longer pass the endpoint's variables schema: id /,
    );
  });

  it("refuses without the token, outside the project, and with nothing to check", async () => {
    const refused = await post("/api/tests/plan", ASK, false);
    const outside = await post("/api/tests/plan", { ...ASK, folder: "../elsewhere" });
    const nothing = await post("/api/tests/plan", { ...ASK, requests: [REQUESTS[3]] });

    expect([refused.status, outside.status, nothing.status]).toEqual([401, 400, 400]);
    expect((await nothing.json()).code).toBe("NO_ANSWERED_CALLS");
  });

  it("writes the files once the plan is the one shown, and replaces them only when agreed to", async () => {
    const plan = await (await post("/api/tests/plan", ASK)).json();

    const stale = await post("/api/tests/write", { ...ASK, digest: "0".repeat(64) });
    const written = await (await post("/api/tests/write", { ...ASK, digest: plan.digest })).json();
    const again = await (await post("/api/tests/plan", ASK)).json();
    const kept = await post("/api/tests/write", { ...ASK, digest: again.digest });
    const replaced = await post("/api/tests/write", {
      ...ASK,
      digest: again.digest,
      replace: true,
    });

    expect(stale.status).toBe(409);
    expect(written.written).toEqual(plan.files.map((file: { path: string }) => file.path));
    expect(again.files.every((file: { replaces: boolean }) => file.replaces)).toBe(true);
    expect([kept.status, replaced.status]).toEqual([409, 200]);
    expect(readRecordings(join(root, "tests/recorded/checkout-flow.shop.har"))[1]).toMatchObject({
      source: "shop",
      redacted: ["variables.password"],
    });
  });

  it("writes a test that passes on the definition it was recorded against, and fails once a route changes", () => {
    const vitest = join(REPO_MODULES, "vitest/vitest.mjs");
    const run = () =>
      spawnSync(process.execPath, [vitest, "run", "--root", root, "tests/recorded"], {
        encoding: "utf8",
        env: { ...process.env, CI: "1", FORCE_COLOR: "0" },
        timeout: 60_000,
      });

    const passing = run();
    writeFileSync(join(root, "courier.config.ts"), config("items/:id"));
    const failing = run();

    expect(existsSync(join(root, "tests/recorded/checkout-flow.test.ts"))).toBe(true);
    expect(passing.status, passing.stdout + passing.stderr).toBe(0);
    expect(failing.status).toBe(1);
    expect(failing.stdout + failing.stderr).toContain("path-changed");
    expect(readFileSync(join(root, "tests/recorded/checkout-flow.test.ts"), "utf8")).toContain(
      "verifyRecordings",
    );
  }, 120_000);
});
