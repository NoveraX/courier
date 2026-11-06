/**
 * A specification's address that carries credentials: one with a user or
 * a password is refused before anything is sent — they belong in the
 * import's auth, read from the environment — and no message Studio makes of
 * an address, whichever way the fetch fails, repeats a credential it holds.
 */
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { fetchSpec } from "../src/server/fetch-spec";
import { SpecFetchError } from "../src/server/spec-fetch-error";
import type { SpecHostAllowlist } from "../src/server/spec-host-allowlist";

const NOTHING_LISTED: SpecHostAllowlist = async () => ({ state: "listed", hosts: [] });
const servers: Server[] = [];
const requested: string[] = [];

afterEach(async () => {
  requested.length = 0;
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

async function serve(status: number): Promise<string> {
  const server = createServer((req, res) => {
    requested.push(req.url ?? "");
    res.writeHead(status).end(status === 200 ? '{"openapi":"3.1.0"}' : "");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

async function failure(url: string): Promise<SpecFetchError> {
  try {
    await fetchSpec(url, NOTHING_LISTED);
  } catch (err) {
    if (err instanceof SpecFetchError) return err;
    throw err;
  }
  throw new Error(`${url} was fetched`);
}

describe("a specification's address that carries credentials", () => {
  it.each([
    ["a user and a password", "ana:hunter2-pw@"],
    ["a user alone", "ana-only@"],
  ])("is refused before anything is sent, for %s", async (_, userinfo) => {
    const base = await serve(200);

    const err = await failure(base.replace("http://", `http://${userinfo}`));

    expect(err.code).toBe("SPEC_CREDENTIALS_IN_URL");
    expect(err.refused).toBe(true);
    expect(err.message).toContain("auth");
    expect(err.message).not.toContain("hunter2-pw");
    expect(JSON.stringify(err.context ?? {})).not.toContain("hunter2-pw");
    expect(requested).toEqual([]);
  });

  it("is named without its secret parameter when the host fails it", async () => {
    const base = await serve(404);

    const err = await failure(`${base}/openapi.json?api_key=s3cret-key-1234&page=2`);

    expect(err.code).toBe("SPEC_HTTP_STATUS");
    expect(err.message).not.toContain("s3cret-key-1234");
    expect(err.message).toContain("page=2");
    expect(JSON.stringify(err.context ?? {})).not.toContain("s3cret-key-1234");
  });
});
