/**
 * The package on the server, as a React Server Component uses it: build a
 * caller, prefetch into a fresh QueryClient, dehydrate for the client.
 *
 * Next.js turns every export of a module marked "use client" into a client
 * reference, and calling one on the server throws; it also refuses to build
 * a server module that imports React's client-only hooks by name. The first
 * made the documented prefetch recipe fail with a 500, the second is what a
 * plain removal of the directive runs into.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { createQueryCaller, createQueryKeys, dehydrate, QueryClient } from "../src/index";
import { sendJson, startTestServer, type TestServer } from "./helpers/test-server";

const { endpoint } = courier();
const SOURCE_DIR = join(import.meta.dirname, "..", "src");

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer((_req, res) => sendJson(res, [{ id: "1", name: "Alice" }]));
});

afterEach(() => server.close());

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(join(dir, entry.name))
      : entry.name.endsWith(".ts")
        ? [join(dir, entry.name)]
        : [],
  );
}

describe("on the server", () => {
  it("prefetches into a QueryClient under the key the hooks read", async () => {
    const users = defineGroup({
      prefix: "users",
      endpoints: { list: endpoint.get("").response<{ id: string; name: string }[]>() },
    });
    const api = defineApi({ name: "api", baseURL: server.origin, groups: { users } });
    const queryClient = new QueryClient();

    await createQueryCaller(api).users.prefetchQuery(queryClient, "list");

    const [query] = dehydrate(queryClient).queries;
    expect(query?.queryKey).toEqual(createQueryKeys(api)("users", "list"));
    expect(query?.state.data).toEqual([{ id: "1", name: "Alice" }]);
  });

  it("marks no module of the package as client-only", () => {
    const marked = sourceFiles(SOURCE_DIR).filter((file) =>
      /^\s*["']use client["']/.test(readFileSync(file, "utf8")),
    );

    expect(marked).toEqual([]);
  });

  it("imports React's hooks only through its namespace", () => {
    const named = sourceFiles(SOURCE_DIR).filter((file) =>
      /import\s*\{[^}]*\}\s*from\s*["']react["']/.test(readFileSync(file, "utf8")),
    );

    expect(named).toEqual([]);
  });
});
