/**
 * Started as the guide says — `NODE_USE_ENV_PROXY=1`, the proxy in
 * `HTTPS_PROXY`, the authority of a TLS-inspecting proxy in
 * `NODE_EXTRA_CA_CERTS` — Studio fetches a specification from a host only
 * the proxy can reach, through a tunnel, over TLS it verifies. Without the
 * authority it says how to trust it; without the switch it says to set it.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:https";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type ForwardProxy, startForwardProxy } from "../../core/tests/helpers/forward-proxy";
import { testCertificates } from "../../core/tests/helpers/test-certificates";

const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
/* Past the 60 s Studio gives a fetch: a fetch that stalls ends with Studio's
   own reason, rather than with its process stopped and nothing said. */
const CHILD_TIMEOUT_MS = 75_000;
const HOST = "openapi.courier.invalid";
const certificates = testCertificates([HOST]);

let server: Server;
let proxy: ForwardProxy;
let directory: string;
let script: string;
let caFile: string;

beforeAll(async () => {
  server = createServer(certificates.server, (_req, res) => res.end("openapi: 3.1.0"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  /* The proxy resolves the name this machine cannot, as a corporate proxy does. */
  proxy = await startForwardProxy({ reach: () => ({ host: "127.0.0.1", port }) });
  directory = mkdtempSync(join(tmpdir(), "courier-spec-proxy-"));
  caFile = join(directory, "ca.pem");
  writeFileSync(caFile, certificates.ca);
  script = join(directory, "fetch.mts");
  const fetchSpec = pathToFileURL(join(__dirname, "../src/server/fetch-spec.ts")).href;
  writeFileSync(
    script,
    `import { fetchSpec } from ${JSON.stringify(fetchSpec)};
const allowlist = async () => ({ state: "listed", hosts: [] });
try {
  process.stdout.write(JSON.stringify({ text: await fetchSpec("https://${HOST}/openapi.json", allowlist) }));
} catch (error) {
  process.stdout.write(JSON.stringify({ code: error.code, message: error.message }));
}
process.exit(0);
`,
  );
});

afterAll(async () => {
  rmSync(directory, { recursive: true, force: true });
  await proxy.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function studioFetch(
  env: Record<string, string>,
): Promise<{ text?: string; code?: string; message?: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ["--import", TSX, script],
      {
        /* Only what the test names: the developer's own proxy variables must not reach it. */
        env: { NODE_ENV: "test", PATH: process.env.PATH, HTTPS_PROXY: proxy.url, ...env },
        encoding: "utf8",
        timeout: CHILD_TIMEOUT_MS,
      },
      (error, stdout, stderr) =>
        error
          ? reject(
              new Error(
                `${error.message}\nstdout: ${stdout}\nstderr: ${stderr}\nthe proxy saw: ${proxy.seen.join(", ")}`,
              ),
            )
          : resolve(JSON.parse(stdout)),
    );
  });
}

describe("Studio started behind a proxy", { timeout: CHILD_TIMEOUT_MS + 5_000 }, () => {
  it("fetches through it, over TLS signed by the authority NODE_EXTRA_CA_CERTS names", async () => {
    proxy.seen.length = 0;

    const fetched = await studioFetch({ NODE_USE_ENV_PROXY: "1", NODE_EXTRA_CA_CERTS: caFile });

    expect(fetched).toEqual({ text: "openapi: 3.1.0" });
    expect(proxy.seen).toEqual([`CONNECT ${HOST}:443`]);
  });

  it("says how to trust the authority it was not given", async () => {
    const fetched = await studioFetch({ NODE_USE_ENV_PROXY: "1" });

    expect(fetched).toMatchObject({
      code: "SPEC_UNREACHABLE",
      message: expect.stringContaining(
        `${HOST} could not be reached through the proxy at ${proxy.url}`,
      ),
    });
    expect(fetched.message).toContain("NODE_EXTRA_CA_CERTS");
  });

  it("says to start it with NODE_USE_ENV_PROXY=1 when Node was not told to use the proxy", async () => {
    proxy.seen.length = 0;

    const fetched = await studioFetch({ NODE_EXTRA_CA_CERTS: caFile });

    expect(fetched).toMatchObject({
      code: "SPEC_UNREACHABLE",
      message: expect.stringContaining("only when started with NODE_USE_ENV_PROXY=1"),
    });
    expect(proxy.seen).toEqual([]);
  });
});
